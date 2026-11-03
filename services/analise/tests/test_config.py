import re

import pytest

from app.config import validar_ambiente

AMBIENTE_COMPLETO = {
    "POSTGRES_HOST": "analise-db",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "analise",
    "POSTGRES_USER": "analise",
    "POSTGRES_PASSWORD": "troque-esta-senha",
    "PORT": "8000",
}


def test_aceita_ambiente_completo_e_converte_as_portas():
    ambiente = validar_ambiente(AMBIENTE_COMPLETO)

    assert ambiente.POSTGRES_HOST == "analise-db"
    assert ambiente.POSTGRES_PORT == 5432
    assert ambiente.PORT == 8000


@pytest.mark.parametrize("variavel", list(AMBIENTE_COMPLETO))
def test_falha_nomeando_a_variavel_ausente(variavel):
    sem_variavel = {k: v for k, v in AMBIENTE_COMPLETO.items() if k != variavel}

    with pytest.raises(ValueError, match=variavel):
        validar_ambiente(sem_variavel)


def test_trata_variavel_vazia_como_ausente():
    with pytest.raises(ValueError, match="POSTGRES_HOST"):
        validar_ambiente({**AMBIENTE_COMPLETO, "POSTGRES_HOST": ""})


def test_nomeia_todas_as_ausentes_de_uma_vez():
    with pytest.raises(ValueError) as erro:
        validar_ambiente({})

    assert re.search(
        r"POSTGRES_HOST.*POSTGRES_PORT.*POSTGRES_DB.*POSTGRES_USER.*POSTGRES_PASSWORD.*PORT",
        str(erro.value),
    )


@pytest.mark.parametrize("valor", ["abc", "0", "-1", "70000", "30.5", "٣"])
def test_rejeita_porta_invalida(valor):
    with pytest.raises(ValueError, match="PORT"):
        validar_ambiente({**AMBIENTE_COMPLETO, "PORT": valor})


def test_nao_mostra_a_senha_no_repr():
    texto = repr(validar_ambiente(AMBIENTE_COMPLETO))

    assert "troque-esta-senha" not in texto
