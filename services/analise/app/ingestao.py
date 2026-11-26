"""Ingestão: texto -> trechos -> embeddings -> pgvector.

A base local (``BASE_CONHECIMENTO_DIR``) é indexada na subida do serviço, em
segundo plano, e de novo a cada tentativa enquanto o Ollama ainda não estiver
pronto (por exemplo, baixando os modelos). Documentos já indexados com o mesmo
conteúdo são ignorados, pelo hash.
"""

import asyncio
import hashlib
import logging
from pathlib import Path
from uuid import UUID

import httpx
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.base_conhecimento import Documento, RepositorioConhecimento
from app.llm import ClienteLLM, LLMIndisponivel

log = logging.getLogger(__name__)

TAMANHO_TRECHO = 800
SOBREPOSICAO = 120
INTERVALO_NOVA_TENTATIVA_S = 15
TAMANHO_MAXIMO_URL = 1_000_000
ORIGEM_LOCAL = "Base de conhecimento do Pluvia"

_divisor = RecursiveCharacterTextSplitter(
    chunk_size=TAMANHO_TRECHO,
    chunk_overlap=SOBREPOSICAO,
    separators=["\n## ", "\n\n", "\n", ". ", " "],
)


def dividir(texto: str) -> list[str]:
    return [t.strip() for t in _divisor.split_text(texto) if t.strip()]


def _hash(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _titulo(texto: str, padrao: str) -> str:
    primeira = texto.lstrip().splitlines()[0] if texto.strip() else ""
    return primeira.lstrip("# ").strip() if primeira.startswith("#") else padrao


class Ingestor:
    def __init__(self, repositorio: RepositorioConhecimento, llm: ClienteLLM) -> None:
        self._repositorio = repositorio
        self._llm = llm

    async def registrar(self, titulo: str, origem: str, url: str, texto: str) -> Documento:
        """Registra o documento como PROCESSANDO, ou devolve o já indexado."""
        existente = await self._repositorio.por_hash(_hash(texto))
        if existente and existente.situacao == "INDEXADO":
            return existente
        return await self._repositorio.criar(titulo, origem, url, _hash(texto))

    async def indexar(self, documento_id: UUID, texto: str) -> None:
        trechos = dividir(texto)
        try:
            embeddings = await self._llm.embeddings_documentos(trechos)
        except LLMIndisponivel:
            await self._repositorio.marcar_falha(documento_id)
            raise
        await self._repositorio.indexar(documento_id, trechos, embeddings)

    async def ingerir_texto(self, titulo: str, origem: str, url: str, texto: str) -> Documento:
        documento = await self.registrar(titulo, origem, url, texto)
        if documento.situacao != "INDEXADO":
            await self.indexar(documento.id, texto)
        return documento

    async def ingerir_url(self, documento_id: UUID, url: str) -> None:
        """Baixa um texto (Markdown ou texto puro) e indexa. Usado pelo POST /documentos."""
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as http:
                resposta = await http.get(url)
                resposta.raise_for_status()
            if len(resposta.content) > TAMANHO_MAXIMO_URL:
                raise ValueError("documento maior que 1 MB")
            if not resposta.headers.get("content-type", "").startswith("text/"):
                raise ValueError("só documentos de texto são aceitos")
            await self.indexar(documento_id, resposta.text)
        except (httpx.HTTPError, ValueError, LLMIndisponivel) as erro:
            log.warning("falha ao ingerir %s: %s", url, erro)
            await self._repositorio.marcar_falha(documento_id)

    async def ingerir_base_local(self, diretorio: Path) -> int:
        indexados = 0
        for arquivo in sorted(diretorio.glob("*.md")):
            texto = arquivo.read_text(encoding="utf-8")
            await self.ingerir_texto(
                _titulo(texto, arquivo.stem),
                ORIGEM_LOCAL,
                f"https://github.com/AugustoFernandesc/pluvia/blob/main/services/analise/conhecimento/{arquivo.name}",
                texto,
            )
            indexados += 1
        return indexados

    async def manter_base_local(self, diretorio: Path) -> None:
        """Cria as tabelas e indexa a base local, tentando até conseguir. Roda em segundo plano."""
        while True:
            try:
                await self._repositorio.criar_esquema()
                total = await self.ingerir_base_local(diretorio)
            except Exception as erro:  # noqa: BLE001 - Ollama ou banco ainda subindo
                log.info("base de conhecimento ainda não indexada (%s); nova tentativa em %ss",
                         erro, INTERVALO_NOVA_TENTATIVA_S)
                await asyncio.sleep(INTERVALO_NOVA_TENTATIVA_S)
                continue
            log.info("base de conhecimento pronta: %s documentos", total)
            return
