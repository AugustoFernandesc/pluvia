"""Montagem da aplicação FastAPI."""

import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request, Response

from app import health

# Identifica a réplica que respondeu. No Kubernetes, o hostname é o nome do pod,
# o que permite ver a carga sendo dividida entre as réplicas com um simples curl.
CABECALHO_REPLICA = "X-Atendido-Por"


def criar_app(banco: health.VerificaBanco) -> FastAPI:
    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        abrir = getattr(banco, "abrir", None)
        if abrir is not None:
            await abrir()
        try:
            yield
        finally:
            fechar = getattr(banco, "fechar", None)
            if fechar is not None:
                await fechar()

    app = FastAPI(title="Pluvia · Análise", lifespan=ciclo_de_vida)
    app.state.banco = banco
    replica = socket.gethostname()

    @app.middleware("http")
    async def identificar_replica(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        resposta = await call_next(request)
        resposta.headers[CABECALHO_REPLICA] = replica
        return resposta

    app.include_router(health.router)

    # As rotas da API (docs/api/analise.yaml) entram neste router, com o prefixo /v1.
    v1 = APIRouter(prefix="/v1")
    app.include_router(v1)

    return app
