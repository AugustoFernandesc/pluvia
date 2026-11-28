"""Configuração do modelo de linguagem e do RAG, lida do ambiente.

Nenhum modelo, endereço ou parâmetro de geração fica fixo no código: tudo vem
das variáveis abaixo (compose.yaml no Docker, ConfigMap no Kubernetes).
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, fields


@dataclass(frozen=True)
class ConfigLLM:
    OLLAMA_URL: str
    LLM_MODELO: str
    LLM_TEMPERATURA: float
    LLM_TIMEOUT_S: float
    LLM_TENTATIVAS: int
    EMBEDDING_MODELO: str
    EMBEDDING_DIMENSAO: int
    CIRCUITO_FALHAS: int
    CIRCUITO_ESPERA_S: float
    CACHE_TTL_S: int
    CACHE_TAMANHO: int
    RAG_TRECHOS: int
    BASE_CONHECIMENTO_DIR: str


def _converter(tipo: type, valor: str) -> object:
    convertido = tipo(valor)
    if tipo in (int, float) and convertido < 0:  # type: ignore[operator]
        raise ValueError
    return convertido


def ler_config_llm(config: Mapping[str, str]) -> ConfigLLM:
    """Falha nomeando todas as variáveis ausentes ou inválidas de uma vez."""
    ausentes: list[str] = []
    invalidas: list[str] = []
    valores: dict[str, object] = {}

    for campo in fields(ConfigLLM):
        bruto = config.get(campo.name, "")
        if bruto == "":
            ausentes.append(campo.name)
            continue
        conversor: Callable[[str], object] = {int: int, float: float}.get(campo.type, str)  # type: ignore[call-overload]
        try:
            valores[campo.name] = _converter(conversor, bruto)  # type: ignore[arg-type]
        except ValueError:
            invalidas.append(campo.name)

    if ausentes:
        raise ValueError(f"Variáveis de ambiente ausentes: {', '.join(ausentes)}")
    if invalidas:
        raise ValueError(f"Variáveis de ambiente inválidas: {', '.join(invalidas)}")
    return ConfigLLM(**valores)  # type: ignore[arg-type]
