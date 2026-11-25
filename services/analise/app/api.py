"""Rotas /v1 da Análise: consultas, base de conhecimento e estado do LLM."""

import asyncio
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl

from app.base_conhecimento import RepositorioConhecimento
from app.ingestao import Ingestor
from app.llm import ClienteLLM
from app.rag import SemResposta, ServicoConsultas

TIPO_BASE = "https://pluvia.dev/problemas"

# Referência às ingestões em andamento, para o asyncio não descartá-las.
_tarefas: set[asyncio.Task] = set()


@dataclass
class Servicos:
    llm: ClienteLLM
    consultas: ServicoConsultas
    repositorio: RepositorioConhecimento
    ingestor: Ingestor


def servicos(request: Request) -> Servicos:
    return request.app.state.servicos


Dependencias = Annotated[Servicos, Depends(servicos)]


class PedidoConsulta(BaseModel):
    pergunta: str = Field(min_length=5, max_length=1000)
    regiaoId: str | None = None
    usarRecuperacao: bool = True


class PedidoDocumento(BaseModel):
    titulo: str = Field(min_length=1)
    origem: str = Field(min_length=1)
    url: HttpUrl


def problema(status: int, tipo: str, titulo: str, detalhe: str, instancia: str) -> JSONResponse:
    return JSONResponse(
        {"type": f"{TIPO_BASE}/{tipo}", "title": titulo, "status": status,
         "detail": detalhe, "instance": instancia},
        status_code=status,
        media_type="application/problem+json",
    )


router = APIRouter(prefix="/v1")


@router.post("/consultas")
async def consultar(pedido: PedidoConsulta, s: Dependencias, request: Request):
    try:
        resposta = await s.consultas.consultar(pedido.pergunta, pedido.usarRecuperacao)
    except SemResposta as erro:
        return problema(503, "llm-indisponivel", "Provedor de LLM indisponível",
                        str(erro), request.url.path)
    return resposta.json()


@router.get("/documentos")
async def listar_documentos(s: Dependencias):
    return [d.json() for d in await s.repositorio.listar()]


@router.post("/documentos", status_code=202)
async def ingerir_documento(pedido: PedidoDocumento, s: Dependencias):
    url = str(pedido.url)
    # O hash final só existe depois do download; até lá, o registro usa a URL.
    documento = await s.ingestor.registrar(pedido.titulo, pedido.origem, url, url)
    if documento.situacao != "INDEXADO":
        tarefa = asyncio.create_task(s.ingestor.ingerir_url(documento.id, url))
        _tarefas.add(tarefa)
        tarefa.add_done_callback(_tarefas.discard)
    return JSONResponse(
        documento.json(), status_code=202, headers={"Location": "/v1/documentos"}
    )


@router.get("/llm")
async def estado_llm(s: Dependencias):
    return {
        "modelo": s.llm.modelo,
        "modeloEmbedding": s.llm.modelo_embedding,
        "circuito": s.llm.estado_circuito.value,
        "respostasEmCache": s.consultas.itens_em_cache,
    }
