"""Cliente do provedor de LLM (Ollama) tratado como dependência remota falível.

Mecanismos aplicados a toda chamada:
- timeout por tentativa (``LLM_TIMEOUT_S``);
- retry com backoff exponencial e jitter (``LLM_TENTATIVAS``), só para falhas de rede;
- circuit breaker (``CIRCUITO_FALHAS`` / ``CIRCUITO_ESPERA_S``), que recusa
  chamadas sem esperar o timeout enquanto o provedor está fora.

Qualquer falha chega a quem chama como ``LLMIndisponivel``. O cache e o fallback
ficam em ``rag.py``, que decide o que responder quando o modelo não responde.
"""

from collections.abc import Sequence
from typing import Any

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langchain_ollama import ChatOllama, OllamaEmbeddings
from ollama import ResponseError

from app.config_llm import ConfigLLM
from app.resiliencia import CircuitBreaker, CircuitoAberto, EstadoCircuito

# Falhas transitórias, que valem nova tentativa. Erro de modelo inexistente
# (ResponseError) não melhora repetindo, então derruba direto.
FALHAS_TRANSITORIAS = (httpx.TransportError, ConnectionError)


class LLMIndisponivel(Exception):
    """O provedor de LLM não respondeu: fora do ar, lento demais ou circuito aberto."""


class ClienteLLM:
    def __init__(self, config: ConfigLLM) -> None:
        cliente_http = {"timeout": config.LLM_TIMEOUT_S}
        self.modelo = config.LLM_MODELO
        self.modelo_embedding = config.EMBEDDING_MODELO
        self._config = config
        self._chat = ChatOllama(
            model=config.LLM_MODELO,
            base_url=config.OLLAMA_URL,
            temperature=config.LLM_TEMPERATURA,
            client_kwargs=cliente_http,
        )
        self._embeddings = OllamaEmbeddings(
            model=config.EMBEDDING_MODELO,
            base_url=config.OLLAMA_URL,
            client_kwargs=cliente_http,
        )
        self._circuito = CircuitBreaker(config.CIRCUITO_FALHAS, config.CIRCUITO_ESPERA_S)

    @property
    def estado_circuito(self) -> EstadoCircuito:
        return self._circuito.estado

    def chat(self) -> Runnable:
        """Modelo de chat com retry, para compor chains (prompt | chat | parser)."""
        return self._com_retry(self._chat)

    def chat_com_ferramentas(self, ferramentas: Sequence[BaseTool]) -> Runnable:
        """Modelo de chat que pode chamar tools do LangChain, também com retry."""
        return self._com_retry(self._chat.bind_tools(ferramentas))

    async def executar(self, runnable: Runnable, entrada: Any) -> Any:
        """Executa uma chain que usa o modelo, protegida pelo circuit breaker."""
        return await self._proteger(lambda: runnable.ainvoke(entrada))

    async def aquecer(self) -> None:
        """Carrega o modelo de geração na memória do Ollama com uma chamada curta.

        Sem isso, a primeira pergunta paga o carregamento do modelo do disco.
        """
        await self.executar(self.chat(), "Responda apenas: ok")

    async def embedding_consulta(self, texto: str) -> list[float]:
        return await self._proteger(lambda: self._embeddings.aembed_query(texto))

    async def embeddings_documentos(self, textos: list[str]) -> list[list[float]]:
        return await self._proteger(lambda: self._embeddings.aembed_documents(textos))

    def _com_retry(self, modelo: BaseChatModel | Runnable) -> Runnable:
        return modelo.with_retry(
            retry_if_exception_type=FALHAS_TRANSITORIAS,
            wait_exponential_jitter=True,
            stop_after_attempt=self._config.LLM_TENTATIVAS,
        )

    async def _proteger(self, chamada: Any) -> Any:
        try:
            return await self._circuito.chamar(chamada)
        except CircuitoAberto as erro:
            raise LLMIndisponivel(str(erro)) from erro
        except (httpx.HTTPError, ResponseError, ConnectionError) as erro:
            raise LLMIndisponivel(f"{type(erro).__name__}: {erro}") from erro
