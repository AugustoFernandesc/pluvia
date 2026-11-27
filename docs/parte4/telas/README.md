# Especificações das telas do painel

| Tela | Dono | Especificação |
|---|---|---|
| T1 Casca e login | Alexandre | pronta, em `clients/web/src` |
| T2 Visão geral | Alexandre | pronta, em `clients/web/src/telas/visao_geral` |
| T3 Região | Mark | [T3-regiao.md](T3-regiao.md) |
| T4 Sinalizações | Mark | [T4-sinalizacoes.md](T4-sinalizacoes.md) |
| T5 Ações e nova ação | Lucas | [T5-acoes.md](T5-acoes.md) |
| T6 Detalhe da ação | Lucas | [T6-detalhe-da-acao.md](T6-detalhe-da-acao.md) |
| T7 Assistente | Mark | [T7-assistente.md](T7-assistente.md) |

Como rodar, como criar uma tela e as regras de código estão em [clients/web/README.md](../../../clients/web/README.md).

## O que é fixo e o que é livre

Cada especificação fixa **o que a tela faz**: as chamadas, as informações que aparecem, quem pode fazer o quê e o que fica no modo bastidores. Isso não muda sem combinar com o grupo, porque o roteiro do vídeo depende disso.

**Como a tela se organiza é de quem faz.** A ordem dos blocos, se uma lista é tabela ou cartões, onde fica um filtro, os textos de apoio: a especificação descreve um arranjo possível, não o único. Quem implementa pode melhorar.

A liberdade tem um limite: a tela tem que parecer parte do mesmo sistema.

- **Coerência com o resto do painel.** A Visão geral é a referência: mesmos cartões brancos com borda fina, mesmos espaçamentos, mesmo jeito de mostrar título, números e estados. Abra as duas lado a lado antes de pedir revisão.
- **Coerência dentro da própria tela.** Um só jeito de mostrar cada coisa: se um estado é chip num lugar, é chip em todos.
- **MUI para os componentes.** Botão, campo, tabela, aba, alerta, diálogo e ícone vêm do MUI (`@mui/material` e `@mui/icons-material`), que já está no projeto. Não escrever componente próprio para o que o MUI já tem.
- **Cores, fontes e rótulos do projeto.** `cores` e `FONTE_NUMEROS` de `tema.ts`, `ChipNivel`, `ChipEstado`, `rotuloNivel` e `rotuloEstado`. Nada de cor em hexadecimal na tela.
- **Biblioteca visual nova só com motivo.** Pode usar, mas não é recomendado: cada uma pesa no carregamento do painel e é mais uma coisa para manter. A Visão geral usa o Leaflet porque o mapa é o centro da tela e não dá para fazer sem. Para gráfico simples, linha do tempo ou grade, o MUI e CSS resolvem. Se achar que precisa de uma, avise no grupo antes de instalar.

Se uma ideia boa mudar o que a tela faz, e não só como ela aparece, atualize a especificação no mesmo PR.
