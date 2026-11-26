"""Base de conhecimento: documentos, trechos e busca vetorial no pgvector."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from langchain_core.callbacks import AsyncCallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict

from app.db import Banco
from app.llm import ClienteLLM, LLMIndisponivel

ESQUEMA = """
CREATE TABLE IF NOT EXISTS documentos (
  id uuid PRIMARY KEY,
  titulo text NOT NULL,
  origem text NOT NULL,
  url text NOT NULL,
  hash text NOT NULL UNIQUE,
  situacao text NOT NULL,
  trechos int NOT NULL DEFAULT 0,
  indexado_em timestamptz
);
CREATE TABLE IF NOT EXISTS trechos (
  id bigserial PRIMARY KEY,
  documento_id uuid NOT NULL REFERENCES documentos (id) ON DELETE CASCADE,
  ordem int NOT NULL,
  conteudo text NOT NULL,
  embedding vector({dimensao}) NOT NULL
);
CREATE INDEX IF NOT EXISTS trechos_embedding_idx
  ON trechos USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS trechos_texto_idx
  ON trechos USING gin (to_tsvector('portuguese', conteudo));
"""


@dataclass(frozen=True)
class Documento:
    id: UUID
    titulo: str
    origem: str
    url: str
    situacao: str
    trechos: int
    indexado_em: datetime | None

    def json(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "titulo": self.titulo,
            "origem": self.origem,
            "url": self.url,
            "situacao": self.situacao,
            "trechos": self.trechos,
            "indexadoEm": self.indexado_em.isoformat() if self.indexado_em else None,
        }


@dataclass(frozen=True)
class Trecho:
    documento_id: UUID
    titulo: str
    conteudo: str
    similaridade: float

    def json(self) -> dict[str, Any]:
        return {
            "documentoId": str(self.documento_id),
            "titulo": self.titulo,
            "trecho": self.conteudo,
            "similaridade": round(self.similaridade, 4),
        }


def _vetor(valores: list[float]) -> str:
    return "[" + ",".join(f"{v:.7f}" for v in valores) + "]"


_COLUNAS_DOC = "id, titulo, origem, url, situacao, trechos, indexado_em"


class RepositorioConhecimento:
    def __init__(self, banco: Banco, dimensao: int) -> None:
        self._banco = banco
        self._dimensao = dimensao

    async def criar_esquema(self) -> None:
        async with self._banco.conexao() as conn:
            await conn.execute(ESQUEMA.format(dimensao=self._dimensao))

    async def por_hash(self, hash_: str) -> Documento | None:
        async with self._banco.conexao() as conn:
            cur = await conn.execute(
                f"SELECT {_COLUNAS_DOC} FROM documentos WHERE hash = %s", (hash_,)
            )
            linha = await cur.fetchone()
        return Documento(*linha) if linha else None

    async def criar(self, titulo: str, origem: str, url: str, hash_: str) -> Documento:
        async with self._banco.conexao() as conn:
            cur = await conn.execute(
                f"""INSERT INTO documentos (id, titulo, origem, url, hash, situacao)
                    VALUES (%s, %s, %s, %s, %s, 'PROCESSANDO')
                    ON CONFLICT (hash) DO UPDATE SET situacao = 'PROCESSANDO'
                    RETURNING {_COLUNAS_DOC}""",
                (uuid4(), titulo, origem, url, hash_),
            )
            return Documento(*await cur.fetchone())  # type: ignore[misc]

    async def indexar(
        self, documento_id: UUID, trechos: list[str], embeddings: list[list[float]]
    ) -> None:
        async with self._banco.conexao() as conn, conn.transaction():
            await conn.execute("DELETE FROM trechos WHERE documento_id = %s", (documento_id,))
            async with conn.cursor() as cur:
                await cur.executemany(
                    """INSERT INTO trechos (documento_id, ordem, conteudo, embedding)
                       VALUES (%s, %s, %s, %s::vector)""",
                    [
                        (documento_id, i, texto, _vetor(emb))
                        for i, (texto, emb) in enumerate(zip(trechos, embeddings, strict=True))
                    ],
                )
            await conn.execute(
                """UPDATE documentos SET situacao = 'INDEXADO', trechos = %s,
                   indexado_em = now() WHERE id = %s""",
                (len(trechos), documento_id),
            )

    async def marcar_falha(self, documento_id: UUID) -> None:
        async with self._banco.conexao() as conn:
            await conn.execute(
                "UPDATE documentos SET situacao = 'FALHOU' WHERE id = %s", (documento_id,)
            )

    async def listar(self) -> list[Documento]:
        async with self._banco.conexao() as conn:
            cur = await conn.execute(f"SELECT {_COLUNAS_DOC} FROM documentos ORDER BY titulo")
            return [Documento(*linha) for linha in await cur.fetchall()]

    async def buscar_por_vetor(self, embedding: list[float], k: int) -> list[Trecho]:
        """Busca semântica: os ``k`` trechos mais próximos pela distância de cosseno."""
        async with self._banco.conexao() as conn:
            cur = await conn.execute(
                """SELECT d.id, d.titulo, t.conteudo, 1 - (t.embedding <=> %s::vector)
                   FROM trechos t JOIN documentos d ON d.id = t.documento_id
                   ORDER BY t.embedding <=> %s::vector LIMIT %s""",
                (_vetor(embedding), _vetor(embedding), k),
            )
            return [Trecho(*linha) for linha in await cur.fetchall()]

    async def buscar_por_texto(self, pergunta: str, k: int) -> list[Trecho]:
        """Busca por palavras-chave, usada quando o modelo de embeddings está fora."""
        async with self._banco.conexao() as conn:
            cur = await conn.execute(
                """SELECT d.id, d.titulo, t.conteudo,
                          ts_rank(to_tsvector('portuguese', t.conteudo), q, 32)
                   FROM trechos t JOIN documentos d ON d.id = t.documento_id,
                        -- OR entre as palavras: basta uma aparecer; o ts_rank ordena.
                        to_tsquery('portuguese',
                                   replace(plainto_tsquery('portuguese', %s)::text, '&', '|')) q
                   WHERE to_tsvector('portuguese', t.conteudo) @@ q
                   ORDER BY 4 DESC LIMIT %s""",
                (pergunta, k),
            )
            return [Trecho(*linha) for linha in await cur.fetchall()]


class RecuperadorPluvia(BaseRetriever):
    """Retriever do LangChain sobre o pgvector, para entrar nas chains."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    repositorio: RepositorioConhecimento
    llm: ClienteLLM
    k: int

    def _get_relevant_documents(self, query: str, **_: Any) -> list[Document]:
        raise NotImplementedError("use a versão assíncrona (ainvoke)")

    async def _aget_relevant_documents(
        self, query: str, *, run_manager: AsyncCallbackManagerForRetrieverRun
    ) -> list[Document]:
        return [_documento(t) for t in await self.buscar(query)]

    async def buscar(self, pergunta: str) -> list[Trecho]:
        """Busca semântica. Levanta ``LLMIndisponivel`` se o embedding falhar."""
        embedding = await self.llm.embedding_consulta(pergunta)
        return await self.repositorio.buscar_por_vetor(embedding, self.k)

    async def buscar_com_degradacao(self, pergunta: str) -> tuple[list[Trecho], bool]:
        """Busca semântica, ou por palavras-chave se o modelo de embeddings cair.

        Retorna os trechos e se a busca foi degradada.
        """
        try:
            return await self.buscar(pergunta), False
        except LLMIndisponivel:
            return await self.repositorio.buscar_por_texto(pergunta, self.k), True


def _documento(trecho: Trecho) -> Document:
    return Document(
        page_content=trecho.conteudo,
        metadata={
            "documentoId": str(trecho.documento_id),
            "titulo": trecho.titulo,
            "similaridade": trecho.similaridade,
        },
    )
