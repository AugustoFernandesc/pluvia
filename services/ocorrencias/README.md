# Serviço: Ocorrências

## Responsabilidade
Registro, validação técnica e histórico de ocorrências observadas em campo,
por região.

## Dados de origem
- Atlas Digital de Desastres / S2ID (carga histórica inicial)
- Registros originados em campo, via BFF Mobile

## Natureza do serviço
Ciclo de vida próprio: ocorrência registrada → validada → eventualmente
revertida. Isolado dos demais para que seu workflow de validação não trave a
leitura de painel em Análise de Risco.

## Consome de
Nenhum serviço interno — carga inicial do S2ID e registros diretos de campo.

## É consumido por
- Análise de Risco (evento: `OcorrenciaValidada`, `OcorrenciaRevertida`)
- BFF Web
- BFF Mobile

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5 (`docs/arquitetura/05-database-per-service.md`).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.