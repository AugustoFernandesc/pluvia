"""Leitura e validação das variáveis de ambiente.

Mesmo comportamento do ``validarAmbiente()`` dos serviços NestJS: o serviço
falha na subida nomeando todas as variáveis ausentes ou inválidas de uma vez.
"""

from collections.abc import Mapping
from dataclasses import dataclass

VARIAVEIS_TEXTO = ("POSTGRES_HOST", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD")
VARIAVEIS_PORTA = ("POSTGRES_PORT", "PORT")
ORDEM = (
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "PORT",
)


@dataclass(frozen=True)
class Ambiente:
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    PORT: int

    def __repr__(self) -> str:
        # A senha nunca aparece em log nem em mensagem de erro.
        return (
            f"Ambiente(POSTGRES_HOST={self.POSTGRES_HOST!r}, POSTGRES_PORT={self.POSTGRES_PORT}, "
            f"POSTGRES_DB={self.POSTGRES_DB!r}, POSTGRES_USER={self.POSTGRES_USER!r}, "
            f"POSTGRES_PASSWORD='***', PORT={self.PORT})"
        )


def _eh_porta_valida(valor: str) -> bool:
    return valor.isascii() and valor.isdigit() and 1 <= int(valor) <= 65535


def validar_ambiente(config: Mapping[str, str]) -> Ambiente:
    def texto(nome: str) -> str | None:
        valor = config.get(nome)
        return valor if isinstance(valor, str) and valor != "" else None

    ausentes = [nome for nome in ORDEM if texto(nome) is None]
    if ausentes:
        raise ValueError(f"Variáveis de ambiente ausentes: {', '.join(ausentes)}")

    invalidas = [nome for nome in VARIAVEIS_PORTA if not _eh_porta_valida(texto(nome) or "")]
    if invalidas:
        raise ValueError(
            "Variáveis de ambiente com porta inválida "
            f"(esperado inteiro de 1 a 65535): {', '.join(invalidas)}"
        )

    valores: dict[str, str | int] = {nome: texto(nome) or "" for nome in VARIAVEIS_TEXTO}
    valores.update({nome: int(texto(nome) or "0") for nome in VARIAVEIS_PORTA})
    return Ambiente(**valores)  # type: ignore[arg-type]
