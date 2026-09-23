# Serviço: Clima

## Responsabilidade
Ingestão de chuva observada e previsão meteorológica oficial; composição do
**cenário previsto** por região, comparando o acumulado previsto ao padrão
histórico local.

## Dados de origem
- CEMADEN — chuva observada, cenários de risco geo-hidrológico
- INMET — previsão meteorológica, boletins de acumulado previsto

## Natureza do serviço
Escrita contínua e assíncrona (polling periódico de fontes externas), alto
volume. Cada boletim de previsão é versionado pelo horário de emissão, para
manter a rastreabilidade exigida na Parte 1.

## Consome de
Nenhum serviço interno — apenas fontes externas (CEMADEN, INMET).

## É consumido por
- Análise de Risco (evento: `LeituraChuvaRegistrada`, `PrevisaoAtualizada`)
- BFF Web
- BFF Mobile

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5 (`docs/arquitetura/05-database-per-service.md`).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.