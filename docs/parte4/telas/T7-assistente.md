# T7 · Assistente

Dono: Mark. Rota do painel: `/assistente`. Não depende de back novo.

Padrões de código, componentes e regras: [clients/web/README.md](../../../clients/web/README.md). O painel antigo tem esta tela em `clients/web/legado/app.js`, para consulta.

## Para que serve

Responder perguntas sobre protocolos e critérios usando a base de conhecimento, mostrando de onde a resposta saiu. É a tela que prova o RAG no vídeo, com a comparação com e sem a base.

## Quem usa

Gestor e Técnico.

## Chamadas

| Chamada | Quando | Corpo |
|---|---|---|
| `POST /web/v1/consultas` | "Perguntar" | `{ "pergunta": "...", "usarRecuperacao": true }` |
| `POST /web/v1/consultas` | "Comparar sem a base" | a mesma pergunta com `"usarRecuperacao": false` |

A pergunta tem de 5 a 1000 caracteres. A resposta traz `resposta`, `trechos`, `origem` (`LLM`, `CACHE` ou `FALLBACK`), `modelo`, `latenciaMs`, `buscaDegradada` e `etapasMs`. O formato de cada trecho está em `services/analise/app/rag.py`.

Sem GPU, uma pergunta nova leva de 17 a 34 segundos. A chamada não usa `useConsulta`, porque é disparada por um botão: a tela guarda o próprio estado de "respondendo".

## O que mostra

1. **Campo de pergunta** com o botão "Perguntar" e três perguntas de exemplo clicáveis, tiradas da base de conhecimento.
2. **Enquanto responde:** "Consultando a base de conhecimento…" com indicador de andamento, e o botão desabilitado.
3. **Resposta:** o texto de `resposta` e, abaixo, "Trechos consultados", com o título e o conteúdo de cada trecho, recolhidos por padrão.
4. **"Comparar sem a base":** aparece depois da resposta. Faz a segunda chamada e mostra as duas respostas lado a lado, "Com a base de conhecimento" e "Sem a base de conhecimento".
5. **Histórico da sessão:** as perguntas anteriores e suas respostas, da mais recente para a mais antiga. Fica só na memória da tela e some ao recarregar.

Quando `origem` é `FALLBACK`, a resposta ganha o aviso "O modelo de linguagem não respondeu; este texto foi montado direto dos trechos encontrados." O erro `503` aparece num `Alert` com `mensagemErro(erro)`.

## Modo bastidores

- Por resposta: `origem`, `modelo`, `latenciaMs` e o tempo de cada etapa em `etapasMs`.
- Aviso quando `buscaDegradada` for verdadeiro.

## O que muda no back

Nada. O BFF já repassa `usarRecuperacao` à Análise.

## Pronta quando

- Uma pergunta da base devolve resposta com os trechos consultados.
- A comparação mostra as duas respostas lado a lado.
- Com o Ollama parado, a tela mostra a resposta de contingência ou o erro, sem travar.
- `CACHE`, `FALLBACK`, nome do modelo e latência só aparecem com o modo bastidores ligado.
