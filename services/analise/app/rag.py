"""Consulta à base de conhecimento: recuperação + geração, com cache e fallback.

Fluxo de uma pergunta:
1. Cache: a mesma pergunta respondida há pouco volta sem chamar o modelo (CACHE).
2. Recuperação: busca semântica no pgvector; se o modelo de embeddings cair, busca
   por palavras-chave no PostgreSQL.
3. Geração: chain do LangChain (prompt | modelo | parser), protegida por timeout,
   retry e circuit breaker (LLM).
4. Fallback: se a geração falhar, devolve os trechos recuperados com um texto
   montado sem o modelo (FALLBACK). Sem trechos, não há o que devolver: 503.
"""

import hashlib
import time
from dataclasses import dataclass, field
from typing import Any

from cachetools import TTLCache
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.base_conhecimento import RecuperadorPluvia, Trecho
from app.llm import ClienteLLM, LLMIndisponivel

INSTRUCOES = (
    "Você é o assistente técnico do Pluvia, sistema de prevenção de alagamentos "
    "de Lavras/MG usado pela equipe da prefeitura. Responda em português do Brasil, "
    "de forma objetiva, em no máximo 5 frases."
)

PROMPT_COM_RECUPERACAO = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            INSTRUCOES
            + " Use SOMENTE as informações do contexto. Se o contexto não tiver a "
            "resposta, diga que a base de conhecimento não cobre o assunto. "
            "Termine indicando entre colchetes os títulos dos documentos usados.",
        ),
        ("human", "Contexto:\n{contexto}\n\nPergunta: {pergunta}"),
    ]
)

PROMPT_SEM_RECUPERACAO = ChatPromptTemplate.from_messages(
    [("system", INSTRUCOES), ("human", "{pergunta}")]
)


class SemResposta(Exception):
    """O modelo está fora e não há trechos para montar uma resposta de fallback."""


@dataclass
class Resposta:
    resposta: str
    trechos: list[Trecho]
    origem: str
    modelo: str | None
    latencia_ms: int = 0
    busca_degradada: bool = False
    etapas_ms: dict[str, int] = field(default_factory=dict)

    def json(self) -> dict[str, Any]:
        return {
            "resposta": self.resposta,
            "trechos": [t.json() for t in self.trechos],
            "origem": self.origem,
            "modelo": self.modelo,
            "latenciaMs": self.latencia_ms,
            "buscaDegradada": self.busca_degradada,
            "etapasMs": self.etapas_ms,
        }


def formatar_contexto(trechos: list[Trecho]) -> str:
    return "\n\n".join(f"[{t.titulo}]\n{t.conteudo}" for t in trechos)


def resposta_de_fallback(trechos: list[Trecho]) -> str:
    itens = "\n".join(f"- [{t.titulo}] {t.conteudo[:300].strip()}" for t in trechos)
    return (
        "O modelo de linguagem está indisponível no momento. "
        "Estes são os trechos da base de conhecimento mais relacionados à pergunta:\n"
        + itens
    )


class ServicoConsultas:
    def __init__(
        self, llm: ClienteLLM, recuperador: RecuperadorPluvia, cache_ttl_s: int, cache_tamanho: int
    ) -> None:
        self._llm = llm
        self._recuperador = recuperador
        self._cache: TTLCache[str, Resposta] = TTLCache(maxsize=cache_tamanho, ttl=cache_ttl_s)
        parser = StrOutputParser()
        self._chain_rag = PROMPT_COM_RECUPERACAO | llm.chat() | parser
        self._chain_direta = PROMPT_SEM_RECUPERACAO | llm.chat() | parser

    @property
    def itens_em_cache(self) -> int:
        return len(self._cache)

    async def consultar(
        self, pergunta: str, usar_recuperacao: bool = True, usar_cache: bool = True
    ) -> Resposta:
        inicio = time.perf_counter()
        chave = self._chave(pergunta, usar_recuperacao)

        if usar_cache and (guardada := self._cache.get(chave)):
            return Resposta(
                guardada.resposta,
                guardada.trechos,
                "CACHE",
                guardada.modelo,
                _ms(inicio),
                guardada.busca_degradada,
            )

        etapas: dict[str, int] = {}
        trechos: list[Trecho] = []
        degradada = False
        if usar_recuperacao:
            marco = time.perf_counter()
            trechos, degradada = await self._recuperador.buscar_com_degradacao(pergunta)
            etapas["recuperacao"] = _ms(marco)

        marco = time.perf_counter()
        try:
            if usar_recuperacao:
                texto = await self._llm.executar(
                    self._chain_rag,
                    {"contexto": formatar_contexto(trechos), "pergunta": pergunta},
                )
            else:
                texto = await self._llm.executar(self._chain_direta, {"pergunta": pergunta})
        except LLMIndisponivel as erro:
            if not trechos:
                raise SemResposta(str(erro)) from erro
            return Resposta(
                resposta_de_fallback(trechos), trechos, "FALLBACK", None, _ms(inicio), degradada
            )
        etapas["geracao"] = _ms(marco)

        resposta = Resposta(
            texto.strip(), trechos, "LLM", self._llm.modelo, _ms(inicio), degradada, etapas
        )
        if not degradada:
            self._cache[chave] = resposta
        return resposta

    def _chave(self, pergunta: str, usar_recuperacao: bool) -> str:
        normalizada = " ".join(pergunta.lower().split())
        bruto = f"{self._llm.modelo}|{usar_recuperacao}|{normalizada}"
        return hashlib.sha256(bruto.encode("utf-8")).hexdigest()


def _ms(inicio: float) -> int:
    return round((time.perf_counter() - inicio) * 1000)
