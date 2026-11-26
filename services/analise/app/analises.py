"""Análise de situação de uma região: chain do LangChain com tools.

As tools consultam dados reais do Pluvia por HTTP: a região no Território e o
panorama de risco no Risco. O fluxo é fixo, por isso é uma chain e não um
agente:

1. prompt | modelo com as tools ligadas: o modelo pede as consultas;
2. as tools são executadas e os resultados voltam ao modelo como ToolMessage;
3. o modelo escreve a síntese a partir desses dados.

Se o modelo estiver indisponível (``LLMIndisponivel``), a síntese é montada
por regra com os mesmos dados das tools, e a resposta sai com origem FALLBACK.
"""

import json
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import BaseTool, tool

from app.llm import ClienteLLM, LLMIndisponivel

INDISPONIVEL = "dado indisponível"


@dataclass(frozen=True)
class ConfigFontes:
    TERRITORIO_URL: str
    RISCO_URL: str
    FONTES_TIMEOUT_S: float


def ler_config_fontes(config: Mapping[str, str]) -> ConfigFontes:
    """Falha nomeando todas as variáveis ausentes ou inválidas de uma vez."""
    nomes = ("TERRITORIO_URL", "RISCO_URL", "FONTES_TIMEOUT_S")
    ausentes = [n for n in nomes if not config.get(n)]
    if ausentes:
        raise ValueError(f"Variáveis de ambiente ausentes: {', '.join(ausentes)}")
    try:
        timeout = float(config["FONTES_TIMEOUT_S"])
    except ValueError as erro:
        raise ValueError("Variáveis de ambiente inválidas: FONTES_TIMEOUT_S") from erro
    return ConfigFontes(config["TERRITORIO_URL"].rstrip("/"), config["RISCO_URL"].rstrip("/"), timeout)


class FontesPluvia:
    """Leitura dos dados de outros serviços. Nunca levanta: falha vira ``dado indisponível``."""

    def __init__(self, config: ConfigFontes) -> None:
        self._config = config

    async def regiao(self, regiao_id: str) -> dict[str, Any]:
        corpo = await self._get(f"{self._config.TERRITORIO_URL}/v1/regioes/{regiao_id}")
        if "erro" in corpo:
            return corpo
        return {
            "regiaoId": corpo.get("id"),
            "nome": corpo.get("nome"),
            "municipio": corpo.get("municipio"),
            "uf": corpo.get("uf"),
            "caracteristicas": corpo.get("caracteristicas"),
        }

    async def risco(self, regiao_id: str) -> dict[str, Any]:
        corpo = await self._get(f"{self._config.RISCO_URL}/v1/panoramas/{regiao_id}")
        if "erro" in corpo:
            return corpo
        return {
            "regiaoId": corpo.get("regiaoId"),
            "nivelAtencao": corpo.get("nivelAtencao"),
            "sinalizacoesAbertas": corpo.get("sinalizacoesAbertas"),
            "fatores": corpo.get("fatores", []),
            "atualizadoEm": corpo.get("atualizadoEm"),
        }

    async def _get(self, url: str) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._config.FONTES_TIMEOUT_S) as cliente:
                resposta = await cliente.get(url)
        except httpx.HTTPError as erro:
            return {"erro": INDISPONIVEL, "motivo": type(erro).__name__}
        if resposta.status_code == 404:
            return {"erro": INDISPONIVEL, "motivo": "não encontrado"}
        if resposta.status_code != 200:
            return {"erro": INDISPONIVEL, "motivo": f"HTTP {resposta.status_code}"}
        try:
            return resposta.json()
        except ValueError:
            return {"erro": INDISPONIVEL, "motivo": "resposta não é JSON"}


def criar_ferramentas(fontes: FontesPluvia) -> list[BaseTool]:
    @tool
    async def consultar_regiao(regiao_id: str) -> str:
        """Consulta no Território o nome, o município e as características físicas
        (área, curso d'água, declividade, ocupação) de uma região de Lavras/MG."""
        return json.dumps(await fontes.regiao(regiao_id), ensure_ascii=False)

    @tool
    async def consultar_risco(regiao_id: str) -> str:
        """Consulta no Risco o panorama atual da região: nível de atenção,
        sinalizações abertas e fatores que levaram ao nível."""
        return json.dumps(await fontes.risco(regiao_id), ensure_ascii=False)

    return [consultar_regiao, consultar_risco]


TIPOS = {
    "SITUACAO_ATUAL": "a situação atual",
    "CENARIO_PREVISTO": "o cenário previsto para as próximas horas",
}

PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "Você é o analista do Pluvia, sistema de prevenção de alagamentos de Lavras/MG, "
            "e escreve para a equipe técnica da prefeitura. Antes de responder, use as "
            "ferramentas consultar_regiao e consultar_risco com o id da região. Use SOMENTE "
            "os dados devolvidos pelas ferramentas; não invente números. Se uma ferramenta "
            "devolver 'dado indisponível', diga que o dado não está disponível. Responda em "
            "português do Brasil, em no máximo 5 frases, citando o nome da região e o nível "
            "de atenção.",
        ),
        ("human", "Analise {descricao} da região {regiao_id}."),
    ]
)


@dataclass
class Analise:
    regiao_id: str
    tipo: str
    sintese: str
    fontes: list[dict[str, str]]
    origem: str
    modelo: str | None
    latencia_ms: int
    gerada_em: str

    def json(self) -> dict[str, Any]:
        return {
            "id": str(uuid4()),
            "regiaoId": self.regiao_id,
            "tipo": self.tipo,
            "sintese": self.sintese,
            "fontes": self.fontes,
            "origem": self.origem,
            "modelo": self.modelo,
            "latenciaMs": self.latencia_ms,
            "geradaEm": self.gerada_em,
        }


