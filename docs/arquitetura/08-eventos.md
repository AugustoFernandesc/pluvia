# Catálogo de eventos, comandos e contrato de sensores

## Envelope padrão

Toda mensagem trocada entre serviços segue o mesmo envelope:

```json
{
  "id": "5f0c8a1e-7b2d-4c3e-9f10-2a3b4c5d6e7f",
  "tipo": "AcaoPreventivaConfirmada",
  "versao": 1,
  "origem": "operacoes",
  "ocorridoEm": "2026-10-19T14:05:12Z",
  "correlationId": "c9d8e7f6-a5b4-4c3d-8e2f-1a0b9c8d7e6f",
  "causationId": "1b2c3d4e-5f60-4718-9a0b-c1d2e3f4a5b6",
  "dados": { }
}
```

| Campo | Uso |
|---|---|
| `id` | Identificador único da mensagem. Chave de idempotência nos consumidores |
| `tipo` | Nome do evento ou comando |
| `versao` | Versão do formato de `dados`. Mudança incompatível gera nova versão |
| `origem` | Serviço que produziu a mensagem |
| `ocorridoEm` | Momento do fato, não da publicação. Usado para descartar mensagens fora de ordem |
| `correlationId` | Mesmo valor em todas as mensagens de um fluxo. Numa SAGA, é o `sagaId`. Nas requisições HTTP, é propagado a partir do `X-Request-ID` do gateway |
| `causationId` | `id` da mensagem que causou esta |

---

## Topologia no RabbitMQ

| Exchange | Tipo | Uso |
|---|---|---|
| `pluvia.eventos` | `topic` | Fatos ocorridos. Qualquer serviço pode assinar |
| `pluvia.comandos` | `direct` | Comandos e respostas da SAGA. Destinatário único |
| `pluvia.dlx` | `topic` | Mensagens que esgotaram as tentativas |
| `amq.topic` | `topic` | Entrada das leituras MQTT dos sensores |

**Chave de roteamento dos eventos:** `<servico>.<agregado>.<fato>`, por exemplo `operacoes.acao.confirmada`. Um consumidor pode assinar `operacoes.acao.*` para receber todos os eventos de ação.

**Filas:** uma fila por serviço consumidor e por finalidade, nomeada `<servico>.<finalidade>`, por exemplo `risco.projetor`, `risco.avaliador`, `equipes.comandos`, `operacoes.respostas`.

### Tentativas e fila de mensagens mortas

Falha no processamento gera nova tentativa com espera crescente: 1 s, 5 s, 30 s. Após a terceira falha, a mensagem vai para `pluvia.dlx`, onde fica disponível para inspeção e reprocessamento manual. Mensagem inválida, que nunca poderá ser processada, vai direto para a DLX, sem tentativas.

---

## Eventos

| Evento | Chave de roteamento | Produtor | Consumidores | Dados principais |
|---|---|---|---|---|
| `RegiaoCadastrada` | `territorio.regiao.cadastrada` | Território | Monitoramento, Risco, Operações, Notificações | `regiaoId`, `nome`, `municipio`, `uf`, `caracteristicas` |
| `RegiaoAtualizada` | `territorio.regiao.atualizada` | Território | Monitoramento, Risco, Operações, Notificações | `regiaoId`, campos alterados |
| `VulnerabilidadeAtualizada` | `territorio.vulnerabilidade.atualizada` | Território | Risco | `regiaoId`, `populacao`, `indice`, `possuiAglomeradoSubnormal`, `referencia` |
| `OcorrenciaReportada` | `territorio.ocorrencia.reportada` | Território | Notificações | `ocorrenciaId`, `regiaoId`, `tipo`, `ocorridaEm` |
| `OcorrenciaValidada` | `territorio.ocorrencia.validada` | Território | Risco | `ocorrenciaId`, `regiaoId`, `tipo`, `ocorridaEm`, `origem` |
| `OcorrenciaDescartada` | `territorio.ocorrencia.descartada` | Território | Risco | `ocorrenciaId`, `regiaoId`, `situacaoAnterior` |
| `AcumuladoAtualizado` | `monitoramento.acumulado.atualizado` | Monitoramento | Risco | `regiaoId`, `janela`, `valorMm`, `calculadoEm` |
| `PrevisaoPublicada` | `monitoramento.previsao.publicada` | Monitoramento | Risco | `previsaoId`, `regioes`, `acumuladoPrevistoMm`, `periodoInicio`, `periodoFim`, `boletimEmitidoEm` |
| `NivelAtualizado` | `monitoramento.nivel.atualizado` | Monitoramento | Risco | `sensorId`, `regiaoId`, `valor`, `unidade`, `medidoEm` |
| `SensorInativo` | `monitoramento.sensor.inativo` | Monitoramento | Risco, Notificações | `sensorId`, `regiaoId`, `ultimaLeituraEm` |
| `SinalizacaoEmitida` | `risco.sinalizacao.emitida` | Risco | Notificações, Risco (projetor) | `sinalizacaoId`, `regiaoId`, `nivelAtencao`, `origem`, `motivo` |
| `SinalizacaoReconhecida` | `risco.sinalizacao.reconhecida` | Risco | Risco (projetor) | `sinalizacaoId`, `reconhecidaPor` |
| `SinalizacaoEncerrada` | `risco.sinalizacao.encerrada` | Risco | Risco (projetor) | `sinalizacaoId`, `motivo` |
| `AcaoPreventivaConfirmada` | `operacoes.acao.confirmada` | Operações | Equipes, Frota, Risco, Notificações | `acaoId`, `sagaId`, `regiaoId`, `equipeId`, `recursoId`, `data`, `turno` |
| `AcaoPreventivaRejeitada` | `operacoes.acao.rejeitada` | Operações | Notificações | `acaoId`, `regiaoId`, `solicitanteId`, `motivo` |
| `AcaoPreventivaIniciada` | `operacoes.acao.iniciada` | Operações | Risco | `acaoId`, `regiaoId`, `iniciadaEm` |
| `AcaoPreventivaConcluida` | `operacoes.acao.concluida` | Operações | Equipes, Frota, Risco | `acaoId`, `sagaId`, `regiaoId`, `resultado`, `concluidaEm` |
| `AcaoPreventivaCancelada` | `operacoes.acao.cancelada` | Operações | Equipes, Frota, Risco, Notificações | `acaoId`, `sagaId`, `regiaoId`, `motivo` |

