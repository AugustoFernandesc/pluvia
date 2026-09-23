# Serviço: Análise de Risco (IA)

## Responsabilidade
Consumir eventos de Clima, Território e Ocorrências; produzir panorama de
risco contextual, identificar convergência entre indicadores e gerar
sinalizações de atenção com síntese explicável, com apoio de IA.

## Dados de origem
Eventos internos publicados por Clima e Ocorrências, e consulta síncrona a
Território.

## Natureza do serviço
Predominantemente leitura, otimizada para consumo em painel. Candidato
natural a CQRS (seção 4.7): modelo de escrita difere do modelo de leitura
otimizado para os dashboards.

## Consome de
- Clima (evento: `LeituraChuvaRegistrada`, `PrevisaoAtualizada`)
- Ocorrências (evento: `OcorrenciaValidada`, `OcorrenciaRevertida`)
- Território (consulta síncrona)
- Ações Preventivas (evento: `AcaoConcluida`)

## É consumido por
- Ações Preventivas (evento: `SinalizacaoAtencaoGerada`)
- Notificação (evento: `SinalizacaoAtencaoGerada`)
- BFF Web
- BFF Mobile

## Contrato
Ver `openapi.yaml` nesta pasta (a definir na seção 4.2).

## Banco de dados
A definir na seção 4.5. Serviço de referência para a aplicação de CQRS
(seção 4.7).

## Status
📄 Documentação — Parte 2. Sem código de implementação nesta etapa.