def sintese_por_regra(tipo: str, regiao: dict[str, Any], risco: dict[str, Any]) -> str:
    """Texto fixo com os dados das tools, usado quando o modelo não responde."""
    partes = ["Síntese automática, sem o modelo de linguagem, que está indisponível."]
    if "erro" in regiao:
        partes.append(f"Dados da região: {INDISPONIVEL}.")
    else:
        c = regiao.get("caracteristicas") or {}
        detalhes = []
        if c.get("areaKm2") is not None:
            detalhes.append(f"área de {c['areaKm2']} km²")
        if c.get("proximidadeCursoAgua") is not None:
            detalhes.append("próxima a curso d'água" if c["proximidadeCursoAgua"] else "sem curso d'água próximo")
        if c.get("declividadeMediaPct") is not None:
            detalhes.append(f"declividade média de {c['declividadeMediaPct']}%")
        if c.get("tipoOcupacao"):
            detalhes.append(f"ocupação {str(c['tipoOcupacao']).lower()}")
        local = f"{regiao.get('nome')} ({regiao.get('municipio')}/{regiao.get('uf')})"
        partes.append(f"Região {local}" + (f": {', '.join(detalhes)}." if detalhes else "."))
    if "erro" in risco:
        partes.append(f"Nível de atenção: {INDISPONIVEL}.")
    else:
        abertas = risco.get("sinalizacoesAbertas") or 0
        partes.append(
            f"Nível de atenção atual: {risco.get('nivelAtencao')}, com {abertas} sinalização(ões) aberta(s)."
        )
    if tipo == "CENARIO_PREVISTO":
        partes.append("A previsão não pôde ser interpretada sem o modelo; consulte o boletim do Monitoramento.")
    return " ".join(partes)


def _fontes(regiao_id: str, regiao: dict[str, Any], risco: dict[str, Any], em: str) -> list[dict[str, str]]:
    fontes = []
    if "erro" not in regiao:
        fontes.append({"nome": "Território", "referencia": f"GET /v1/regioes/{regiao_id}, consulta em {em}"})
    if "erro" not in risco:
        fontes.append({"nome": "Risco", "referencia": f"GET /v1/panoramas/{regiao_id}, consulta em {em}"})
    return fontes


class ServicoAnalises:
    def __init__(self, llm: ClienteLLM, fontes: FontesPluvia) -> None:
        self._llm = llm
        self._fontes = fontes
        self._ferramentas = {f.name: f for f in criar_ferramentas(fontes)}
        self._pedir_dados = PROMPT | llm.chat_com_ferramentas(list(self._ferramentas.values()))
        self._sintetizar = llm.chat() | StrOutputParser()

    async def analisar(self, regiao_id: str, tipo: str) -> Analise:
        inicio = time.perf_counter()
        consultado_em = datetime.now(UTC).isoformat(timespec="seconds")
        entrada = {"descricao": TIPOS[tipo], "regiao_id": regiao_id}
        dados: dict[str, dict[str, Any]] = {}
        try:
            pedido: AIMessage = await self._llm.executar(self._pedir_dados, entrada)
            mensagens: list[BaseMessage] = [*PROMPT.format_messages(**entrada), pedido]
            mensagens += await self._executar_ferramentas(pedido, regiao_id, dados)
            sintese: str = await self._llm.executar(self._sintetizar, mensagens)
            origem, modelo = "LLM", self._llm.modelo
        except LLMIndisponivel:
            for nome in self._ferramentas:
                if nome not in dados:
                    dados[nome] = json.loads(await self._ferramentas[nome].ainvoke({"regiao_id": regiao_id}))
            sintese = sintese_por_regra(tipo, dados["consultar_regiao"], dados["consultar_risco"])
            origem, modelo = "FALLBACK", None
        return Analise(
            regiao_id=regiao_id,
            tipo=tipo,
            sintese=sintese.strip(),
            fontes=_fontes(regiao_id, dados["consultar_regiao"], dados["consultar_risco"], consultado_em),
            origem=origem,
            modelo=modelo,
            latencia_ms=round((time.perf_counter() - inicio) * 1000),
            gerada_em=datetime.now(UTC).isoformat(),
        )

    async def _executar_ferramentas(
        self, pedido: AIMessage, regiao_id: str, dados: dict[str, dict[str, Any]]
    ) -> list[BaseMessage]:
        """Roda as tool calls do modelo e devolve as mensagens com os resultados.

        A região é a da requisição: o id que o modelo escreveu no argumento não é
        usado, para um modelo pequeno não consultar a região errada. Uma tool que o
        modelo não pediu é executada mesmo assim e entra como dado adicional, porque
        a síntese sempre precisa da região e do risco.
        """
        respostas: list[BaseMessage] = []
        for chamada in pedido.tool_calls:
            ferramenta = self._ferramentas.get(chamada["name"])
            if ferramenta is None or chamada["name"] in dados:
                conteudo = json.dumps({"erro": "ferramenta desconhecida ou repetida"})
            else:
                conteudo = await ferramenta.ainvoke({"regiao_id": regiao_id})
                dados[chamada["name"]] = json.loads(conteudo)
            respostas.append(ToolMessage(content=conteudo, tool_call_id=chamada["id"]))

        faltantes = [nome for nome in self._ferramentas if nome not in dados]
        if faltantes:
            extras = {}
            for nome in faltantes:
                conteudo = await self._ferramentas[nome].ainvoke({"regiao_id": regiao_id})
                dados[nome] = json.loads(conteudo)
                extras[nome] = dados[nome]
            respostas.append(
                HumanMessage(content="Dados das ferramentas: " + json.dumps(extras, ensure_ascii=False))
            )
        return respostas
