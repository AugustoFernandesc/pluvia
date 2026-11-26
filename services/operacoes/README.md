# Operações

Ciclo de vida das ações preventivas e **orquestrador da SAGA** de abertura de ação. O desenho está em [06-saga.md](../../docs/arquitetura/06-saga.md) e o contrato em [operacoes.yaml](../../docs/api/operacoes.yaml).

## A SAGA

Abrir uma ação preventiva exige reservar uma **equipe** (serviço Equipes) e um **recurso** (serviço Frota) para o mesmo turno. Cada um tem banco próprio, então não existe transação distribuída: Operações coordena uma sequência de transações locais, cada uma com sua compensação.

| Passo | Serviço | Transação | Compensação |
|---|---|---|---|
| T1 | Operações | Ação `PENDENTE`, SAGA `AGUARDANDO_EQUIPE`, envia `ReservarEquipe` | Ação `REJEITADA` |
| T2 | Equipes | Reserva `PROVISORIA` da equipe | `LiberarEquipe` |
| T3 | Frota | Reserva `PROVISORIA` do recurso | `LiberarRecurso` |
| T4 | Operações | Ação `CONFIRMADA`, publica `AcaoPreventivaConfirmada` | **pivô**, sem compensação |
| T5 | Equipes e Frota | Reservas passam a `CONFIRMADA` | repetível |

A ordem é fixa: **equipe e depois recurso**. Se Frota recusar, Operações manda `LiberarEquipe` e a ação termina `REJEITADA`. Se um participante não responder em 30 s (`SAGA_PRAZO_S`), Operações compensa tudo o que pode ter sido reservado; uma resposta que chegue depois é registrada e ignorada.

```text
POST /v1/acoes ─▶ outbox ─▶ pluvia.comandos ─▶ equipes.comandos ─▶ Equipes
                                             ─▶ frota.comandos   ─▶ Frota
Equipes / Frota ─▶ outbox ─▶ pluvia.comandos ─▶ operacoes.respostas ─▶ Operações
Operações ─▶ outbox ─▶ pluvia.eventos (operacoes.acao.confirmada | rejeitada | cancelada)
```

### Outbox

A mudança de estado da SAGA e o `INSERT` na tabela `outbox` acontecem **na mesma transação**. Um publicador, a cada 1 s, lê o que tem `publicado_em IS NULL`, publica no RabbitMQ com confirmação do broker e só então marca a data. Sem isso, se o serviço caísse entre gravar no banco e publicar, o comando se perderia (*dual write*). Equipes e Frota usam a mesma outbox para as respostas.

### Idempotência

- Todo serviço grava o `id` de cada mensagem consumida em `mensagens_processadas`, na mesma transação do efeito. Uma mensagem repetida é ignorada.
- Equipes e Frota usam o `sagaId` como chave: a mesma SAGA nunca ganha duas reservas, e liberar o que não existe conta como sucesso.
- Operações descarta a resposta que não combina com o estado atual da SAGA (por exemplo, `RecursoReservado` depois de compensar).
- Os consumidores usam `prefetch(1)`: cada fila é tratada em ordem, que é o que a SAGA espera.

### Bloqueio semântico e HATEOAS

`GET /v1/acoes/{id}` devolve HAL. Enquanto a ação está `PENDENTE` (SAGA em curso), não há link de transição, e `POST /v1/acoes/{id}/cancelamento` responde `409`. Depois de `CONFIRMADA`, aparece o link `cancelar`.

## Endpoints

| Método | Caminho | Resposta |
|---|---|---|
| `POST` | `/v1/acoes` | `202`, `Location`, ação `PENDENTE` em HAL |
| `GET` | `/v1/acoes?estado=&regiaoId=&pagina=&tamanho=` | página de ações |
| `GET` | `/v1/acoes/{id}` | ação com `_links` conforme o estado |
| `GET` | `/v1/acoes/{id}/saga` | estado da SAGA e cada mensagem enviada e recebida |
| `POST` | `/v1/acoes/{id}/cancelamento` | `200` se `CONFIRMADA`; `409` se não |

Erros saem em `application/problem+json`.

## Configuração

Além das variáveis `POSTGRES_*` e `PORT` do modelo:

