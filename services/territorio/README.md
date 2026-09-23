# Serviço: Território

## Responsabilidade
Cadastro de regiões monitoradas, características territoriais (proximidade de
curso d'água, tipo de ocupação, infraestrutura) e indicadores de
vulnerabilidade extraídos de fontes públicas.

## Dados de origem
- IBGE — Censo 2022 (população, domicílios, ocupação)
- IBGE — MUNIC (instrumentos municipais de gestão de risco)

## Natureza do serviço
Dado de referência, baixa frequência de escrita. Consumido por praticamente
todos os demais serviços via consulta síncrona.

## Consome de
Nenhum serviço interno — apenas fontes externas (IBGE).

## É consumido por
- Análise de Risco (consulta síncrona)
- BFF Web

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5 (`docs/arquitetura/05-database-per-service.md`).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.