# 4.2 API REST

Os contratos completos de cada serviço estão em OpenAPI 3.0, na pasta [`../api`](../api):

| Serviço | Contrato |
|---|---|
| Território | [territorio.yaml](../api/territorio.yaml) |
| Monitoramento | [monitoramento.yaml](../api/monitoramento.yaml) |
| Risco | [risco.yaml](../api/risco.yaml) |
| Operações | [operacoes.yaml](../api/operacoes.yaml) |
| Equipes | [equipes.yaml](../api/equipes.yaml) |
| Frota | [frota.yaml](../api/frota.yaml) |
| Notificações | [notificacoes.yaml](../api/notificacoes.yaml) |
| Análise | [analise.yaml](../api/analise.yaml) |
| BFF Web | [bff-web.yaml](../api/bff-web.yaml) |
| BFF Mobile | [bff-mobile.yaml](../api/bff-mobile.yaml) |

Os arquivos podem ser abertos no [Swagger Editor](https://editor.swagger.io). Na implementação, o `@nestjs/swagger` gera o OpenAPI a partir do código, e o contrato desta pasta serve como referência para conferir se a implementação respeita o que foi projetado.

---

## O que cada serviço oferece

Resumo, em linguagem simples, do que dá para fazer em cada serviço. Os detalhes técnicos (campos, exemplos e erros) estão nos arquivos `.yaml`.

**Como ler a coluna Método:** `GET` consulta, `POST` cria ou executa uma ação, `PUT` substitui uma informação inteira, `PATCH` altera parte de um cadastro e `DELETE` remove. Um trecho entre chaves, como `{regiaoId}`, é trocado pelo código do item.

### BFF Web (painel do gestor e do técnico)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/painel` | Mostra a situação de todas as regiões numa tela só |
| `GET` | `/regioes/{regiaoId}` | Mostra tudo sobre uma região: chuva, risco, ocorrências e ações |
| `GET` | `/planejamento/disponibilidade` | Mostra quais equipes e veículos estão livres numa data |
| `GET` | `/acoes` | Lista as ações preventivas |
| `POST` | `/acoes` | Pede uma ação preventiva; o sistema tenta reservar equipe e veículo |
| `GET` | `/acoes/{acaoId}` | Mostra uma ação e o que ainda pode ser feito com ela |
| `POST` | `/acoes/{acaoId}/cancelamento` | Cancela uma ação já confirmada (só o gestor) |
| `GET` | `/sinalizacoes` | Lista os alertas de risco gerados pelo sistema |
| `POST` | `/sinalizacoes/{sinalizacaoId}/reconhecimento` | Marca que o alerta foi visto |
| `GET` | `/ocorrencias` | Lista os problemas relatados, inclusive os que aguardam conferência |
| `POST` | `/ocorrencias/{ocorrenciaId}/validacao` | Confirma ou descarta um problema relatado (só o técnico) |

### BFF Mobile (aplicativo do agente de campo e do cidadão)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/publico/regioes/localizar` | Descobre em que região a pessoa está, pelo GPS do celular |
| `GET` | `/publico/regioes/{regiaoId}/resumo` | Explica a situação da região em linguagem simples, sem login |
| `GET` | `/minhas-acoes` | Lista as tarefas da equipe do agente |
| `GET` | `/acoes/{acaoId}` | Mostra uma tarefa e os botões que o agente pode usar |
| `POST` | `/acoes/{acaoId}/inicio` | Avisa que a equipe começou o trabalho no local |
| `POST` | `/acoes/{acaoId}/conclusao` | Avisa que terminou e conta o que foi feito |
| `POST` | `/ocorrencias` | Relata um problema visto na rua, como um bueiro entupido |
| `GET` | `/notificacoes` | Mostra os avisos recebidos pelo agente |
| `POST` | `/notificacoes/{notificacaoId}/leitura` | Marca um aviso como lido |

### Território (regiões e ocorrências)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/regioes` | Lista as regiões monitoradas da cidade |
| `POST` | `/regioes` | Cadastra uma região nova |
| `GET` | `/regioes/localizacao` | Diz em que região fica um ponto do mapa |
| `GET` | `/regioes/{regiaoId}` | Mostra os dados de uma região |
| `PATCH` | `/regioes/{regiaoId}` | Corrige dados de uma região |
| `GET` | `/regioes/{regiaoId}/vulnerabilidade` | Mostra o quanto a região é frágil a alagamentos |
| `PUT` | `/regioes/{regiaoId}/vulnerabilidade` | Define essa fragilidade |
| `GET` | `/ocorrencias` | Lista os problemas relatados |
| `POST` | `/ocorrencias` | Relata um problema |
| `GET` | `/ocorrencias/{ocorrenciaId}` | Mostra um problema relatado |
| `POST` | `/ocorrencias/{ocorrenciaId}/validacao` | Registra se o problema foi confirmado ou descartado |
| `POST` | `/importacoes` | Importa o histórico oficial de alagamentos |
| `GET` | `/importacoes/{importacaoId}` | Mostra o andamento da importação |

### Monitoramento (chuva e sensores)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/estacoes` | Lista as estações que medem chuva |
| `GET` | `/estacoes/{estacaoId}` | Mostra uma estação |
| `GET` | `/sensores` | Lista os sensores de nível de água |
| `POST` | `/sensores` | Cadastra um sensor |
| `GET` | `/sensores/{sensorId}` | Mostra um sensor e a última medição |
| `GET` | `/leituras` | Mostra as medições de um período |
| `GET` | `/regioes/{regiaoId}/acumulados` | Mostra quanto choveu na região nas últimas horas |
| `GET` | `/previsoes` | Mostra as previsões do tempo em vigor |
| `GET` | `/previsoes/{previsaoId}` | Mostra uma previsão |
| `POST` | `/ingestoes` | Manda buscar dados novos de uma fonte agora |
| `GET` | `/ingestoes/{ingestaoId}` | Mostra o andamento dessa busca |

### Risco (nível de atenção)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/panoramas` | Lista as regiões da mais perigosa para a menos perigosa |
| `GET` | `/panoramas/{regiaoId}` | Mostra o risco de uma região e o motivo |
| `GET` | `/panoramas/{regiaoId}/cenario-previsto` | Mostra o que a previsão do tempo significa para a região |
| `GET` | `/regioes/{regiaoId}/parametros` | Mostra os limites usados para calcular o risco |
| `PUT` | `/regioes/{regiaoId}/parametros` | Ajusta esses limites |
| `GET` | `/sinalizacoes` | Lista os alertas de risco |
| `GET` | `/sinalizacoes/{sinalizacaoId}` | Mostra um alerta |
| `POST` | `/sinalizacoes/{sinalizacaoId}/reconhecimento` | O técnico avisa que viu o alerta |
| `POST` | `/sinalizacoes/{sinalizacaoId}/encerramento` | O técnico encerra o alerta |

### Operações (ações preventivas)

| Método | Caminho | Para que serve |
|---|---|---|
| `POST` | `/acoes` | Pede uma ação preventiva, como limpar um bueiro antes da chuva |
| `GET` | `/acoes` | Lista as ações |
| `GET` | `/acoes/{acaoId}` | Mostra uma ação e os próximos passos possíveis |
| `POST` | `/acoes/{acaoId}/inicio` | Registra que o trabalho começou |
| `POST` | `/acoes/{acaoId}/conclusao` | Registra que o trabalho terminou e o resultado |
| `POST` | `/acoes/{acaoId}/cancelamento` | Cancela uma ação confirmada |
| `GET` | `/acoes/{acaoId}/saga` | Mostra em que passo está a reserva de equipe e veículo |

### Equipes

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/equipes` | Lista as equipes |
| `POST` | `/equipes` | Cadastra uma equipe |
| `GET` | `/equipes/{equipeId}` | Mostra uma equipe |
| `PATCH` | `/equipes/{equipeId}` | Corrige dados de uma equipe |
| `GET` | `/equipes/{equipeId}/disponibilidade` | Mostra em que turnos a equipe está livre numa data |
| `GET` | `/disponibilidade` | Mostra quais equipes estão livres numa data |
| `GET` | `/equipes/{equipeId}/indisponibilidades` | Lista folgas e afastamentos da equipe |
| `POST` | `/equipes/{equipeId}/indisponibilidades` | Registra um período em que a equipe não pode trabalhar |
| `GET` | `/reservas` | Lista as equipes já reservadas |
| `GET` | `/reservas/{reservaId}` | Mostra uma reserva |

### Frota (veículos e equipamentos)

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/recursos` | Lista veículos e equipamentos |
| `POST` | `/recursos` | Cadastra um veículo ou equipamento |
| `GET` | `/recursos/{recursoId}` | Mostra um veículo ou equipamento |
| `PATCH` | `/recursos/{recursoId}` | Corrige dados dele |
| `GET` | `/recursos/{recursoId}/disponibilidade` | Mostra em que turnos ele está livre numa data |
| `GET` | `/disponibilidade` | Mostra quais veículos estão livres numa data |
| `GET` | `/recursos/{recursoId}/manutencoes` | Lista as manutenções dele |
| `POST` | `/recursos/{recursoId}/manutencoes` | Registra um período de manutenção |
| `GET` | `/reservas` | Lista os veículos já reservados |
| `GET` | `/reservas/{reservaId}` | Mostra uma reserva |

### Notificações

| Método | Caminho | Para que serve |
|---|---|---|
| `GET` | `/notificacoes` | Mostra os avisos de um usuário |
| `POST` | `/notificacoes/{notificacaoId}/leitura` | Marca um aviso como lido |
| `GET` | `/inscricoes` | Lista as regiões de que o usuário quer receber alerta |
| `POST` | `/inscricoes` | Inscreve o usuário para receber alertas de uma região |
| `DELETE` | `/inscricoes/{inscricaoId}` | Cancela uma inscrição |

### Análise (inteligência artificial)

| Método | Caminho | Para que serve |
|---|---|---|
| `POST` | `/analises` | Gera um resumo explicado da situação de uma região |
| `POST` | `/consultas` | Responde perguntas sobre prevenção usando os documentos guardados |
| `GET` | `/documentos` | Lista os documentos que a IA consulta |
| `POST` | `/documentos` | Adiciona um documento para a IA consultar |

---

## Recursos

- **Substantivos no plural**, em português e sem acento: `/regioes`, `/ocorrencias`, `/acoes`.
- **Sub-recursos para relações de pertencimento:** `/regioes/{regiaoId}/vulnerabilidade`, `/equipes/{equipeId}/disponibilidade`.
- **Transições de estado como sub-recursos nomeados por substantivo.** Em vez de `PATCH /acoes/{id}` com `{"estado": "CONCLUIDA"}`, o cliente cria a transição: `POST /acoes/{id}/conclusao`. Isso mantém a regra de transição no servidor, permite corpo próprio para cada transição (a conclusão exige resultado, o cancelamento exige motivo) e torna cada transição um link HATEOAS natural.

---

## Verbos

| Verbo | Em palavras simples | Uso | Idempotente |
|---|---|---|---|
| `GET` | Consultar | Leitura de recurso ou coleção | Sim |
| `POST` | Criar ou executar | Criação de recurso ou de transição de estado | Não, exceto com `Idempotency-Key` |
| `PUT` | Substituir por inteiro | Substituição integral de um sub-recurso de valor único, como `/regioes/{id}/vulnerabilidade` | Sim |
| `PATCH` | Corrigir parte | Alteração parcial de atributos cadastrais | Não garantido |
| `DELETE` | Apagar | Remoção, usada apenas em inscrições de notificação | Sim |

**Idempotente** significa que repetir o mesmo pedido várias vezes dá o mesmo resultado que fazer uma vez só.

---

## Códigos de status

| Código | Em palavras simples | Quando |
|---|---|---|
| `200 OK` | Deu certo | Leitura bem-sucedida; transição de estado síncrona concluída |
| `201 Created` | Criado | Recurso criado de forma síncrona. Sempre com cabeçalho `Location` |
| `202 Accepted` | Recebido, ainda processando | Pedido aceito para processamento assíncrono. Usado na abertura de ação preventiva, cujo resultado depende da SAGA, e em importações. Sempre com `Location` para acompanhamento |
| `204 No Content` | Apagado | Remoção bem-sucedida |
| `400 Bad Request` | Pedido mal escrito | Requisição malformada: JSON inválido, tipo errado, parâmetro obrigatório ausente |
| `401 Unauthorized` | Não fez login | Token ausente ou inválido. Emitido pelo gateway |
| `403 Forbidden` | Sem permissão | Token válido, perfil sem permissão. Emitido pelo BFF |
| `404 Not Found` | Não existe | Recurso inexistente |
| `409 Conflict` | Não pode agora, por causa do estado atual | Transição de estado inválida para o estado atual, ou violação de unicidade |
| `422 Unprocessable Entity` | Entendido, mas a regra não permite | Requisição bem formada, mas semanticamente inválida: data no passado, região inexistente |
| `429 Too Many Requests` | Pedidos demais, espere um pouco | Limite de requisições excedido. Emitido pelo gateway |
| `503 Service Unavailable` | Sistema fora do ar no momento | Dependência indisponível, como o provedor de LLM sem fallback |

A distinção entre `400` e `422` é deliberada. `400` indica que o servidor não conseguiu entender a requisição; `422` indica que entendeu, mas a regra de negócio impede.

### Formato de erro

Todos os erros emitidos pelos serviços e pelos BFFs seguem a RFC 7807, com `Content-Type: application/problem+json`. A exceção são os erros emitidos pelo próprio gateway, `401` e `429`, que chegam no formato nativo dos plugins do Kong (`{"message": "..."}`), porque a requisição é recusada antes de alcançar qualquer serviço. Os contratos dos BFFs documentam esse formato.

Exemplo de erro emitido por um serviço:

```json
{
  "type": "https://pluvia.dev/problemas/transicao-invalida",
  "title": "Transição de estado inválida",
  "status": 409,
  "detail": "A ação está no estado PENDENTE e não pode ser concluída.",
  "instance": "/v1/acoes/7c1e.../conclusao"
}
```

---

## Paginação e filtros

Coleções aceitam `pagina` (a partir de 1) e `tamanho` (padrão 20, máximo 100), e retornam:

```json
{ "itens": [ ... ], "pagina": 1, "tamanho": 20, "total": 57 }
```

Filtros são parâmetros de consulta com o nome do campo: `/ocorrencias?regiaoId=...&situacao=VALIDADA`.

---

## Idempotência na criação de ação

`POST /v1/acoes` aceita o cabeçalho `Idempotency-Key`. Se o cliente reenviar a mesma requisição com a mesma chave, por exemplo após perder a resposta numa rede móvel instável, o serviço devolve a mesma ação em vez de iniciar uma segunda SAGA. Sem isso, um reenvio poderia reservar duas equipes para a mesma tarefa.

---

## Versionamento

**Estratégia: versão no caminho da URI**, como em `/v1/acoes`.

**Justificativa:**

- **Visível no roteamento.** O gateway roteia por prefixo de caminho, e a versão fica explícita nas regras de rota sem inspecionar cabeçalhos.
- **Explícita em logs, documentação e demonstração.** Qualquer requisição registrada mostra a versão usada.
- **Simples para os clientes.** O app mobile não precisa montar cabeçalhos customizados, e respostas podem ser armazenadas em cache por URL.

**Alternativas consideradas:**

| Alternativa | Por que não |
|---|---|
| Cabeçalho customizado (`Api-Version: 1`) | Invisível em logs e no navegador, exige que o gateway inspecione cabeçalho para rotear e complica cache |
| Negociação por `Accept` (`application/vnd.pluvia.v1+json`) | Mais aderente ao REST puro, mas pouco prático para clientes e ferramentas, e desproporcional ao tamanho do projeto |

**Política:**

- Mudanças **compatíveis** (novo campo opcional, novo endpoint) entram na versão corrente, sem alterar `v1`.
- Mudanças **incompatíveis** (remoção ou renomeação de campo, mudança de semântica) geram `/v2`, que convive com `/v1`.
- Versão obsoleta passa a responder com os cabeçalhos `Deprecation` e `Sunset`, indicando a data de desativação, e só é removida depois que os BFFs migrarem.

Os BFFs usam o mesmo esquema: `/web/v1/...` e `/mobile/v1/...`. Como cada BFF é consumido por um único cliente, é ele quem absorve a evolução dos serviços internos, e a versão externa só muda quando o contrato com o cliente muda.

---

## HATEOAS

**Recurso escolhido: ação preventiva** (`/v1/acoes/{id}`), no formato **HAL** (`application/hal+json`).

A ação preventiva é o recurso ideal para demonstrar HATEOAS porque **os links disponíveis mudam conforme o estado**. O cliente não precisa conhecer a máquina de estados: basta verificar quais links vieram na resposta para saber o que pode ser feito. Se amanhã uma regra nova impedir o cancelamento em determinada situação, o servidor simplesmente deixa de enviar o link, e o cliente se adapta sem nova versão.

### Links por estado

| Estado | Links oferecidos |
|---|---|
| `PENDENTE` | `self`, `regiao`, `saga` |
| `CONFIRMADA` | `self`, `regiao`, `saga`, `iniciar`, `cancelar` |
| `EM_EXECUCAO` | `self`, `regiao`, `concluir` |
| `CONCLUIDA` | `self`, `regiao` |
| `REJEITADA` | `self`, `regiao`, `saga` |
| `CANCELADA` | `self`, `regiao` |

Em `PENDENTE` não há link de cancelamento. A ação está no meio da SAGA, e permitir cancelamento nesse momento abriria uma corrida entre a reserva em andamento e a liberação. Esse bloqueio temporário é a contramedida de **bloqueio semântico** descrita em [06-saga.md](06-saga.md).

### Exemplo: ação pendente

```json
{
  "id": "7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11",
  "regiaoId": "2b9d8f40-51c3-4e0a-8a7b-9c0d1e2f3a45",
  "tipo": "LIMPEZA_DRENAGEM",
  "data": "2026-10-20",
  "turno": "MANHA",
  "estado": "PENDENTE",
  "_links": {
    "self":   { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11" },
    "regiao": { "href": "/v1/regioes/2b9d8f40-51c3-4e0a-8a7b-9c0d1e2f3a45" },
    "saga":   { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11/saga" }
  }
}
```

### Exemplo: ação confirmada

```json
{
  "id": "7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11",
  "estado": "CONFIRMADA",
  "equipeId": "a41f0c6d-2e8b-4f3a-b5c7-d8e9f0a1b2c3",
  "recursoId": "f0e1d2c3-b4a5-4968-8776-655443322110",
  "_links": {
    "self":     { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11" },
    "regiao":   { "href": "/v1/regioes/2b9d8f40-51c3-4e0a-8a7b-9c0d1e2f3a45" },
    "saga":     { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11/saga" },
    "iniciar":  { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11/inicio", "method": "POST" },
    "cancelar": { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11/cancelamento", "method": "POST" }
  }
}
```

### Exemplo: ação concluída

```json
{
  "id": "7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11",
  "estado": "CONCLUIDA",
  "resultado": "Canal desobstruído em 40 m; retirado material acumulado junto à ponte.",
  "_links": {
    "self":   { "href": "/v1/acoes/7c1e2a9e-3b0f-4a52-9d61-0f5a8b2e6c11" },
    "regiao": { "href": "/v1/regioes/2b9d8f40-51c3-4e0a-8a7b-9c0d1e2f3a45" }
  }
}
```

O campo `method` não faz parte da especificação HAL original; é uma extensão comum, adotada aqui para que o cliente saiba o verbo de cada transição sem conhecimento prévio.

Os links `regiao` apontam para o recurso no serviço de Território. Como o cliente acessa tudo pelo BFF, o BFF reescreve os `href` para o seu próprio espaço de URLs antes de repassar a resposta.
