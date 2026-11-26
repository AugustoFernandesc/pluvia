"""Ponto de entrada: ``python -m app``.

Valida o ambiente antes de subir o servidor, para falhar logo nomeando a
variável que falta.
"""

import logging
import os
import sys
from pathlib import Path

import uvicorn

from app.analises import FontesPluvia, ServicoAnalises, ler_config_fontes
from app.api import Servicos
from app.base_conhecimento import RecuperadorPluvia, RepositorioConhecimento
from app.config import validar_ambiente
from app.config_llm import ler_config_llm
from app.db import Banco
from app.ingestao import Ingestor
from app.llm import ClienteLLM
from app.main import criar_app
from app.rag import ServicoConsultas


def main() -> None:
    try:
        ambiente = validar_ambiente(os.environ)
        config = ler_config_llm(os.environ)
        fontes = ler_config_fontes(os.environ)
    except ValueError as erro:
        print(erro, file=sys.stderr)
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    banco = Banco(ambiente)
    llm = ClienteLLM(config)
    repositorio = RepositorioConhecimento(banco, config.EMBEDDING_DIMENSAO)
    recuperador = RecuperadorPluvia(repositorio=repositorio, llm=llm, k=config.RAG_TRECHOS)
    servicos = Servicos(
        llm=llm,
        consultas=ServicoConsultas(llm, recuperador, config.CACHE_TTL_S, config.CACHE_TAMANHO),
        repositorio=repositorio,
        ingestor=Ingestor(repositorio, llm),
        analises=ServicoAnalises(llm, FontesPluvia(fontes)),
    )
    app = criar_app(banco, servicos, Path(config.BASE_CONHECIMENTO_DIR))
    uvicorn.run(app, host="0.0.0.0", port=ambiente.PORT)


if __name__ == "__main__":
    main()