## Comandos e respostas da SAGA

Exchange `pluvia.comandos`. Detalhes de fluxo em [06-saga.md](06-saga.md).

| Mensagem | Chave de roteamento | De | Para |
|---|---|---|---|
| `ReservarEquipe` | `equipes.comandos` | Operações | Equipes |
| `LiberarEquipe` | `equipes.comandos` | Operações | Equipes |
| `ReservarRecurso` | `frota.comandos` | Operações | Frota |
| `LiberarRecurso` | `frota.comandos` | Operações | Frota |
| `EquipeReservada`, `ReservaEquipeRecusada`, `EquipeLiberada` | `operacoes.respostas` | Equipes | Operações |
| `RecursoReservado`, `ReservaRecursoRecusada`, `RecursoLiberado` | `operacoes.respostas` | Frota | Operações |

---

## Contrato de dispositivo: sensores de nível

A ingestão de sensores segue um contrato fixo. Na versão acadêmica, as leituras vêm de um **simulador** que implementa exatamente este contrato. Um dispositivo físico que o respeite pode substituir o simulador **sem nenhuma alteração no sistema**.

**Protocolo:** MQTT 3.1.1, recebido pelo plugin MQTT do RabbitMQ.

**Tópico:** `pluvia/sensores/{sensorId}/leituras`

No RabbitMQ, o tópico MQTT é convertido em chave de roteamento no exchange `amq.topic`, com `/` substituído por `.`. Monitoramento consome a fila `monitoramento.sensores`, ligada a `pluvia.sensores.*.leituras`.

**QoS:** 1, entrega pelo menos uma vez.

**Autenticação:** usuário e senha por dispositivo, cadastrados no broker. Um sensor só tem permissão de publicar no próprio tópico.

**Mensagem:**

```json
{
  "sensorId": "LAV-CENTRO-01",
  "seq": 1532,
  "tipo": "nivel_agua",
  "valor": 42.5,
  "unidade": "cm",
  "medidoEm": "2026-10-03T14:05:00Z",
  "bateria": 87
}
```

| Campo | Obrigatório | Uso |
|---|---|---|
| `sensorId` | Sim | Deve coincidir com o tópico e com um sensor cadastrado em Monitoramento |
| `seq` | Sim | Número sequencial crescente por sensor. Leitura com `seq` já recebido é descartada como duplicata |
| `tipo` | Sim | `nivel_agua` na versão atual |
| `valor` | Sim | Leitura medida |
| `unidade` | Sim | `cm` |
| `medidoEm` | Sim | Momento da medição, no relógio do dispositivo. Usado para ordenar leituras que chegam fora de ordem |
| `bateria` | Não | Percentual, para detectar dispositivo prestes a parar |

**Detecção de sensor inativo:** se um sensor ativo não publica por mais de 15 minutos, Monitoramento o marca como `INATIVO` e publica `SensorInativo`. O Risco passa a declarar no panorama que o dado de nível daquela região está indisponível, em vez de usar a última leitura como se fosse atual.

### Simulador

Script configurável que publica leituras periódicas para um ou mais sensores e pode, sob comando, reproduzir falhas reais:

| Modo | Comportamento |
|---|---|
| Normal | Publica a cada 60 s com variação suave |
| Subida | Eleva o nível gradualmente, simulando chuva forte |
| Silêncio | Para de publicar, simulando falha de energia ou rede |
| Duplicata | Reenvia leituras já publicadas |
| Fora de ordem | Publica leituras com `medidoEm` anterior às já enviadas |
| Bateria baixa | Reduz `bateria` progressivamente |

Isso permite demonstrar, de forma controlada, o tratamento de falhas que seria difícil provocar com hardware real.

**Dispositivo físico de referência:** ESP32, que possui Wi-Fi integrado e suporte a bibliotecas MQTT. Um Arduino Uno não serve sem módulo de rede adicional.
