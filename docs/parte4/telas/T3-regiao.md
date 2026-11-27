# T3 · Região

Dono: Mark. Rota do painel: `/regioes/:regiaoId`. Depende do B4.

Padrões de código, componentes e regras: [clients/web/README.md](../../../clients/web/README.md). O que é fixo e o que fica a critério de quem implementa: [README desta pasta](README.md). A Visão geral (`src/telas/visao_geral`) é o modelo.

## Para que serve

Responder "o que está acontecendo nesta região e o que já está sendo feito". O usuário chega aqui pelo botão "Abrir" da Visão geral.

## Quem usa

Gestor e Técnico veem a mesma coisa. Só o Gestor vê o botão "Abrir ação".

## Chamadas

| Chamada | Quando | Usa |
|---|---|---|
| `GET /web/v1/regioes/:regiaoId` | ao abrir | `regiao`, `panorama`, `acoes`, `avisos` |
| `GET /web/v1/regioes/:regiaoId/analise` (nova, B4) | ao abrir, em paralelo | `sintese`, `fontes`, `origem`, `modelo`, `latenciaMs`, `geradaEm` |

São duas consultas com `useConsulta`, cada uma com o próprio `EstadoTela`. A tela aparece assim que a primeira responde; a explicação da IA entra quando a segunda chegar.

## O que mostra

1. **Cabeçalho:** nome da região, "Lavras, MG" e o `ChipNivel` com `panorama.nivelAtencao`. À direita, "Abrir ação" (Gestor), que leva para `/acoes?regiaoId=<id>`.
2. **Por que este nível:** a lista de `panorama.fatores`, cada um com `descricao` e `fonte`.
3. **Explicação da IA:** `sintese` em texto corrido e, abaixo, "Com base em:" com o `nome` de cada item de `fontes`. Enquanto carrega, um bloco com "Preparando a explicação…". Se falhar, o bloco mostra o erro e "Tentar de novo", sem afetar o resto da tela.
4. **Sinalizações da região:** `panorama.sinalizacoes` com `ChipNivel` e `ChipEstado`. Link "Ver todas" para `/sinalizacoes?regiaoId=<id>`.
5. **Ações na região:** `acoes.itens` com tipo, data, turno e `ChipEstado`; clicar abre `/acoes/:acaoId`. Se `acoes` vier nulo, mostrar "Não foi possível carregar as ações agora".
6. **Sobre a região:** `regiao.caracteristicas`: área, declividade média, proximidade de curso d'água e tipo de ocupação.

Vulnerabilidade e ocorrências ficam fora: o Território não expõe esses dados, e os campos chegam nulos.

## Modo bastidores

- No bloco da IA: `origem` (LLM, CACHE ou FALLBACK), `modelo`, `latenciaMs` e `geradaEm`.
- No rodapé: `panorama.versao` e `panorama.atualizadoEm` (o modelo de leitura do CQRS) e o conteúdo de `avisos`.

## O que muda no back (B4)

- `GET /web/v1/regioes/:regiaoId` deixa de chamar a Análise e de devolver o bloco `analise`. Hoje a rota espera a síntese, que leva de 20 a 40 segundos sem cache.
- Rota nova `GET /web/v1/regioes/:regiaoId/analise`, perfis Gestor e Técnico, que chama `POST /v1/analises` com `{ regiaoId, tipo: "SITUACAO_ATUAL" }` e devolve a resposta da Análise.
- Validade do cache da síntese de 10 minutos para algumas horas (`CACHE_TTL_S` na Análise).
- Atualizar `docs/api/bff-web.yaml` e o teste de integração do BFF.

## Pronta quando

- A tela mostra cabeçalho, fatores, sinalizações e ações sem esperar a IA.
- A explicação aparece depois, e uma falha nela não derruba a tela.
- Com a Análise parada (`docker compose stop analise`), o resto continua funcionando.
- Nenhum UUID, nome de enum ou `FALLBACK` aparece com o modo bastidores desligado.
