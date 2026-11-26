#!/usr/bin/env python3
"""Cria os arquivos .env a partir dos .env.example e completa os que já existem.

Uso, na raiz do repositório: python scripts/preparar-env.py

- .env ausente: é copiado do .env.example.
- .env existente: nada é alterado; só as chaves que faltam são acrescentadas,
  com o valor do exemplo. Isso cobre quem clonou numa etapa anterior, quando o
  serviço ainda não usava a variável.
- RABBITMQ_USER e RABBITMQ_PASSWORD dos serviços recebem os mesmos valores de
  RABBITMQ_SERVICOS_* do infra/rabbitmq/.env, para baterem com o broker.

Os valores dos exemplos servem para desenvolvimento local. Troque as senhas
antes de expor o ambiente.
"""

import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTAS = ("services", "infra", "clients")
VINDOS_DO_RABBITMQ = {
    "RABBITMQ_USER": "RABBITMQ_SERVICOS_USER",
    "RABBITMQ_PASSWORD": "RABBITMQ_SERVICOS_PASSWORD",
}


def ler(arquivo: Path) -> dict[str, str]:
    valores = {}
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            valores[chave.strip()] = valor
    return valores


def exemplos() -> list[Path]:
    # O RabbitMQ vem primeiro: os outros serviços copiam a senha dele.
    todos = sorted(p for pasta in PASTAS for p in (RAIZ / pasta).glob("*/.env.example"))
    return sorted(todos, key=lambda p: p.parent.name != "rabbitmq")


def main() -> int:
    for exemplo in exemplos():
        destino = exemplo.with_name(".env")
        nome = destino.relative_to(RAIZ).as_posix()
        if not destino.exists():
            shutil.copyfile(exemplo, destino)
            print(f"criado {nome}")
            continue

        atuais = ler(destino)
        faltantes = [chave for chave in ler(exemplo) if chave not in atuais]
        if not faltantes:
            continue
        rabbitmq = ler(RAIZ / "infra" / "rabbitmq" / ".env")
        modelo = ler(exemplo)
        texto = destino.read_text(encoding="utf-8")
        if texto and not texto.endswith("\n"):
            texto += "\n"
        for chave in faltantes:
            valor = rabbitmq.get(VINDOS_DO_RABBITMQ.get(chave, ""), modelo[chave])
            texto += f"{chave}={valor}\n"
        destino.write_text(texto, encoding="utf-8", newline="\n")
        print(f"completado {nome}: {', '.join(faltantes)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
