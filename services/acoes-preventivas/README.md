# Serviço: Ações Preventivas

## Responsabilidade
Planejamento de ações preventivas a partir de uma sinalização de atenção;
alocação de equipe, veículo e equipamento (recursos finitos e disputados);
acompanhamento da execução até a confirmação em campo.

## Dados de origem
Evento de sinalização de atenção (Análise de Risco) e registros de execução
via BFF Mobile.

## Natureza do serviço
Único serviço com transação de negócio real: reserva de recurso escasso, com
necessidade de compensação efetiva em caso de falha ou cancelamento. É o
orquestrador da SAGA (seção 4.6).

## Consome de
- Análise de Risco (evento: `SinalizacaoAtencaoGerada`)

## É consumido por
- Análise de Risco (evento: `AcaoConcluida`)
- Notificação (evento: `AcaoAberta`, `AcaoConcluida`)
- BFF Web
- BFF Mobile

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5. Serviço de referência para o padrão outbox e para a
SAGA (seções 4.5 e 4.6).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.