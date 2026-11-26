# Frota

Cadastro de veículos e equipamentos, manutenções e **participante da SAGA** de abertura de ação ([06-saga.md](../../docs/arquitetura/06-saga.md)). O orquestrador é [Operações](../operacoes/README.md), que também traz o roteiro da demo.

## Na SAGA

| Mensagem recebida | Fila | Efeito | Resposta em `operacoes.respostas` |
|---|---|---|---|
| `ReservarRecurso` | `frota.comandos` | Reserva `PROVISORIA` do primeiro recurso operacional da categoria que não esteja reservado nem em manutenção no turno | `RecursoReservado` ou `ReservaRecursoRecusada`, com o motivo |
| `LiberarRecurso` | `frota.comandos` | Reserva da SAGA passa a `CANCELADA` | `RecursoLiberado`, mesmo se não havia reserva |
| `AcaoPreventivaConfirmada` | `frota.eventos` | Reserva passa a `CONFIRMADA` (T5) | nenhuma |
| `AcaoPreventivaCancelada` | `frota.eventos` | Reserva passa a `CANCELADA` | nenhuma |

Os turnos seguem o horário de Lavras (UTC-3): `MANHA` 6h às 12h, `TARDE` 12h às 18h, `NOITE` 18h às 24h. Uma manutenção bloqueia o turno se o período dela cruzar o do turno.

Idempotência, índice contra dupla alocação e outbox funcionam como em [Equipes](../equipes/README.md#na-saga).

## Endpoints

| Método | Caminho | |
|---|---|---|
| `GET` | `/v1/recursos?categoria=` | recursos, com `emManutencaoAgora` |
| `POST` | `/v1/recursos/{id}/manutencoes` | `201`; corpo `{ "inicio", "fim", "motivo" }` em ISO 8601 |
| `GET` | `/v1/disponibilidade?data=AAAA-MM-DD&categoria=` | turnos livres, `RESERVADO` ou `EM_MANUTENCAO` |

## Seed

A migração cria **um único** caminhão hidrojato, `9b3c4d50-0000-4000-8000-000000000001` (`HJT1A23`). Ser único é o que permite provocar a falha da SAGA na demo: com ele em manutenção, não há recurso para reservar.

## Configuração e testes

Variáveis `POSTGRES_*`, `PORT` e `RABBITMQ_*`, como em [Operações](../operacoes/README.md#configuração). `npm test` roda os testes unitários (turnos, manutenção, escolha do recurso) e o e2e do health com Testcontainers.
