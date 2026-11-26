"""Tools e análise contra um servidor HTTP falso que responde de verdade.

O servidor faz o papel do Território e do Risco. Nada é mockado: as tools
fazem requisições HTTP reais, e o Ollama aponta para uma porta fechada, como
em test_resiliencia_llm.py, para forçar o fallback.
"""

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app.analises import ConfigFontes, FontesPluvia, ServicoAnalises, criar_ferramentas, ler_config_fontes
from app.config_llm import ler_config_llm
from app.llm import ClienteLLM
from tests.test_resiliencia_llm import OLLAMA_FORA_DO_AR

pytestmark = pytest.mark.anyio

CENTRO = "6f1c2a10-0000-4000-8000-000000000001"
SEM_PANORAMA = "6f1c2a10-0000-4000-8000-000000000005"
# Porta 9 (discard) fechada: conexão recusada de verdade.
FORA_DO_AR = "http://127.0.0.1:9"

REGIOES = {
    CENTRO: {
        "id": CENTRO,
        "codigo": "LAV-CENTRO",
        "nome": "Centro",
        "municipio": "Lavras",
        "uf": "MG",
        "geometria": {"type": "Polygon", "coordinates": []},
        "caracteristicas": {
            "areaKm2": 1.1,
            "proximidadeCursoAgua": True,
            "declividadeMediaPct": 6,
            "tipoOcupacao": "COMERCIAL",
        },
    },
    SEM_PANORAMA: {"id": SEM_PANORAMA, "nome": "Zona Oeste", "municipio": "Lavras", "uf": "MG", "caracteristicas": None},
}
PANORAMAS = {
    CENTRO: {
        "regiaoId": CENTRO,
        "regiaoNome": "Centro",
        "municipio": "Lavras",
        "nivelAtencao": "ALERTA",
        "sinalizacoesAbertas": 2,
        "fatores": [{"tipo": "CHUVA_ACUMULADA", "valor": 62}],
        "sinalizacoes": [],
        "atualizadoEm": "2026-11-25T20:00:00Z",
        "versao": 3,
    }
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        partes = self.path.strip("/").split("/")
        corpo = None
        if partes[:2] == ["v1", "regioes"] and len(partes) == 3:
            corpo = REGIOES.get(partes[2])
        elif partes[:2] == ["v1", "panoramas"] and len(partes) == 3:
            corpo = PANORAMAS.get(partes[2])
        if corpo is None:
            self.send_response(404)
            self.send_header("Content-Type", "application/problem+json")
            self.end_headers()
            self.wfile.write(b'{"status":404}')
            return
        dados = json.dumps(corpo).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="module")
def servidor() -> Iterator[str]:
    http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{http.server_address[1]}"
    http.shutdown()


def ferramentas(territorio: str, risco: str) -> dict:
    fontes = FontesPluvia(ConfigFontes(territorio, risco, 2))
    return {f.name: f for f in criar_ferramentas(fontes)}


async def test_consultar_regiao_devolve_nome_e_caracteristicas(servidor: str):
    tools = ferramentas(servidor, servidor)

    regiao = json.loads(await tools["consultar_regiao"].ainvoke({"regiao_id": CENTRO}))

    assert regiao["nome"] == "Centro"
    assert regiao["municipio"] == "Lavras"
    assert regiao["caracteristicas"]["areaKm2"] == 1.1
    assert "geometria" not in regiao


async def test_consultar_risco_devolve_nivel_de_atencao(servidor: str):
    tools = ferramentas(servidor, servidor)

    risco = json.loads(await tools["consultar_risco"].ainvoke({"regiao_id": CENTRO}))

    assert risco["nivelAtencao"] == "ALERTA"
    assert risco["sinalizacoesAbertas"] == 2


async def test_consultar_risco_com_servico_fora_do_ar_devolve_dado_indisponivel(servidor: str):
    tools = ferramentas(servidor, FORA_DO_AR)

    risco = json.loads(await tools["consultar_risco"].ainvoke({"regiao_id": CENTRO}))

    assert risco["erro"] == "dado indisponível"


async def test_panorama_inexistente_devolve_dado_indisponivel(servidor: str):
    tools = ferramentas(servidor, servidor)

    risco = json.loads(await tools["consultar_risco"].ainvoke({"regiao_id": SEM_PANORAMA}))

    assert risco == {"erro": "dado indisponível", "motivo": "não encontrado"}


def servico(territorio: str, risco: str) -> ServicoAnalises:
    llm = ClienteLLM(ler_config_llm(OLLAMA_FORA_DO_AR))
    return ServicoAnalises(llm, FontesPluvia(ConfigFontes(territorio, risco, 2)))


async def test_sem_modelo_a_sintese_vem_por_regra_com_regiao_e_nivel(servidor: str):
    analise = (await servico(servidor, servidor).analisar(CENTRO, "SITUACAO_ATUAL")).json()

    assert analise["origem"] == "FALLBACK"
    assert analise["modelo"] is None
    assert "Centro (Lavras/MG)" in analise["sintese"]
    assert "ALERTA" in analise["sintese"]
    assert "próxima a curso d'água" in analise["sintese"]
    assert [f["nome"] for f in analise["fontes"]] == ["Território", "Risco"]
    assert analise["regiaoId"] == CENTRO
    assert analise["latenciaMs"] >= 0


async def test_sem_modelo_e_sem_risco_a_sintese_diz_que_o_nivel_esta_indisponivel(servidor: str):
    analise = (await servico(servidor, FORA_DO_AR).analisar(CENTRO, "SITUACAO_ATUAL")).json()

    assert analise["origem"] == "FALLBACK"
    assert "Nível de atenção: dado indisponível" in analise["sintese"]
    assert [f["nome"] for f in analise["fontes"]] == ["Território"]


def test_config_das_fontes_nomeia_as_variaveis_ausentes():
    with pytest.raises(ValueError, match="TERRITORIO_URL, RISCO_URL, FONTES_TIMEOUT_S"):
        ler_config_fontes({})
