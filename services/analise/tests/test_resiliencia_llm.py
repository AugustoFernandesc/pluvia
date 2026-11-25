import time
from uuid import uuid4

import pytest

from app.base_conhecimento import Trecho
from app.config_llm import ConfigLLM, ler_config_llm
from app.llm import ClienteLLM, LLMIndisponivel
from app.rag import SemResposta, ServicoConsultas
from app.resiliencia import CircuitBreaker, CircuitoAberto, EstadoCircuito

# Os testes assíncronos usam o plugin do anyio, que já vem com o FastAPI.
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# Porta 9 (discard) fechada: conexão recusada de verdade, sem mock do cliente HTTP.
OLLAMA_FORA_DO_AR = {
    "OLLAMA_URL": "http://127.0.0.1:9",
    "LLM_MODELO": "qwen2.5:3b",
    "LLM_TEMPERATURA": "0.1",
    "LLM_TIMEOUT_S": "2",
    "LLM_TENTATIVAS": "2",
    "EMBEDDING_MODELO": "bge-m3",
    "EMBEDDING_DIMENSAO": "1024",
    "CIRCUITO_FALHAS": "2",
    "CIRCUITO_ESPERA_S": "30",
    "CACHE_TTL_S": "60",
    "CACHE_TAMANHO": "10",
    "RAG_TRECHOS": "4",
    "BASE_CONHECIMENTO_DIR": "conhecimento",
}


class Relogio:
    def __init__(self) -> None:
        self.agora = 0.0

    def __call__(self) -> float:
        return self.agora


async def falhar() -> None:
    raise ConnectionError("recusada")


async def funcionar() -> str:
    return "ok"


async def test_circuito_abre_apos_falhas_seguidas_e_fecha_depois_do_teste():
    relogio = Relogio()
    circuito = CircuitBreaker(falhas_max=2, espera_s=30, relogio=relogio)

    for _ in range(2):
        with pytest.raises(ConnectionError):
            await circuito.chamar(falhar)
    assert circuito.estado is EstadoCircuito.ABERTO
    with pytest.raises(CircuitoAberto):
        await circuito.chamar(funcionar)

    relogio.agora = 31
    assert circuito.estado is EstadoCircuito.MEIO_ABERTO
    assert await circuito.chamar(funcionar) == "ok"
    assert circuito.estado is EstadoCircuito.FECHADO


async def test_falha_no_meio_aberto_reabre_o_circuito():
    relogio = Relogio()
    circuito = CircuitBreaker(falhas_max=1, espera_s=30, relogio=relogio)
    with pytest.raises(ConnectionError):
        await circuito.chamar(falhar)

    relogio.agora = 31
    with pytest.raises(ConnectionError):
        await circuito.chamar(falhar)
    assert circuito.estado is EstadoCircuito.ABERTO


def test_config_nomeia_variaveis_ausentes_e_invalidas():
    with pytest.raises(ValueError, match="LLM_MODELO"):
        ler_config_llm({k: v for k, v in OLLAMA_FORA_DO_AR.items() if k != "LLM_MODELO"})
    with pytest.raises(ValueError, match="LLM_TIMEOUT_S"):
        ler_config_llm({**OLLAMA_FORA_DO_AR, "LLM_TIMEOUT_S": "rapido"})
    assert ler_config_llm(OLLAMA_FORA_DO_AR).LLM_TENTATIVAS == 2


@pytest.fixture
def config() -> ConfigLLM:
    return ler_config_llm(OLLAMA_FORA_DO_AR)


async def test_ollama_fora_do_ar_abre_o_circuito_e_passa_a_falhar_rapido(config):
    llm = ClienteLLM(config)

    for _ in range(config.CIRCUITO_FALHAS):
        with pytest.raises(LLMIndisponivel):
            await llm.embedding_consulta("chuva forte")
    assert llm.estado_circuito is EstadoCircuito.ABERTO

    inicio = time.perf_counter()
    with pytest.raises(LLMIndisponivel, match="circuito aberto"):
        await llm.embedding_consulta("chuva forte")
    assert time.perf_counter() - inicio < 0.05


class RecuperadorDegradado:
    """Simula o banco devolvendo a busca por palavras-chave."""

    def __init__(self, trechos: list[Trecho]) -> None:
        self.trechos = trechos

    async def buscar_com_degradacao(self, pergunta: str) -> tuple[list[Trecho], bool]:
        return self.trechos, True


async def test_sem_modelo_responde_com_os_trechos_recuperados(config):
    trecho = Trecho(uuid4(), "Níveis de atenção", "O percentil 85 marca ATENCAO.", 0.4)
    servico = ServicoConsultas(ClienteLLM(config), RecuperadorDegradado([trecho]), 60, 10)

    resposta = await servico.consultar("Quando a região entra em atenção?")

    assert resposta.origem == "FALLBACK"
    assert resposta.busca_degradada
    assert "percentil 85" in resposta.resposta
    assert resposta.json()["trechos"][0]["titulo"] == "Níveis de atenção"


async def test_sem_modelo_e_sem_trechos_nao_ha_resposta(config):
    servico = ServicoConsultas(ClienteLLM(config), RecuperadorDegradado([]), 60, 10)

    with pytest.raises(SemResposta):
        await servico.consultar("Quando a região entra em atenção?")
    with pytest.raises(SemResposta):
        await servico.consultar("Quando a região entra em atenção?", usar_recuperacao=False)
