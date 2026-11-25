"""Circuit breaker para chamadas ao provedor de LLM.

Implementação própria e pequena: as bibliotecas assíncronas de circuit breaker
para Python (aiobreaker, por exemplo) estão sem manutenção desde 2021.
"""

import time
from collections.abc import Awaitable, Callable
from enum import Enum
from typing import TypeVar

T = TypeVar("T")


class EstadoCircuito(str, Enum):
    FECHADO = "FECHADO"
    ABERTO = "ABERTO"
    MEIO_ABERTO = "MEIO_ABERTO"


class CircuitoAberto(Exception):
    """O circuito está aberto: a chamada foi recusada sem tocar no provedor."""


class CircuitBreaker:
    """FECHADO -> ABERTO depois de ``falhas_max`` falhas seguidas.

    ABERTO recusa tudo por ``espera_s`` segundos. Depois disso, deixa passar uma
    chamada de teste (MEIO_ABERTO): sucesso fecha o circuito, falha reabre.
    """

    def __init__(
        self, falhas_max: int, espera_s: float, relogio: Callable[[], float] = time.monotonic
    ) -> None:
        self._falhas_max = falhas_max
        self._espera_s = espera_s
        self._relogio = relogio
        self._falhas = 0
        self._aberto_em: float | None = None

    @property
    def estado(self) -> EstadoCircuito:
        if self._aberto_em is None:
            return EstadoCircuito.FECHADO
        if self._relogio() - self._aberto_em >= self._espera_s:
            return EstadoCircuito.MEIO_ABERTO
        return EstadoCircuito.ABERTO

    async def chamar(self, funcao: Callable[[], Awaitable[T]]) -> T:
        if self.estado is EstadoCircuito.ABERTO:
            raise CircuitoAberto("circuito aberto para o provedor de LLM")
        try:
            resultado = await funcao()
        except Exception:
            self._registrar_falha()
            raise
        self._falhas = 0
        self._aberto_em = None
        return resultado

    def _registrar_falha(self) -> None:
        if self.estado is EstadoCircuito.MEIO_ABERTO:
            self._aberto_em = self._relogio()
            return
        self._falhas += 1
        if self._falhas >= self._falhas_max:
            self._aberto_em = self._relogio()
