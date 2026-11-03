"""Acesso ao PostgreSQL com pgvector."""

from psycopg.conninfo import make_conninfo
from psycopg_pool import AsyncConnectionPool

from app.config import Ambiente

TEMPO_LIMITE_S = 3


class BancoIndisponivel(Exception):
    """O banco não respondeu, ou respondeu sem a extensão pgvector."""


class Banco:
    def __init__(self, ambiente: Ambiente) -> None:
        conninfo = make_conninfo(
            host=ambiente.POSTGRES_HOST,
            port=ambiente.POSTGRES_PORT,
            dbname=ambiente.POSTGRES_DB,
            user=ambiente.POSTGRES_USER,
            password=ambiente.POSTGRES_PASSWORD,
            connect_timeout=TEMPO_LIMITE_S,
            application_name="analise",
        )
        # open=False: a aplicação sobe mesmo com o banco fora do ar. Quem decide
        # se o pod recebe tráfego é a readiness, pelo /health.
        # check: descarta conexões quebradas (por exemplo, depois de o banco
        # reiniciar) antes de entregá-las.
        self._pool = AsyncConnectionPool(
            conninfo,
            min_size=1,
            max_size=5,
            open=False,
            check=AsyncConnectionPool.check_connection,
        )

    async def abrir(self) -> None:
        await self._pool.open(wait=False)

    async def fechar(self) -> None:
        await self._pool.close()

    async def verificar(self) -> dict[str, str]:
        """Confere que o banco responde e que a extensão vector está instalada.

        Retorna a versão do pgvector. Levanta ``BancoIndisponivel`` em qualquer falha.
        """
        try:
            async with self._pool.connection(timeout=TEMPO_LIMITE_S) as conn:
                cursor = await conn.execute(
                    "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
                )
                linha = await cursor.fetchone()
        except Exception as erro:  # noqa: BLE001 - qualquer falha vira "down"
            raise BancoIndisponivel(str(erro) or type(erro).__name__) from erro

        if linha is None:
            raise BancoIndisponivel("extensão vector não instalada no banco")
        return {"pgvector": linha[0]}
