# 4.1 — Decomposição em Microsserviços

> Parte 2 · Arquitetura · Pluvia

## Visão geral

A decomposição parte dos quatro fluxos de negócio já identificados na Parte 1
(abertura de ação preventiva, atualização de previsão, validação de ocorrência
e encerramento de ação em campo) e da assimetria entre escrita intensiva
(ingestão de dados públicos, registro de ocorrências, movimentação de ações) e
leitura otimizada (painéis comparativos, consultas históricas).

Identificamos **6 serviços de domínio**, cada um dono exclusivo do seu dado.

## Serviços

### 1. Território
**Responsabilidade:** cadastro de regiões monitoradas, características do
território (proximidade de curso d'água, tipo de ocupação) e indicadores de
vulnerabilidade extraídos do IBGE (Censo 2022, aglomerados subnormais).

**Natureza do dado:** referência, baixíssima frequência de escrita (atualização
censitária, anos). Lido por praticamente todos os outros serviços.

### 2. Clima
**Responsabilidade:** ingestão de chuva observada (CEMADEN) e previsão
meteorológica oficial (INMET); composição do **cenário previsto** por região,
associando o acumulado previsto ao padrão histórico local.

**Natureza do dado:** escrita contínua e assíncrona (polling periódico de
fontes externas), alto volume, necessidade de versionar cada boletim pelo
horário de emissão (rastreabilidade exigida na Parte 1).

### 3. Ocorrências
**Responsabilidade:** registro, validação técnica e histórico de ocorrências
observadas em campo, por região.

**Natureza do dado:** workflow próprio de ciclo de vida (registrada → validada
→ eventualmente revertida). Isolar esse workflow evita que sua lógica de
validação trave a leitura de painel.

### 4. Análise de Risco (IA)
**Responsabilidade:** consumir eventos de Clima, Território e Ocorrências;
produzir panorama de risco contextual, identificar convergência entre
indicadores e gerar sinalizações de atenção com síntese explicável.

**Natureza do dado:** predominantemente leitura, otimizada para painel —
candidato natural a CQRS (seção 4.7). É o único serviço com carga de IA/RAG.

### 5. Ações Preventivas
**Responsabilidade:** planejamento de ações preventivas a partir de uma
sinalização de atenção; alocação de equipe, veículo e equipamento (recursos
finitos e disputados); acompanhamento até confirmação em campo.

**Natureza do dado:** único serviço com transação de negócio real, que reserva
recurso escasso e exige compensação de verdade se falhar. É o orquestrador da
SAGA (seção 4.6).

### 6. Notificação
**Responsabilidade:** entrega de sinalizações de atenção e resultados de ações
aos dois perfis de usuário (equipe técnica via painel web, agentes de campo via
app mobile).

**Natureza do dado:** consumidor assíncrono puro, sem estado de negócio
próprio relevante além do registro de envio/entrega.

## Justificativa das fronteiras

**Por que não um serviço único "Risco" que junta Clima + Ocorrências +
Análise?**
Porque cada um muda por razão e ritmo diferentes: Clima muda a cada boletim
(minutos), Ocorrências muda por evento de campo (esporádico, mas com workflow
de validação), Análise muda por reprocessamento de IA. Juntar os três criaria
um serviço com múltiplas razões concorrentes para mudar, violando
responsabilidade única e dificultando escalar cada parte de forma
independente (Clima precisa de muito mais throughput de ingestão que os
outros).

**Por que separar Análise de Risco de Ações Preventivas?**
São dois lados da assimetria leitura/escrita explicitada na Parte 1: Análise
lê e sintetiza (perfil de consulta, tolera consistência eventual, se beneficia
de CQRS); Ações Preventivas escreve e compromete recursos finitos (perfil
transacional, precisa de garantias fortes de que um recurso não seja alocado
duas vezes). Misturar os dois obrigaria o mesmo serviço a satisfazer
requisitos de consistência opostos.

**Por que Notificação é um serviço à parte, e não lógica dentro de Análise ou
Ações Preventivas?**
Para que nenhum serviço de domínio precise conhecer os canais de entrega (web
× mobile) nem a lógica de "quem deve ser avisado de quê". Isso também
prepara o terreno para os dois BFFs da seção 4.4, que consultam Notificação
de formas diferentes conforme o cliente.

**Por que Território é um serviço isolado, e não uma tabela compartilhada?**
Porque em um sistema distribuído com banco por serviço (4.5) não existe tabela
compartilhada. Território responde por consulta síncrona de baixa frequência,
e seu ritmo de mudança (anos) é ordens de magnitude mais lento que o de Clima
ou Ocorrências — não faz sentido versionar/escalar junto.

## Diagramas

- [`diagramas/componentes.mmd`](./diagramas/componentes.mmd) — componentes e
  dependências de fontes externas.
- [`diagramas/comunicacao.mmd`](./diagramas/comunicacao.mmd) — comunicação
  entre serviços (síncrona vs. eventos assíncronos).

## Fora do escopo desta seção

A definição de contratos REST completos (4.2), o gateway (4.3), os BFFs (4.4),
a tecnologia de banco por serviço (4.5), a SAGA (4.6) e o CQRS (4.7) são
tratados nos documentos seguintes desta mesma pasta, todos assumindo esta
decomposição como ponto de partida.