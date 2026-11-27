# T5 · Ações e nova ação

Dono: Lucas. Rota do painel: `/acoes`. A grade de disponibilidade depende do B3.

Padrões de código, componentes e regras: [clients/web/README.md](../../../clients/web/README.md). O que é fixo e o que fica a critério de quem implementa: [README desta pasta](README.md).

## Para que serve

Listar as ações preventivas e deixar o Gestor abrir uma nova vendo, antes de enviar, quais equipes e veículos estão livres no dia. É a tela que dispara a SAGA, no caminho feliz e na compensação.

## Quem usa

Gestor e Técnico veem a lista. Só o Gestor abre ação.

## Chamadas

| Chamada | Quando | Usa |
|---|---|---|
| `GET /web/v1/acoes?estado=&regiaoId=&pagina=&tamanho=` | ao abrir e ao filtrar | `itens`, `total` |
| `GET /web/v1/painel?municipio=Lavras` | ao abrir | `regioes`, para o nome da região e para o campo do formulário |
| `GET /web/v1/planejamento/disponibilidade?data=&especialidade=&categoria=` (nova, B3) | ao escolher a data, a especialidade ou a categoria | `equipes`, `recursos` |
| `POST /web/v1/acoes` | "Abrir ação" | corpo abaixo |

Cada ação traz `id`, `regiaoId`, `sinalizacaoId`, `tipo`, `descricao`, `data`, `turno`, `especialidade`, `categoriaRecurso`, `estado`, `equipeId`, `recursoId`, `motivoRejeicao`, `motivoCancelamento`, `criadaEm`.

## O que mostra: lista

1. **Filtro por estado** em abas ou chips: Todas, Pendentes, Confirmadas, Rejeitadas, Canceladas.
2. **Linhas:** tipo, região, data e turno, `ChipEstado` e, se rejeitada, o `motivoRejeicao`. Clicar abre `/acoes/:acaoId`.
3. **Botão "Nova ação"** (Gestor), que abre o formulário.

## O que mostra: nova ação

Formulário à esquerda e disponibilidade do dia à direita.

| Campo | Valores | Observação |
|---|---|---|
| Região | regiões do painel | vem preenchida com `?regiaoId=` |
| Tipo | Vistoria, Limpeza de drenagem, Desobstrução, Inspeção de ponto crítico | `VISTORIA`, `LIMPEZA_DRENAGEM`, `DESOBSTRUCAO`, `INSPECAO_PONTO_CRITICO` |
| Data | de hoje em diante | `AAAA-MM-DD` |
| Turno | Manhã, Tarde, Noite | `MANHA`, `TARDE`, `NOITE` |
| Especialidade da equipe | Drenagem, Vistoria, Desobstrução, Geral | `DRENAGEM`, `VISTORIA`, `DESOBSTRUCAO`, `GERAL` |
| Tipo de veículo ou equipamento | Caminhão hidrojato, Retroescavadeira, Caminhonete, Bomba de sucção, Kit de vistoria | `CAMINHAO_HIDROJATO`, `RETROESCAVADEIRA`, `CAMINHONETE`, `BOMBA_SUCCAO`, `KIT_VISTORIA` |
| Descrição | texto livre, até 500 caracteres | opcional |

`sinalizacaoId` não é campo: vai no corpo quando a tela é aberta com `?sinalizacaoId=`.

**Disponibilidade do dia.** Duas grades, equipes e veículos, já filtradas pela especialidade e pela categoria escolhidas. Uma linha por equipe ou veículo, uma coluna por turno, cada célula "Livre", "Ocupado" (`motivo` `RESERVADA` ou `RESERVADO`) ou "Em manutenção" (`EM_MANUTENCAO`, só veículos). A coluna do turno escolhido fica destacada. Se nenhuma linha estiver livre naquele turno, um aviso: "Nenhuma equipe livre neste turno; a ação será recusada."

A tela não impede o envio quando não há recurso livre: é assim que a compensação é demonstrada.

**Envio.** `POST /web/v1/acoes` com os campos acima e o cabeçalho `Idempotency-Key` (um `crypto.randomUUID()` por envio). A resposta é `202` com a ação em estado pendente; a tela vai para `/acoes/<id>`, onde a T6 acompanha o resultado. Erro `400` ou `422` aparece num `Alert` com `mensagemErro(erro)`.

## Modo bastidores

- Na lista: `id` da ação, `equipeId` e `recursoId`.
- No formulário: "O envio responde 202: a ação nasce pendente e o resultado vem da SAGA."

## O que muda no back (B3)

- Rota nova `GET /web/v1/planejamento/disponibilidade`, perfis Gestor e Técnico, já prevista em `docs/api/bff-web.yaml`. Chama em paralelo `GET /v1/disponibilidade?data=&especialidade=` em Equipes e `GET /v1/disponibilidade?data=&categoria=` em Frota.
- Resposta: `{ data, equipes, recursos }`. Cada equipe: `equipeId`, `equipeNome`, `turnos`. Cada recurso: `recursoId`, `categoria`, `identificacao`, `turnos`. Cada turno: `turno`, `disponivel`, `motivo`.
- Se um dos dois serviços falhar, o bloco dele vem nulo e a falha entra em `avisos`, como nas outras rotas compostas.
- O BFF Web passa a conhecer Equipes e Frota (`EQUIPES_URL`, `FROTA_URL`, novos valores em `ServicoInterno`). O Kong não muda.

Até a rota existir, a tela usa dados falsos nesse formato.

## Pronta quando

- A lista filtra por estado e abre o detalhe.
- O Gestor abre uma ação com recurso livre e ela termina confirmada.
- O Gestor abre uma ação num turno sem recurso livre, vê o aviso e ela termina rejeitada.
- O Técnico não vê "Nova ação".
- Nenhum UUID ou nome de enum aparece com o modo bastidores desligado.
