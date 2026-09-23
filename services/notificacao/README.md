# Serviço: Notificação

## Responsabilidade
Entrega de sinalizações de atenção e resultados de ações preventivas aos dois
perfis de usuário: equipe técnica (painel web) e agentes de campo/comunidade
(app mobile).

## Dados de origem
Eventos publicados por Análise de Risco e Ações Preventivas.

## Natureza do serviço
Consumidor assíncrono puro, sem lógica de negócio própria além do controle de
envio/entrega. Isola os demais serviços de precisar conhecer canais de
entrega específicos de cada cliente.

## Consome de
- Análise de Risco (evento: `SinalizacaoAtencaoGerada`)
- Ações Preventivas (evento: `AcaoAberta`, `AcaoConcluida`)

## É consumido por
- BFF Web
- BFF Mobile

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5 (`docs/arquitetura/05-database-per-service.md`).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.