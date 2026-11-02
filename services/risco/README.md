# Serviço de Risco

Criado a partir de [`templates/servico-nestjs`](../../templates/servico-nestjs/README.md), que descreve as camadas, a regra de dependência e os testes. Este README cobre só o que muda no Risco.

O Risco aplica CQRS ([07-cqrs.md](../../docs/arquitetura/07-cqrs.md)), então tem **duas instâncias de PostgreSQL**:

| Instância | Host no compose e no Kubernetes | Conteúdo |
| --------- | ------------------------------- | -------- |
| Escrita | `risco-escrita-db` | Modelo normalizado: sinalizações e parâmetros de avaliação |
| Leitura | `risco-leitura-db` | Panorama desnormalizado, um documento JSONB por região |

Cada instância tem banco, usuário, senha, volume, rede e healthcheck próprios. O serviço é o único container nas duas redes de dados.

## O que muda em relação ao modelo

- **Duas conexões do TypeORM**, chamadas `escrita` e `leitura` (`BANCO_ESCRITA` e `BANCO_LEITURA` em `infra/db/conn/data-source.ts`). Para usar uma delas, injete com `@InjectDataSource(BANCO_ESCRITA)` ou `@InjectRepository(Entidade, BANCO_LEITURA)`.
- **Entidades e migrations separadas por banco**, em `infra/db/escrita/` e `infra/db/leitura/`. Uma conexão nunca carrega as entidades da outra.
- **`GET /health` verifica os dois bancos.** Responde 200 só com os dois `up`; se um cair, responde 503 e o corpo diz qual:

  ```json
  {"status":"error","info":{"escrita":{"status":"up"}},"error":{"leitura":{"status":"down"}}}
  ```

## Configuração

| Variável | Origem no compose | Uso |
| -------- | ----------------- | --- |
| `POSTGRES_ESCRITA_HOST`, `POSTGRES_LEITURA_HOST` | `environment` | host de cada banco |
| `POSTGRES_ESCRITA_PORT`, `POSTGRES_LEITURA_PORT` | `environment` | porta de cada banco |
| `POSTGRES_ESCRITA_DB`, `POSTGRES_LEITURA_DB` | `.env` | nome de cada banco |
| `POSTGRES_ESCRITA_USER`, `POSTGRES_LEITURA_USER` | `.env` | usuário de cada banco |
| `POSTGRES_ESCRITA_PASSWORD`, `POSTGRES_LEITURA_PASSWORD` | `.env` | senha de cada banco |
| `PORT` | `environment` | porta HTTP do serviço |

Os containers dos bancos usam as variáveis padrão da imagem (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`). O `compose.yaml` as preenche a partir do `.env` por interpolação (`${POSTGRES_ESCRITA_PASSWORD}`), então a senha só existe no `.env`. Se faltar alguma, o `docker compose` para e diz qual.

## Subir

```bash
cp services/risco/.env.example services/risco/.env   # e troque as duas senhas
docker compose up -d --build --wait risco
docker compose ps
```

Os três containers (`risco`, `risco-escrita-db` e `risco-leitura-db`) devem ficar `healthy`. Para conferir:

```bash
docker compose exec risco wget -qO- 127.0.0.1:3000/health
```

## Testes

```bash
npm ci
npm test
```

O teste e2e sobe dois `postgres:17-alpine` com Testcontainers e derruba cada um deles para conferir que o `/health` aponta o banco certo e se recupera sem reiniciar a aplicação.
