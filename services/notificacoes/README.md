# Modelo de serviço NestJS

Ponto de partida de todo serviço NestJS do Pluvia. Traz Clean Architecture, configuração por ambiente, `GET /health` com verificação do PostgreSQL, imagem Docker multi-stage e o `compose.yaml` com o banco próprio do serviço.

## Camadas e regra de dependência

```text
src/
├── @core/
│   ├── domain/        # entidades e interfaces de repositório   (@domain/*)
│   └── use-cases/     # casos de uso, com um método Execute()   (@use-cases/*)
├── app/               # controllers HTTP                        (@app/*)
├── infra/
│   ├── config/        # validação das variáveis de ambiente     (@infra/*)
│   └── db/
│       ├── conn/          # opções do TypeORM
│       ├── migrations/    # migrations (compiladas para dist/infra/db/migrations)
│       └── repositories/  # implementações dos repositórios e *.schema.ts
└── ioc/               # composição: main, módulos e providers   (@ioc/*)
```

A dependência aponta sempre para dentro:

```text
ioc  ->  app  ->  use-cases  ->  domain
 |                              ^
 +-->  infra  -----------------+
```

- `@core` (domain e use-cases) não importa de `app`, `infra`, `ioc` nem de `typeorm`.
- `app` chama casos de uso e não conhece o banco.
- `infra` implementa as interfaces declaradas em `@core/domain`.
- `ioc` é o único lugar que conhece todas as camadas e monta a injeção de dependência.

O `HealthController` fica em `app/health` e usa o Terminus direto, sem caso de uso, porque não há regra de domínio nele.

## Configuração

O serviço lê tudo de variáveis de ambiente e falha na subida, nomeando a variável, se alguma faltar.

| Variável | Origem no compose | Uso |
| -------- | ----------------- | --- |
| `POSTGRES_HOST` | `environment` | host do banco (nome do serviço do banco) |
| `POSTGRES_PORT` | `environment` | porta do banco |
| `POSTGRES_DB` | `.env` | nome do banco (também usado pela imagem do Postgres) |
| `POSTGRES_USER` | `.env` | usuário (idem) |
| `POSTGRES_PASSWORD` | `.env` | senha (idem) |
| `PORT` | `environment` | porta HTTP do serviço |

`GET /health` responde 200 com `database: up` e 503 com `database: down`. Ele não recebe o prefixo `v1`; o resto da API recebe.

## Testes

```bash
npm ci
npm test
```

Os testes e2e sobem um `postgres:17-alpine` descartável com Testcontainers, então o Docker precisa estar rodando.

## Criar um serviço a partir do modelo

Os comandos abaixo criam o serviço `operacoes`. Rode na raiz do repositório, no Git Bash.

1. Copie a pasta, sem `node_modules` nem `dist`:

   ```bash
   mkdir -p services/operacoes
   tar -C templates/servico-nestjs --exclude=node_modules --exclude=dist -cf - . | tar -C services/operacoes -xf -
   ```

2. Troque o nome do modelo pelo nome do serviço:

   ```bash
   sed -i 's/servico/operacoes/g' services/operacoes/compose.yaml services/operacoes/.env.example
   sed -i 's/servico-nestjs/operacoes/g' services/operacoes/package.json services/operacoes/package-lock.json
   ```

   No `compose.yaml` isso renomeia o serviço (`operacoes`), o banco (`operacoes-db`), o volume (`operacoes-db-dados`) e a rede de dados (`operacoes-dados`).

3. Crie o `.env` e troque a senha. O `.env` é ignorado pelo git, e só o `.env.example` é versionado:

   ```bash
   cp services/operacoes/.env.example services/operacoes/.env
   ```

4. Inclua o serviço no `docker-compose.yml` da raiz, em `include:`:

   ```yaml
   include:
     - services/operacoes/compose.yaml
   ```

5. Suba e confira que os dois containers ficam `healthy`:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

O serviço não publica porta no host. Para depurar:

```bash
docker compose exec operacoes wget -qO- 127.0.0.1:3000/health
```

Para subir só o serviço, rode `docker compose up -d --build` dentro de `services/operacoes`.

Se o serviço precisar do RabbitMQ, adicione a rede `mensageria` ao serviço no `compose.yaml` e declare-a em `networks:`.

### Imagem do banco por serviço

O modelo usa `postgres:17-alpine`. Alguns serviços precisam de uma extensão (ver [05-dados.md](../../docs/arquitetura/05-dados.md)), e aí a imagem do banco no `compose.yaml` muda:

| Serviço | Banco |
| ------- | ----- |
| Território | PostgreSQL com PostGIS |
| Monitoramento | PostgreSQL com TimescaleDB |
| Risco | duas instâncias de PostgreSQL, uma de escrita e outra de leitura (JSONB), cada uma com volume e healthcheck próprios |
| Operações, Equipes, Frota e Notificações | `postgres:17-alpine`, como no modelo |

Use uma imagem com a mesma versão principal do PostgreSQL e confira o caminho do volume de dados na documentação dela.

### BFFs

Os BFFs (Web e Mobile) não têm banco. Ao criar um BFF a partir do modelo:

- remova o serviço `<servico>-db`, o volume, a rede `<servico>-dados` e o `depends_on` do `compose.yaml`;
- remova as variáveis `POSTGRES_*` do `.env.example`, do `environment` do `compose.yaml` e do `validarAmbiente()`;
- remova o `TypeOrmModule` do `GlobalModule`, a pasta `infra/db` e as dependências `typeorm`, `@nestjs/typeorm` e `pg`;
- troque o `pingCheck('database')` do `HealthController` por uma verificação sem banco, e ajuste o teste e2e, que deixa de subir o Postgres com Testcontainers.

## Tamanho da imagem

Medido com `docker image inspect --format '{{.Size}}'`, sobre `node:24-alpine`.

| Dockerfile | Tamanho |
| ---------- | ------- |
| Estágio único (build e execução na mesma imagem, com `devDependencies`, `src/` e TypeScript) | 667 MB |
| Multi-stage (`build`, `prod-deps`, `final`) | 339 MB |

O multi-stage reduz a imagem em cerca de 49%. A imagem final contém só `dist/`, as dependências de produção e o `package.json`, e roda como o usuário `node`.
