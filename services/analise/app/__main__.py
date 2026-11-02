"""Ponto de entrada: ``python -m app``.

Valida o ambiente antes de subir o servidor, para falhar logo nomeando a
variável que falta.
"""

import os
import sys

import uvicorn

from app.config import validar_ambiente
from app.db import Banco
from app.main import criar_app


def main() -> None:
    try:
        ambiente = validar_ambiente(os.environ)
    except ValueError as erro:
        print(erro, file=sys.stderr)
        sys.exit(1)

    uvicorn.run(criar_app(Banco(ambiente)), host="0.0.0.0", port=ambiente.PORT)


if __name__ == "__main__":
    main()
