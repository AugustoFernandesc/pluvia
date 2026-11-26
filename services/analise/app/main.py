"""Montagem da aplicação FastAPI."""

import asyncio
import contextlib
import logging
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response

from app import api, health
from app.llm import LLMIndisponivel

log = logging.getLogger(__name__)


async def _preparar(servicos: api.Servicos, base_conhecimento: Path) -> None:
    """Indexa a base de conhecimento e deixa o modelo carregado para a primeira pergunta."""
    await servicos.ingestor.manter_base_local(base_conhecimento)
    try:
        await servicos.llm.aquecer()
        log.info("modelo %s carregado", servicos.llm.modelo)
    except LLMIndisponivel as erro:
        log.info("modelo não aquecido (%s); a primeira pergunta vai carregá-lo", erro)
        return
    total = await servicos.analises.preaquecer()
    log.info("sínteses de %s regiões geradas e guardadas em cache", total)


# Identifica a réplica que respondeu. No Kubernetes, o hostname é o nome do pod,
# o que permite ver a carga sendo dividida entre as réplicas com um simples curl.
CABECALHO_REPLICA = "X-Atendido-Por"


def criar_app(
    banco: health.VerificaBanco,
    servicos: api.Servicos | None = None,
    base_conhecimento: Path | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        abrir = getattr(banco, "abrir", None)
        if abrir is not None:
            await abrir()
        indexacao = None
        if servicos is not None and base_conhecimento is not None:
            indexacao = asyncio.create_task(_preparar(servicos, base_conhecimento))
        try:
            yield
        finally:
            if indexacao is not None:
                indexacao.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await indexacao
            fechar = getattr(banco, "fechar", None)
            if fechar is not None:
                await fechar()

    app = FastAPI(title="Pluvia · Análise", lifespan=ciclo_de_vida)
    app.state.banco = banco
    app.state.servicos = servicos
    replica = socket.gethostname()

    @app.middleware("http")
    async def identificar_replica(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        resposta = await call_next(request)
        resposta.headers[CABECALHO_REPLICA] = replica
        return resposta

    app.include_router(health.router)

    if servicos is not None:
        app.include_router(api.router)

    return app
