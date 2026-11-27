# Painel web

Painel da equipe técnica e da gestão. React 18, Vite, TypeScript e MUI 7. Fala só com o Kong (`http://localhost:8000`), que encaminha ao BFF Web.

## Rodar

Com o sistema no ar pelo Compose, o painel já está em [http://localhost:5173](http://localhost:5173). Para desenvolver com recarga automática, pare o container do painel e suba o Vite na mesma porta, porque o Keycloak e o Kong só aceitam essa origem:

```bash
docker compose stop pluvia-web
cd clients/web
npm install
npm run dev
```

Requer Node 24 (`.nvmrc`). Antes de abrir o PR: `npm test` e `npm run build`.

## Onde fica cada coisa

```
src/
  main.tsx          provedores: sessão, tema, bastidores, rotas
  App.tsx           entrada, conta sem acesso e as rotas dentro da casca
  rotas.tsx         lista única de onde saem o menu e as rotas
  auth.ts           login no Keycloak (PKCE) e useSessao()
  api.ts            axios com o token e a renovação no 401
  erros.ts          mensagemErro: a frase de um erro de chamada
  perfis.ts         perfis do token e filtro de rotas
  rotulos.ts        rótulos em português de níveis e estados
  tempo.ts          haQuantoTempo: "há 5 min", "há 2 h"
  tema.ts           cores e tema do MUI
  useConsulta.ts    busca os dados de uma tela
  bastidores.tsx    modo bastidores
  componentes/      Layout e Pagina, EstadoTela, ChipNivel, ChipEstado
  telas/<tela>/     index.tsx e api.ts da tela
legado/             painel antigo em JavaScript puro, só para consulta ao portar as telas
```

## Criar uma tela

A Visão geral (`src/telas/visao_geral`) é o modelo.

1. Crie `src/telas/<tela>/api.ts` com os tipos da resposta e uma função por chamada:

    ```ts
    export const obterPainel = () =>
        api.get<Painel>('/web/v1/painel', { params: { municipio: 'Lavras' } }).then((r) => r.data);
    ```

2. Crie `src/telas/<tela>/index.tsx`:

    ```tsx
    export default function MinhaTela() {
        const { dados, carregando, erro, recarregar } = useConsulta(obterAlgo, []);
        return (
            <Pagina titulo="Minha tela">
                <EstadoTela carregando={carregando && !dados} erro={erro} aoTentarDeNovo={recarregar}>
                    {dados && <Conteudo dados={dados} />}
                </EstadoTela>
            </Pagina>
        );
    }
    ```

3. Em `src/rotas.tsx`, troque `emConstrucao('...')` da sua linha pelo componente. Mexa só na sua linha.

Se a tela crescer, quebre em mais arquivos dentro da pasta dela. O que for usado por mais de uma tela vai para `componentes/`.

## Regras

- **Linguagem de produto.** UUID, caminho de API, nome de enum, origem da resposta (`CACHE`, `FALLBACK`), latência e nome de mensagem só aparecem dentro de `<Bastidores>`.
- **Nenhuma tela espera a IA.** Os dados aparecem primeiro; a síntese vem numa consulta separada, com o próprio `EstadoTela`.
- **Cores só do tema.** Use `cores` de `tema.ts`, `ChipNivel` e `ChipEstado`; nada de hex na tela.
- **Rótulos.** Nível e estado passam por `rotuloNivel` e `rotuloEstado`.
- **Erros.** Falha ao carregar aparece no `EstadoTela`. Falha numa ação do usuário (salvar, reconhecer) aparece num `Alert` na própria tela, com `mensagemErro(erro)`.
- **Perfis.** `useSessao().temPerfil('GESTOR')` decide o que o usuário pode fazer. O BFF confere de novo.
- **Testes.** Função pura ganha `*.test.ts` ao lado, escrito antes. Tela se confere no navegador.
- **Texto e nomes em português.** Prettier com 4 espaços e aspas simples (`.prettierrc.json`).
