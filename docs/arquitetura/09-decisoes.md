# Registro de decisões técnicas

Cada decisão registra o contexto, o que foi decidido, as alternativas consideradas e as consequências. Decisões substituídas não são apagadas; recebem o status `Substituída` com referência à nova.

---

## ADR-001 · Seis serviços de domínio

**Status:** Aceita

**Contexto.** O enunciado exige ao menos quatro serviços de domínio. Cada serviço adicional custa Dockerfile, banco, deployment e um ponto de falha a mais na demonstração ao vivo.

**Decisão.** Seis serviços: Território, Monitoramento, Risco, Operações, Equipes e Frota. Território absorve Ocorrências; Equipes e Frota ficam separados.

**Alternativas.** Sete serviços, com Ocorrências separado. Cinco, com Equipes e Frota juntos num serviço de Recursos.

**Consequências.** Nenhum padrão avaliado é enfraquecido pela fusão de Território e Ocorrências. Manter Equipes e Frota separados é o que dá à SAGA três participantes com compensação real. Justificativa completa em [01-decomposicao.md](01-decomposicao.md).

---

## ADR-002 · NestJS nos serviços, Python na Análise

**Status:** Aceita

**Contexto.** O grupo domina TypeScript e React. A Parte 4 exige LangChain e RAG.

**Decisão.** NestJS para serviços de domínio, Notificações e BFFs. Python com FastAPI para o serviço de Análise.

**Alternativas.** Tudo em TypeScript, usando LangChain.js.

**Consequências.** O NestJS oferece módulo de microsserviços com transporte RabbitMQ nativo e geração de OpenAPI. Python dá acesso ao ecossistema mais maduro de LangChain e RAG. O sistema passa a ser poliglota, o que o enunciado incentiva, ao custo de dois ambientes de build.

---

## ADR-003 · PostgreSQL com extensões por serviço

**Status:** Aceita

**Contexto.** Os serviços têm necessidades de dados distintas: espacial, série temporal, documento e vetorial.

**Decisão.** Uma instância PostgreSQL por serviço, com a extensão adequada: PostGIS, TimescaleDB, JSONB e pgvector.

**Alternativas.** MongoDB para o modelo de leitura do Risco, InfluxDB para séries temporais, Qdrant para vetores.

**Consequências.** Cada necessidade é atendida por extensão madura, e o grupo opera uma única tecnologia. O isolamento entre serviços continua total. Detalhes em [05-dados.md](05-dados.md).

---

## ADR-004 · RabbitMQ como broker

**Status:** Aceita

**Contexto.** O sistema precisa de eventos com múltiplos assinantes, comandos ponto a ponto para a SAGA e ingestão MQTT de sensores.

**Decisão.** RabbitMQ, com exchange `topic` para eventos, `direct` para comandos e plugin MQTT para sensores.

**Alternativas.** Kafka.

**Consequências.** RabbitMQ atende os três padrões com um único componente, é mais simples de operar localmente e tem integração nativa com o NestJS. Kafka ofereceria retenção e reprocessamento de histórico, que a Pluvia não precisa no volume atual; a reconstrução do modelo de leitura é resolvida por consulta às fontes.

---

## ADR-005 · SAGA orquestrada

**Status:** Aceita

**Contexto.** A abertura de ação preventiva exige reservas em Equipes e Frota, com compensação em caso de falha.

**Decisão.** SAGA orquestrada, com Operações como orquestrador.

**Alternativas.** SAGA coreografada.

**Consequências.** Fluxo e compensação ficam num único lugar e o estado é consultável por API. Operações se torna ponto central do fluxo, mitigado pela persistência do estado. Justificativa completa em [06-saga.md](06-saga.md).

---

## ADR-006 · Outbox transacional com polling

**Status:** Aceita

**Contexto.** Operações, Equipes, Frota, Território e Risco precisam gravar no banco e publicar mensagem de forma atômica.

**Decisão.** Tabela de outbox gravada na mesma transação, publicada por relay com polling a cada 500 ms e publisher confirms. Consumidores idempotentes com tabela de mensagens processadas.

**Alternativas.** Captura de mudanças com Debezium.