| Variável | Origem no compose | Uso |
|---|---|---|
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_VHOST` | `environment` | broker |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | `.env` | mesmos valores de `RABBITMQ_SERVICOS_*` em `infra/rabbitmq/.env` |
| `SAGA_PRAZO_S` | opcional | prazo de cada resposta antes de compensar (padrão 30) |

## Testes

```bash
npm ci
npm test
```

O `test/saga.e2e-spec.ts` sobe PostgreSQL e RabbitMQ com Testcontainers, cria a topologia a partir do `infra/rabbitmq/definitions.json` e exercita o orquestrador de verdade (HTTP, banco, outbox, broker, consumidor). Equipes e Frota entram como participantes de teste que leem as filas `equipes.comandos` e `frota.comandos` e respondem em `operacoes.respostas`. Cenários: caminho feliz, recurso recusado com compensação, timeout com resposta atrasada, mensagem repetida, `409` em ação pendente e `400` em requisição inválida.

## Roteiro da demo

Os serviços não publicam porta no host. Os comandos usam um container do `curl` na rede `pluvia_aplicacao`. Rode no Git Bash, na raiz do repositório.

```bash
docker compose up -d --build rabbitmq operacoes equipes frota
api() { docker run --rm --network pluvia_aplicacao curlimages/curl:8.11.1 -s "$@"; echo; }
AMANHA=$(date -d tomorrow +%F)
CAMINHAO=9b3c4d50-0000-4000-8000-000000000001
```

### 1. Caminho feliz

```bash
api -i -X POST http://operacoes:3000/v1/acoes -H 'Content-Type: application/json' \
  -d '{"regiaoId":"6f1c2a10-0000-4000-8000-000000000001","tipo":"LIMPEZA_DRENAGEM","data":"'$AMANHA'","turno":"MANHA","especialidade":"DRENAGEM","categoriaRecurso":"CAMINHAO_HIDROJATO"}'
```

Responde `202` com a ação `PENDENTE` e o `Location`. Copie o `id` e, depois de uns 3 s:

```bash
ACAO=<id da ação>
api http://operacoes:3000/v1/acoes/$ACAO        # CONFIRMADA, com equipeId, recursoId e link cancelar
api http://operacoes:3000/v1/acoes/$ACAO/saga   # CONCLUIDA: ReservarEquipe, EquipeReservada, ReservarRecurso, RecursoReservado
```

### 2. Falha com compensação

1. Existe um único caminhão hidrojato:

   ```bash
   api http://frota:3000/v1/recursos
   ```

2. Registrar manutenção dele para a tarde de amanhã:

   ```bash
   api -X POST http://frota:3000/v1/recursos/$CAMINHAO/manutencoes -H 'Content-Type: application/json' \
     -d '{"inicio":"'$AMANHA'T12:00:00-03:00","fim":"'$AMANHA'T18:00:00-03:00","motivo":"Revisão da bomba de alta pressão"}'
   ```

3. Pedir uma limpeza de drenagem nesse turno:

   ```bash
   api -X POST http://operacoes:3000/v1/acoes -H 'Content-Type: application/json' \
     -d '{"regiaoId":"6f1c2a10-0000-4000-8000-000000000003","tipo":"LIMPEZA_DRENAGEM","data":"'$AMANHA'","turno":"TARDE","especialidade":"DRENAGEM","categoriaRecurso":"CAMINHAO_HIDROJATO"}'
   ```

4. Ver a SAGA: equipe reservada, recurso recusado, equipe liberada. A ação termina `REJEITADA`, com o motivo.

   ```bash
   ACAO=<id da ação>
   api http://operacoes:3000/v1/acoes/$ACAO/saga
   api http://operacoes:3000/v1/acoes/$ACAO
   ```

5. A equipe voltou a ficar livre na tarde (a manhã segue reservada pelo passo 1):

   ```bash
   api "http://equipes:3000/v1/disponibilidade?data=$AMANHA"
   api "http://frota:3000/v1/disponibilidade?data=$AMANHA"   # tarde EM_MANUTENCAO
   ```

### Extras para a arguição

- **Bancos separados:** `docker compose ps` mostra `operacoes-db`, `equipes-db` e `frota-db`, cada um numa rede própria.
- **Outbox:** `docker compose exec operacoes-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select tipo, routing_key, publicado_em from outbox order by seq"'`.
- **Filas:** painel do RabbitMQ em <http://localhost:15672>, vhost `pluvia`.
- **Bloqueio semântico e timeout:** `docker compose stop equipes` e abra uma ação. Ela fica `PENDENTE`, sem link de transição, e `POST /v1/acoes/{id}/cancelamento` responde `409`. Com `docker compose start equipes` em menos de 30 s, o `ReservarEquipe` que esperava na fila é processado e a SAGA segue. Passados 30 s, Operações compensa sozinha e a ação termina `REJEITADA` por prazo.
- **Recomeçar do zero:** `docker compose down -v operacoes equipes frota operacoes-db equipes-db frota-db` apaga os volumes; as migrações recriam as tabelas e o seed na próxima subida.
