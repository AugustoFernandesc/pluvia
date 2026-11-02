"""GET /health no mesmo formato do Terminus usado nos serviços NestJS.

200 com ``database: up`` e 503 com ``database: down``. Fica fora do prefixo
``/v1``, como nos outros serviços.
"""

from typing import Any, Protocol

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import BancoIndisponivel


class VerificaBanco(Protocol):
    async def verificar(self) -> dict[str, str]: ...


router = APIRouter()


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    banco: VerificaBanco = request.app.state.banco
    try:
        detalhes: dict[str, Any] = {"status": "up", **await banco.verificar()}
    except BancoIndisponivel as erro:
        detalhes = {"status": "down", "message": str(erro)}
        corpo = {"status": "error", "info": {}, "error": {"database": detalhes}}
        codigo = 503
    else:
        corpo = {"status": "ok", "info": {"database": detalhes}, "error": {}}
        codigo = 200
    corpo["details"] = {"database": detalhes}
    return JSONResponse(corpo, status_code=codigo)