**Consequências.** Garante entrega pelo menos uma vez sem infraestrutura adicional. Latência de publicação de até 500 ms, aceitável para o domínio. Monitoramento é exceção deliberada, com republicação periódica. Detalhes em [05-dados.md](05-dados.md).

---

## ADR-007 · CQRS apenas no Risco

**Status:** Aceita

**Contexto.** O painel de risco é lido continuamente e combina dados de quatro serviços.

**Decisão.** Separar escrita e leitura no Risco, com modelo de leitura em instância PostgreSQL própria, atualizado por projetor a partir de eventos.

**Alternativas.** CQRS também em Operações. Composição do panorama em tempo de consulta.

**Consequências.** Painel rápido e disponível mesmo com fontes fora do ar, ao custo de defasagem de até 30 s. Nos demais serviços não há assimetria que justifique a separação. Detalhes em [07-cqrs.md](07-cqrs.md).

---

## ADR-008 · Versionamento pela URI

**Status:** Aceita

**Contexto.** O enunciado exige estratégia de versionamento justificada.

**Decisão.** Versão no caminho: `/v1/...`. Nova versão apenas para mudança incompatível.

**Alternativas.** Cabeçalho customizado. Negociação por `Accept`.

**Consequências.** Versão visível no roteamento, em logs e na documentação. Detalhes em [02-api-rest.md](02-api-rest.md).

---

## ADR-009 · HAL para HATEOAS

**Status:** Aceita

**Contexto.** O enunciado exige ao menos um recurso com HATEOAS.

**Decisão.** Formato HAL (`application/hal+json`) na ação preventiva, com links que variam conforme o estado. Extensão `method` indica o verbo de cada transição.

**Alternativas.** Siren, JSON:API.

**Consequências.** HAL é o formato mais simples e difundido. Siren descreveria ações de forma mais rica, mas é menos conhecido e desproporcional ao uso.

---

## ADR-010 · Kong como gateway, agregação nos BFFs

**Status:** Aceita

**Contexto.** É preciso um ponto de entrada com roteamento, autenticação e limitação de taxa.

**Decisão.** Kong em modo declarativo, roteando apenas para os BFFs. Agregação e autorização por perfil ficam nos BFFs.

**Alternativas.** Gateway escrito em NestJS. NGINX. Traefik.

**Consequências.** Configuração versionada em um único arquivo, sem código. Responsabilidades claras entre gateway e BFF. Detalhes em [03-gateway.md](03-gateway.md).

---

## ADR-011 · Keycloak como provedor de identidade

**Status:** Aceita

**Contexto.** Gateway e BFFs precisam de tokens com perfis de usuário.

**Decisão.** Keycloak emitindo JWT assinado com RS256, com os papéis `GESTOR`, `TECNICO` e `AGENTE`. O gateway valida a assinatura; os BFFs aplicam a autorização por papel.

**Alternativas.** Serviço de autenticação próprio.

**Consequências.** Nenhum código de autenticação a escrever e manter. Um contêiner a mais na infraestrutura.

---

## ADR-012 · Sensores por contrato MQTT, com simulador

**Status:** Aceita

**Contexto.** A devolutiva da Parte 1 sugeriu sensores de nível em campo. O grupo não vai adquirir hardware.

**Decisão.** Definir um contrato de dispositivo MQTT e implementar um simulador que o respeite. Documentado em [08-eventos.md](08-eventos.md).

**Alternativas.** Não incluir sensores. Adquirir hardware.

**Consequências.** A arquitetura fica pronta para dispositivos reais sem nenhuma alteração. O simulador permite reproduzir falhas de forma controlada, o que seria difícil com hardware.

---

## ADR-013 · Alertas operacionais internos

**Status:** Aceita

**Contexto.** A devolutiva da Parte 1 sugeriu envio de alertas. A proposta declara que a Pluvia não emite alerta oficial à população.

**Decisão.** O serviço de Notificações envia alertas **operacionais e internos**, dirigidos à equipe técnica e aos agentes inscritos por região, disparados por sinalização de atenção, ação atribuída ou sensor inativo.

**Alternativas.** Alertas públicos à população. Nenhum alerta.

**Consequências.** Atende a devolutiva sem contradizer o posicionamento da proposta. Alerta à população continua sendo atribuição da Defesa Civil.
