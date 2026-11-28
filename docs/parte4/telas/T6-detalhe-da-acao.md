# T6 · Detalhe da ação

Dono: Lucas. Rota do painel: `/acoes/:acaoId`. Uma mudança pequena no BFF.

Padrões de código, componentes e regras: [clients/web/README.md](../../../clients/web/README.md). O que é fixo e o que fica a critério de quem implementa: [README desta pasta](README.md). O painel antigo tem a linha do tempo da SAGA em `clients/web/legado/app.js`, para consulta.

## Para que serve

Mostrar o que aconteceu com uma ação: se foi confirmada, com qual equipe e veículo, ou por que foi recusada e o que foi desfeito. É a tela que prova a SAGA no vídeo.

## Quem usa

Gestor e Técnico.

## Chamadas

| Chamada | Quando | Usa |
|---|---|---|
| `GET /web/v1/acoes/:acaoId` | ao abrir | os campos da ação |
| `GET /web/v1/acoes/:acaoId/saga` | ao abrir | `estado`, `motivo`, `passos`, `iniciadaEm`, `encerradaEm` |
| `GET /web/v1/painel?municipio=Lavras` | ao abrir | nome da região |
| `GET /web/v1/planejamento/disponibilidade?data=<data da ação>` | quando a ação tem equipe ou veículo | nome da equipe e identificação do veículo |

Cada passo traz `mensagem`, `direcao` (`ENVIADA` ou `RECEBIDA`), `participante` (`EQUIPES` ou `FROTA`), `detalhe` e `registradoEm`.

Enquanto a ação estiver pendente, a tela busca as duas primeiras chamadas de novo a cada 2 segundos, até o estado mudar ou passarem 30 segundos.

## O que mostra

1. **Cabeçalho:** tipo da ação, região, data e turno, e o `ChipEstado`.
2. **Resultado**, em uma frase:
   - Confirmada: "Equipe <nome> e <veículo> reservados para <data>, <turno>."
   - Rejeitada: o `motivoRejeicao`.
   - Cancelada: o `motivoCancelamento`.
   - Pendente: "Reservando equipe e veículo…" com indicador de andamento.
3. **Linha do tempo:** um item por passo, na ordem de `registradoEm`, com a hora e uma frase:

   | `mensagem` | Frase |
   |---|---|
   | `ReservarEquipe` | Pedido de reserva enviado a Equipes |
   | `EquipeReservada` | Equipe reservada |
   | `ReservaEquipeRecusada` | Equipes recusou: `detalhe` |
   | `ReservarRecurso` | Pedido de reserva enviado a Frota |
   | `RecursoReservado` | Veículo reservado |
   | `ReservaRecursoRecusada` | Frota recusou: `detalhe` |
   | `LiberarEquipe` | Reserva da equipe desfeita |
   | `EquipeLiberada` | Equipe liberada |
   | `LiberarRecurso` | Reserva do veículo desfeita |
   | `RecursoLiberado` | Veículo liberado |

   Passos de recusa em vermelho; passos que desfazem uma reserva em amarelo, com o rótulo "Compensação".
4. **Dados da ação:** descrição, especialidade, tipo de veículo e, se houver, o link para a sinalização de origem.

Mensagem fora da tabela aparece com o próprio nome, para a tela não quebrar.

## Modo bastidores

- Por passo: o nome da `mensagem`, a `direcao` e o `participante`.
- No rodapé: `sagaId`, estado da SAGA (`COMPENSADA`, por exemplo) e o tempo entre `iniciadaEm` e `encerradaEm`.

## O que muda no back

- `GET /web/v1/acoes/:acaoId/saga` hoje só aceita Gestor. Liberar também para Técnico em `acoes.controller.ts` do BFF Web, já que é só leitura.

## Pronta quando

- Uma ação confirmada mostra equipe, veículo e os passos de reserva.
- Uma ação recusada pela Frota depois de a equipe ter sido reservada mostra a recusa e a liberação da equipe, marcada como compensação.
- Uma ação recém-aberta sai de pendente sozinha, sem recarregar a página.
- Nenhum UUID ou nome de mensagem aparece com o modo bastidores desligado.
