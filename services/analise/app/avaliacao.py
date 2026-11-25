"""Avaliação do RAG: mesmas perguntas com e sem recuperação.

Uso, com o sistema no ar:
    docker compose exec analise python -m app.avaliacao > docs/parte4/avaliacao-rag-bruta.md

Para cada pergunta, mede a latência e confere quais fatos esperados aparecem na
resposta. O cache fica desligado para que cada chamada vá de fato ao modelo.
"""

import asyncio
import json
import os
import statistics
import sys
from pathlib import Path

from app.base_conhecimento import RecuperadorPluvia, RepositorioConhecimento
from app.config import validar_ambiente
from app.config_llm import ler_config_llm
from app.db import Banco
from app.llm import ClienteLLM
from app.rag import Resposta, ServicoConsultas

PERGUNTAS = Path(__file__).resolve().parent.parent / "avaliacao" / "perguntas.json"


def acertos(resposta: str, fatos: list[str]) -> int:
    texto = resposta.lower()
    return sum(1 for fato in fatos if fato.lower() in texto)


def celula(texto: str) -> str:
    return " ".join(texto.split()).replace("|", "\\|")


async def avaliar() -> None:
    ambiente = validar_ambiente(os.environ)
    config = ler_config_llm(os.environ)
    banco = Banco(ambiente)
    await banco.abrir()
    llm = ClienteLLM(config)
    recuperador = RecuperadorPluvia(
        repositorio=RepositorioConhecimento(banco, config.EMBEDDING_DIMENSAO),
        llm=llm,
        k=config.RAG_TRECHOS,
    )
    servico = ServicoConsultas(llm, recuperador, config.CACHE_TTL_S, config.CACHE_TAMANHO)
    casos = json.loads(PERGUNTAS.read_text(encoding="utf-8"))

    linhas: list[str] = []
    latencias: dict[bool, list[int]] = {True: [], False: []}
    totais: dict[bool, int] = {True: 0, False: 0}
    fatos_totais = 0

    for numero, caso in enumerate(casos, start=1):
        fatos_totais += len(caso["fatos"])
        resultados: dict[bool, Resposta] = {}
        for com_rag in (False, True):
            r = await servico.consultar(caso["pergunta"], usar_recuperacao=com_rag, usar_cache=False)
            resultados[com_rag] = r
            latencias[com_rag].append(r.latencia_ms)
            totais[com_rag] += acertos(r.resposta, caso["fatos"])
        linhas.append(f"### {numero}. {caso['pergunta']}\n")
        linhas.append(f"Fatos esperados: {', '.join(caso['fatos'])}\n")
        linhas.append("| | Sem recuperação | Com recuperação |\n|---|---|---|")
        linhas.append(
            f"| Resposta | {celula(resultados[False].resposta)} | {celula(resultados[True].resposta)} |"
        )
        linhas.append(
            f"| Fatos encontrados | {acertos(resultados[False].resposta, caso['fatos'])}/{len(caso['fatos'])}"
            f" | {acertos(resultados[True].resposta, caso['fatos'])}/{len(caso['fatos'])} |"
        )
        linhas.append(
            f"| Latência | {resultados[False].latencia_ms} ms | {resultados[True].latencia_ms} ms |"
        )
        trechos = ", ".join(f"{t.titulo} ({t.similaridade:.2f})" for t in resultados[True].trechos)
        linhas.append(f"\nTrechos recuperados: {trechos}\n")

    print(f"# Avaliação bruta do RAG ({llm.modelo}, embeddings {llm.modelo_embedding})\n")
    print("| Modo | Fatos encontrados | Latência mediana | Latência máxima |\n|---|---|---|---|")
    for com_rag, nome in ((False, "Sem recuperação"), (True, "Com recuperação")):
        print(
            f"| {nome} | {totais[com_rag]}/{fatos_totais} | "
            f"{statistics.median(latencias[com_rag]):.0f} ms | {max(latencias[com_rag])} ms |"
        )
    print()
    print("\n".join(linhas))
    await banco.fechar()


if __name__ == "__main__":
    try:
        asyncio.run(avaliar())
    except ValueError as erro:
        print(erro, file=sys.stderr)
        sys.exit(1)
