# Parte 4 — roteiro de demonstração

Este roteiro executa os clientes pelos endereços publicados no host. O caminho das APIs é sempre **cliente → Kong → BFF → microsserviço**. O navegador não usa os nomes DNS internos da rede Compose.

## Preparação

### Arquivos de ambiente

Na raiz do repositório, no Git Bash:

```bash
for f in services/*/.env.example infra/*/.env.example; do cp -n "$f" "${f%.example}"; done
```

Gere senhas locais únicas e substitua todos os valores de exemplo antes de iniciar. Nos arquivos `services/risco/.env`, `services/operacoes/.env`, `services/equipes/.env` e `services/frota/.env`, `RABBITMQ_USER`/`RABBITMQ_PASSWORD` precisam corresponder a `RABBITMQ_SERVICOS_USER`/`RABBITMQ_SERVICOS_PASSWORD` em `infra/rabbitmq/.env`. Os destinos dos BFFs já usam os nomes de serviço do Compose em `TERRITORIO_URL`, `OPERACOES_URL`, `RISCO_URL` e `ANALISE_URL`; os timeouts são configuráveis nos mesmos `.env`.

O `infra/keycloak/.env` define as credenciais do administrador inicial. Guarde-as localmente e não as adicione ao Git. O arquivo `services/bff-web/.env` anuncia o issuer externo `http://localhost:8000/auth/realms/pluvia` e consulta o JWKS pela rede interna `http://keycloak:8080/...`.

### Subida e verificação

```bash
docker compose up -d --build
docker compose ps --all
```

Espere os bancos e serviços necessários aparecerem como `healthy`:

```bash
docker compose ps territorio-db territorio risco-escrita-db risco-leitura-db risco operacoes-db operacoes keycloak-db keycloak kong bff-web bff-mobile pluvia-web pluvia-mobile
docker compose exec territorio wget -qO- http://127.0.0.1:3000/health
docker compose exec risco wget -qO- http://127.0.0.1:3000/health
docker compose exec bff-web wget -qO- http://127.0.0.1:3000/health
docker compose exec bff-mobile wget -qO- http://127.0.0.1:3000/health
```

As URLs dos clientes são [Painel Web](http://localhost:5173) e [Mobile público](http://localhost:5174). Keycloak e Kong são publicados em `http://localhost:8000/auth` e `http://localhost:8000`.

Confira o estado OIDC pelo gateway:

```bash
curl --fail http://localhost:8000/auth/realms/pluvia/.well-known/openid-configuration
```

No console administrativo do Keycloak, abra o realm `pluvia`, crie usuários locais e atribua papéis de realm. Use `GESTOR` para a ação preventiva e SAGA, `TECNICO` para a visão técnica e reconhecimento de sinalizações, e `AGENTE` para fluxos privados de campo do cliente Mobile. O usuário público do Mobile não precisa de conta. O login do painel Web é Authorization Code com PKCE `S256`, sem client secret no navegador.

## Demonstração

1. Abra o [Painel Web](http://localhost:5173) e entre com um usuário `GESTOR`.
2. Consulte o painel de Lavras e selecione **Centro**. O identificador inicial confirmado no seed de Território é `6f1c2a10-0000-4000-8000-000000000001`.
3. Mostre o caminho em **Network** do navegador: `GET /web/v1/painel` e `GET /web/v1/regioes/{id}` passam pelo Kong; o BFF Web consulta Território, Risco e Análise. O painel exibe os indicadores e fontes reais recebidos, com avisos para blocos indisponíveis.
4. Use **Pedir ação preventiva**. O formulário começa com os dados compatíveis com a equipe de drenagem e o caminhão hidrojato sem reservas; escolha uma data futura. O cliente envia os campos do contrato e um `Idempotency-Key`; o BFF encaminha uma única tentativa ao serviço, sem retry automático.
5. Consulte ação e SAGA. O painel mostra o estado e as etapas publicados por Operações; as reservas passam pelos serviços Equipes e Frota. A implementação do orquestrador pertence ao Alexandre.
6. Consulte o CQRS de Risco pelo fluxo apresentado pelo Mark; o BFF Web usa o panorama publicado pelo modelo de leitura.
7. Envie uma pergunta em **Pergunte à Análise**. A resposta e os trechos vêm de `POST /v1/consultas`, serviço mantido pelo Augusto. O BFF não executa RAG no navegador. A síntese regional é solicitada separadamente por `POST /v1/analises` e mostra as fontes de Território e Risco.
8. Abra o [cliente Mobile](http://localhost:5174), escolha **Centro** e consulte a mesma região sem login.
9. Compare a região e o nível de atenção. O Web mostra os campos técnicos disponíveis; o Mobile entrega rótulo, mensagem e data sem percentis, geometria, vulnerabilidade ou dados de equipe.

## Verificação técnica e diagnóstico

Os endpoints abaixo são públicos e atravessam Kong e BFF Mobile:

```bash
curl --fail 'http://localhost:8000/mobile/v1/publico/regioes?municipio=Lavras'
curl --fail http://localhost:8000/mobile/v1/publico/regioes/6f1c2a10-0000-4000-8000-000000000001/resumo
curl --fail -I http://localhost:5173/
curl --fail -I http://localhost:5174/
```

O BFF Web exige JWT; sem token, o gateway deve responder `401`. Um token válido sem perfil aceito deve responder `403`. O cliente usa o JWT obtido no fluxo PKCE. Não cole tokens em logs compartilhados.

Para inspecionar logs e estado dos serviços:

```bash
docker compose ps --all
docker compose logs --tail=150 kong bff-web bff-mobile territorio risco operacoes analise keycloak
docker compose logs --tail=100 territorio-db risco-escrita-db risco-leitura-db
```

Uma API de domínio que responda com `application/problem+json` mantém seu status e corpo no BFF. Falha de conexão vira `503 problem+json`; timeout upstream normalmente vira `504 problem+json`. No resumo público Mobile, timeout de Território ou Risco também vira `503`, pois ambos são essenciais para produzir uma resposta confiável. Para restaurar os containers após corrigir configuração:

```bash
docker compose up -d --build
```

Se um banco for recriado, evite apagar volumes da apresentação sem necessidade: `docker compose down -v` remove os dados persistidos.

## Dependências atualmente pendentes

As rotas de ação e SAGA de Operações, os participantes Equipes/Frota e `POST /v1/analises` da Análise foram incorporados da `develop` em `BranchLucas`. A integração CI sobe esses serviços e confere uma ação real até o estado terminal, além de compor uma síntese regional com fontes reais. A análise usa fallback se Ollama não estiver pronto.

O serviço Território atual oferece regiões, mas ainda não expõe vulnerabilidade nem ocorrências; o BFF mantém esses blocos nulos e avisa sem inventar dados. Perguntas RAG podem depender de documentos indexados e dos modelos Ollama já carregados; sem trechos, a Análise responde `503 problem+json`, que o painel apresenta como erro legível. A síntese por região continua disponível com fallback do próprio serviço quando o modelo está indisponível.

O cliente Mobile depende de Território e Risco. Se qualquer um estiver indisponível, o resumo não declara uma situação segura: retorna erro explícito, que aparece na interface como mensagem amigável.
