# T4 · Sinalizações

Dono: Mark. Rota do painel: `/sinalizacoes`. Não depende de back novo.

Padrões de código, componentes e regras: [clients/web/README.md](../../../clients/web/README.md). O que é fixo e o que fica a critério de quem implementa: [README desta pasta](README.md). O painel antigo tem esta tela em `clients/web/legado/app.js`, para consulta.

## Para que serve

Listar os avisos que o sistema emitiu e deixar o Técnico registrar que viu cada um. É onde a sinalização criada pela simulação de chuva aparece.

## Quem usa

Gestor e Técnico veem a lista. Só o Técnico reconhece. Só o Gestor vê "Abrir ação".

## Chamadas

| Chamada | Quando | Usa |
|---|---|---|
| `GET /web/v1/sinalizacoes?estado=&origem=&regiaoId=&pagina=&tamanho=` | ao abrir e ao mudar um filtro | `itens`, `total`, `pagina`, `tamanho` |
| `GET /web/v1/painel?municipio=Lavras` | ao abrir | `regioes`, só para trocar `regiaoId` pelo nome |
| `POST /web/v1/sinalizacoes/:id/reconhecimento` | botão "Reconhecer" | sem corpo |

Cada item traz `id`, `regiaoId`, `origem` (`OBSERVADO` ou `PREVISTO`), `nivelAtencao`, `motivo`, `fatores`, `estado` (`ABERTA`, `RECONHECIDA`, `ENCERRADA`), `emitidaEm`, `reconhecidaPor` e `reconhecidaEm`.

## O que mostra

1. **Filtros:** estado (padrão "Abertas"), região e origem ("Observada" ou "Prevista"). A região vem preenchida quando a tela é aberta com `?regiaoId=`.
2. **Lista**, da mais recente para a mais antiga. Cada linha: `ChipNivel`, nome da região, `motivo`, "Observada" ou "Prevista", quando foi emitida e `ChipEstado`.
3. **Detalhe ao expandir a linha:** os `fatores` com `descricao` e `fonte`; se reconhecida, quando foi.
4. **Ações da linha:**
   - "Reconhecer" (Técnico, só em sinalização aberta). Depois do sucesso, a linha passa para "Reconhecida" sem recarregar a página.
   - "Abrir ação" (Gestor), que leva para `/acoes?regiaoId=<id>&sinalizacaoId=<id>`.
5. **Paginação** com 20 por página e o total.

Falha ao reconhecer aparece num `Alert` na própria tela com `mensagemErro(erro)`; o `409` significa que outra pessoa já reconheceu, e a lista deve ser recarregada.

## Modo bastidores

- Uma linha explicando o CQRS: o reconhecimento grava no modelo de escrita, e o panorama da região (modelo de leitura) é atualizado em seguida por evento.
- Por linha: o `id` da sinalização e `reconhecidaPor`.

## O que muda no back

Nada. O BFF já repassa os filtros ao Risco.

## Pronta quando

- Os três filtros funcionam e a paginação mostra o total certo.
- O Técnico reconhece e a linha muda; o Gestor não vê o botão.
- Uma sinalização criada pela simulação de chuva aparece na lista ao recarregar.
- Nenhum UUID ou nome de enum aparece com o modo bastidores desligado.
