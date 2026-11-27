# Contrato da simulação de chuva

Combina o que cada um implementa para o botão "Simular chuva" da Visão geral fazer uma sinalização nascer sozinha. Segue o desenho de [08-eventos.md](../arquitetura/08-eventos.md) e [07-cqrs.md](../arquitetura/07-cqrs.md); nada aqui é arquitetura nova.

| Parte | Dono | Onde |
|---|---|---|
| B1: recebe a chuva simulada e publica o acumulado | Alexandre | `services/monitoramento` |
| B2: avalia o acumulado e emite a sinalização | Mark | `services/risco` |
| B3: rota do painel para disparar a simulação | Lucas | `services/bff-web` |
| Botão na Visão geral | Alexandre | `clients/web` |

## Fluxo

```
Painel ──POST /web/v1/simulacoes/chuva──▶ BFF Web ──POST /v1/simulacoes/chuva──▶ Monitoramento
                                                                                     │ grava a leitura, soma as últimas 72 h
                                                                                     ▼
                                              pluvia.eventos: monitoramento.acumulado.atualizado
                                                                                     │
                                                                                     ▼
                                          Risco (fila risco.avaliador): aplica a regra de nível
                                                                                     │ se o nível subiu
                                                                                     ▼
                                                 pluvia.eventos: risco.sinalizacao.emitida
                                                                                     │
                                                                                     ▼
                                    Risco (fila risco.projetor): atualiza o panorama da região
```

O painel não espera o fim do fluxo: recebe a resposta do Monitoramento e busca `GET /web/v1/painel` de novo até o nível da região mudar.

## 1. Painel → BFF Web (B3)

`POST /web/v1/simulacoes/chuva`, perfis `GESTOR` e `TECNICO`.

```json
{ "regiaoId": "6f1c2a10-0000-4000-8000-000000000003", "valorMm": 40 }
```

| Campo | Regra |
|---|---|
| `regiaoId` | UUID, obrigatório |
| `valorMm` | número maior que 0 e até 300, obrigatório |

O BFF repassa o corpo ao Monitoramento e devolve a resposta dele sem alterar. Erros em `application/problem+json`, como nas outras rotas: `400` para corpo inválido, `502` ou `504` se o Monitoramento não responder.

O BFF precisa passar a conhecer o Monitoramento (`MONITORAMENTO_URL`, novo valor em `ServicoInterno`). O Kong já encaminha `/web/v1` por prefixo, então não muda.

## 2. BFF Web → Monitoramento (B1)

`POST /v1/simulacoes/chuva`, mesmo corpo e mesmas validações.

O Monitoramento grava uma leitura de chuva com origem simulada e o horário atual, soma as leituras da região nas últimas 72 horas e publica o evento pela outbox, na mesma transação da leitura.

Resposta `201`:

```json
{
  "regiaoId": "6f1c2a10-0000-4000-8000-000000000003",
  "janela": "H72",
  "valorMm": 70,
  "calculadoEm": "2026-11-28T14:05:12Z"
}
```

`valorMm` da resposta é o acumulado da janela, não o valor enviado. O Monitoramento não confere se a região existe: ele não tem cópia do Território.

## 3. Monitoramento → Risco (B1 publica, B2 consome)

Exchange `pluvia.eventos`, chave `monitoramento.acumulado.atualizado`, envelope padrão:

```json
{
  "id": "5f0c8a1e-7b2d-4c3e-9f10-2a3b4c5d6e7f",
  "tipo": "AcumuladoAtualizado",
  "versao": 1,
  "origem": "monitoramento",
  "ocorridoEm": "2026-11-28T14:05:12Z",
  "correlationId": "<X-Request-ID da chamada>",
  "causationId": null,
  "dados": {
    "regiaoId": "6f1c2a10-0000-4000-8000-000000000003",
    "janela": "H72",
    "valorMm": 70,
    "calculadoEm": "2026-11-28T14:05:12Z"
  }
}
```

Nesta versão só existe a janela `H72`. O campo fica no evento para outras janelas entrarem sem mudar o formato.

O Risco consome pela fila `risco.avaliador`, que já está declarada em `infra/rabbitmq/definitions.json`. O consumidor ignora um `id` de envelope que já processou e ignora região sem panorama, registrando no log.

## 4. Regra de nível no Risco (B2)

Limiares fixos, iguais para todas as regiões, sobre o acumulado de 72 horas:

| Acumulado em 72 h | Nível |
|---|---|
| menos de 30 mm | `NORMAL` |
| 30 mm ou mais | `OBSERVACAO` |
| 60 mm ou mais | `ATENCAO` |
| 90 mm ou mais | `ALTA_ATENCAO` |

Quando o nível calculado é **mais grave** que o nível atual da região, o Risco grava uma sinalização e publica `SinalizacaoEmitida`. Quando é igual ou mais brando, não faz nada: a simulação só sobe o nível.

Sinalização gravada:

| Campo | Valor |
|---|---|
| `origem` | `OBSERVADO` |
| `nivelAtencao` | o nível calculado |
| `motivo` | `Acumulado de 70 mm em 72 horas` |
| `fatores` | `[{ "tipo": "ACUMULADO_CHUVA", "descricao": "70 mm nas últimas 72 horas", "fonte": "monitoramento" }]` |
| `estado` | `ABERTA` |

Evento `risco.sinalizacao.emitida`, com os dados já previstos no catálogo: `sinalizacaoId`, `regiaoId`, `nivelAtencao`, `origem`, `motivo`.

O projetor hoje só trata `SinalizacaoReconhecida`. Faz parte do B2 projetar `SinalizacaoEmitida`: incluir a sinalização no panorama da região e atualizar o `nivelAtencao` dela.

## 5. Botão no painel

Fica na Visão geral, dentro do modo bastidores. Escolhe a região e a quantidade de chuva, chama a rota do BFF e, com a resposta, recarrega o painel a cada 2 segundos até o nível da região mudar ou passarem 30 segundos (o limite de defasagem do modelo de leitura em [07-cqrs.md](../arquitetura/07-cqrs.md)).

Até o B3 existir, a tela usa uma resposta falsa no formato da seção 2.

## Em aberto

- **Os limiares de 30, 60 e 90 mm são uma proposta para a demo**, não saíram de dado histórico. O desenho em 07-cqrs.md prevê parâmetros por região com percentis; sem série histórica, isso não cabe no prazo.
- **Voltar ao normal para regravar.** Como a simulação só sobe o nível, repetir a demo exige recarregar os dados (derrubar os volumes do Risco e do Monitoramento e subir de novo). Uma rota para zerar a simulação não está no escopo.
- **Região inexistente.** Um `regiaoId` que não existe é aceito pelo Monitoramento e descartado pelo Risco; o painel só oferece regiões reais, então não validamos antes.
