# Serviço de Análise

Camada de IA do Pluvia ([docs/api/analise.yaml](../../docs/api/analise.yaml)), em Python com FastAPI. Guarda os embeddings da base de conhecimento num PostgreSQL com **pgvector** ([05-dados.md](../../docs/arquitetura/05-dados.md)).

Segue as mesmas convenções dos serviços NestJS: configuração só por variável de ambiente, falha na subida nomeando o que falta, `GET /health` fora do prefixo `/v1`, imagem multi-stage rodando sem root e banco próprio no `compose.yaml`.

## Estrutura

```text
app/
├── __main__.py   # ponto de entrada (python -m app): valida o ambiente e sobe o uvicorn
├── main.py       # criar_app(): monta o FastAPI, o /health e o router /v1
├── config.py     # validar_ambiente(), equivalente ao validarAmbiente() do NestJS
├── db.py         # pool de conexões (psycopg 3) e verificação do banco
└── health.py     # GET /health
db/init/
└── 01-pgvector.sql   # CREATE EXTENSION vector, roda na criação do volume
tests/
```

As rotas da API (`/v1/analises`, `/v1/consultas`...) entram no router `v1` de `app/main.py`.

## Configuração

| Variável | Origem no compose | Uso |
| -------- | ----------------- | --- |
| `POSTGRES_HOST` | `environment` | host do banco (`analise-db`) |
| `POSTGRES_PORT` | `environment` | porta do banco |
| `POSTGRES_DB` | `.env` | nome do banco (também usado pela imagem do Postgres) |
| `POSTGRES_USER` | `.env` | usuário (idem) |
| `POSTGRES_PASSWORD` | `.env` | senha (idem) |
| `PORT` | `environment` | porta HTTP, **8000** |

## `GET /health`

Mesmo formato do Terminus usado nos serviços NestJS. Responde 200 só se o banco responde **e** a extensão `vector` está instalada:

```json
{"status":"ok","info":{"database":{"status":"up","pgvector":"0.8.0"}},"error":{},"details":{...}}
```

Com o banco fora do ar, ou sem o pgvector, responde 503 com `database: down` e o motivo em `message`. A aplicação sobe mesmo com o banco fora e se reconecta sozinha quando ele volta.

Toda resposta traz o cabeçalho `X-Atendido-Por` com o hostname do container. No Kubernetes é o nome do pod, o que serve para mostrar a carga sendo dividida entre as réplicas.

## Subir

```bash
cp services/analise/.env.example services/analise/.env   # e troque a senha
docker compose up -d --build --wait analise
docker compose exec analise python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

O `01-pgvector.sql` só roda quando o volume é criado. Se o volume `analise-db-dados` já existia sem a extensão, rode uma vez:

```bash
docker compose exec analise-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector"'
```

## Imagem

O `Dockerfile` tem dois estágios: `build` instala as dependências num virtualenv, e `final` copia só o virtualenv e a pasta `app/` sobre `python:3.13-slim`, rodando como o usuário `analise` (uid 10001). pip, cache de download, testes e `requirements-dev.txt` ficam fora da imagem final.

## Testes

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```
