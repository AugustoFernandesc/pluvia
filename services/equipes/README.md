# Equipes

Cadastro das equipes de campo e **participante da SAGA** de abertura de ação ([06-saga.md](../../docs/arquitetura/06-saga.md)). O orquestrador é [Operações](../operacoes/README.md), que também traz o roteiro da demo.

## Na SAGA

| Mensagem recebida | Fila | Efeito | Resposta em `operacoes.respostas` |
|---|---|---|---|
| `ReservarEquipe` | `equipes.comandos` | Reserva `PROVISORIA` da primeira equipe ativa e livre da especialidade (ou da `equipeId` pedida) | `EquipeReservada` ou `ReservaEquipeRecusada` |
| `LiberarEquipe` | `equipes.comandos` | Reserva da SAGA passa a `CANCELADA` | `EquipeLiberada`, mesmo se não havia reserva |
| `AcaoPreventivaConfirmada` | `equipes.eventos` | Reserva passa a `CONFIRMADA` (T5) | nenhuma |
| `AcaoPreventivaCancelada` | `equipes.eventos` | Reserva passa a `CANCELADA` | nenhuma |

- **Idempotência:** o `id` de cada mensagem vai para `mensagens_processadas` na mesma transação do efeito; o `sagaId` é único em `reservas`, então a mesma SAGA nunca ganha duas reservas.
- **Sem dupla alocação:** um índice único parcial impede duas reservas ativas da mesma equipe no mesmo turno.
- **Outbox:** a resposta é gravada na tabela `outbox` junto com a reserva e publicada a cada 1 s.

## Endpoints

| Método | Caminho | |
|---|---|---|
| `GET` | `/v1/equipes?especialidade=` | equipes cadastradas |
| `GET` | `/v1/disponibilidade?data=AAAA-MM-DD&especialidade=` | turnos livres ou reservados de cada equipe |

## Seed

A migração cria duas equipes com ids fixos:

| Id | Nome | Especialidade |
|---|---|---|
| `8a2b3c40-0000-4000-8000-000000000001` | Equipe Drenagem Centro | `DRENAGEM` |
| `8a2b3c40-0000-4000-8000-000000000002` | Equipe Vistoria Norte | `VISTORIA` |

## Configuração e testes

Variáveis `POSTGRES_*`, `PORT` e `RABBITMQ_*`, como em [Operações](../operacoes/README.md#configuração). `npm test` roda os testes unitários e o e2e do health com Testcontainers.
