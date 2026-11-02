from fastapi.testclient import TestClient

from app.db import BancoIndisponivel
from app.main import CABECALHO_REPLICA, criar_app


class BancoFalso:
    def __init__(self) -> None:
        self.erro: str | None = None

    async def verificar(self) -> dict[str, str]:
        if self.erro is not None:
            raise BancoIndisponivel(self.erro)
        return {"pgvector": "0.8.0"}


def cliente(banco: BancoFalso) -> TestClient:
    return TestClient(criar_app(banco))


def test_responde_200_com_database_up_e_versao_do_pgvector():
    resposta = cliente(BancoFalso()).get("/health")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "ok"
    assert resposta.json()["info"]["database"] == {"status": "up", "pgvector": "0.8.0"}


def test_responde_503_com_database_down_quando_o_banco_cai():
    banco = BancoFalso()
    banco.erro = "connection refused"

    resposta = cliente(banco).get("/health")

    assert resposta.status_code == 503
    assert resposta.json()["status"] == "error"
    assert resposta.json()["error"]["database"]["status"] == "down"


def test_volta_a_200_quando_o_banco_volta_sem_recriar_a_aplicacao():
    banco = BancoFalso()
    with cliente(banco) as http:
        banco.erro = "connection refused"
        assert http.get("/health").status_code == 503

        banco.erro = None
        assert http.get("/health").status_code == 200


def test_health_fica_fora_do_prefixo_v1():
    http = cliente(BancoFalso())

    assert http.get("/health").status_code == 200
    assert http.get("/v1/health").status_code == 404


def test_identifica_a_replica_que_respondeu():
    resposta = cliente(BancoFalso()).get("/health")

    assert resposta.headers[CABECALHO_REPLICA]
