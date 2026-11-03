# Parte 3 — BFFs, identidade e entrada HTTP

Este guia descreve a implementação de BFF Web, BFF Mobile, Keycloak, Kong DB-less e Ingress. Os BFFs desta etapa implementam autenticação, autorização, healthcheck e rotas técnicas de verificação; as operações de negócio descritas nos contratos OpenAPI continuam fora deste escopo.

## Componentes e caminhos

| Componente | Código e configuração |
|---|---|
| BFF Web | `services/bff-web/`; prefixo `/web/v1`; perfis `GESTOR` e `TECNICO` |
| BFF Mobile | `services/bff-mobile/`; prefixo `/mobile/v1`; perfil protegido `AGENTE`; prefixo público `/mobile/v1/publico` |
| Realm | `infra/keycloak/realm/pluvia-realm.json` e `k8s/keycloak/pluvia-realm.json`; realm `pluvia`, assinatura RS256 e roles do projeto |
| Kong | `gateway/kong.yml.template`, `gateway/render-kong.py`, `infra/kong/` e `k8s/kong/` |
| Ingress | `k8s/ingress/`; host `pluvia.local`, classe `traefik`, destino único `kong:8000` |
| CI | `.github/workflows/ci.yml`; testes de código, Compose/Keycloak/Kong e Kind/Traefik |

Os BFFs verificam criptograficamente os tokens por conta própria. Essa verificação é necessária porque os serviços não publicam portas no Compose e usam Services internos no Kubernetes, mas a autorização permanece protegida mesmo se alguém alcançar o pod diretamente. A validação exige assinatura RS256, issuer, audience, expiração e idade máxima de cinco minutos. Os papéis são lidos de `realm_access.roles`; headers de perfil enviados pelo cliente não concedem acesso.

## Rotas verificáveis

| Rota | Resultado esperado |
|---|---|
| `GET /health` | Pública, fora dos prefixos versionados |
| `GET /web/v1/_system/authorization-check` | JWT de `GESTOR` ou `TECNICO` recebe 200; sem token 401; `AGENTE` recebe 403 |
| `GET /web/v1/_system/tecnico` | JWT de `TECNICO` recebe 200; `GESTOR` recebe 403 |
| `GET /mobile/v1/publico/_system/status` | Pública, recebe 200 |
| `GET /mobile/v1/_system/authorization-check` | JWT de `AGENTE` recebe 200; sem token 401; `GESTOR` recebe 403 |

Os caminhos `_system` são testes técnicos e não substituem as rotas descritas em `docs/api/bff-web.yaml` ou `docs/api/bff-mobile.yaml`. O Kong preserva os prefixos dos BFFs (`strip_path: false`). A rota pública Mobile é mais específica que a rota autenticada. `/auth` usa `strip_path: true`: o Keycloak atende na raiz interna enquanto anuncia o hostname externo com o prefixo `/auth`.

## Pré-requisitos para executar a infraestrutura

Para Docker Compose: Docker Engine com Docker Compose v2 compatível com `include:` e `up --wait`, além de Node.js 24 e Python 3. Para Kubernetes: cluster Kubernetes, `kubectl` com Kustomize, Helm 3, controlador Traefik e imagens disponíveis no cluster. A CI hospedada instala essas ferramentas; elas não precisam estar na máquina usada apenas para editar o código.

Nenhuma credencial real está no repositório. Os `.env.example` e `secret.env.example` contêm marcadores que precisam ser substituídos antes de um ambiente real. Os arquivos `.env` e `secret.env` são ignorados pelo Git.

## Variáveis de ambiente

### Compose

`infra/keycloak/.env.example` documenta o administrador inicial, o banco, proxy, hostname e healthcheck. Gere senhas fortes para `KC_BOOTSTRAP_ADMIN_PASSWORD`, `KC_DB_PASSWORD` e `POSTGRES_PASSWORD`; os dois valores do banco precisam ser iguais. Não reutilize os marcadores `replace-with-*`.

`infra/kong/.env.example` define:

- `KEYCLOAK_ISSUER`: valor externo exato de `iss`, normalmente `http://localhost:8000/auth/realms/pluvia` no Compose;
- `KEYCLOAK_JWKS_URL` e `KEYCLOAK_DISCOVERY_URL`: endpoints internos do serviço Keycloak usados no bootstrap;
- `KONG_BOOTSTRAP_TIMEOUT_SECONDS`: prazo para descoberta e publicação de uma chave RS256.

Cada BFF recebe `PORT`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL` e a sua `OIDC_AUDIENCE`. As variáveis não secretas do Kubernetes estão em `k8s/bff-web/configmap.yaml`, `k8s/bff-mobile/configmap.yaml` e `k8s/keycloak/configmap.yaml`.

## Execução com Docker Compose

1. Copie cada `.env.example` ao lado para `.env`, incluindo os serviços já existentes que participam do Compose raiz. Preencha os valores conforme os exemplos de cada serviço. No arquivo do Keycloak, use a mesma senha para `KC_DB_PASSWORD` e `POSTGRES_PASSWORD`.
2. Valide a configuração e suba o Compose completo:

   ```sh
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

   O Compose raiz mantém os `include:` dos demais integrantes. `kong-config` é um serviço one-shot: deve encerrar com código zero após gerar a configuração, e Kong aguarda essa conclusão. Por isso a instrução não usa `--wait` para toda a stack; confira o estado dos serviços duradouros em `docker compose ps`. A CI aguarda os healthchecks de Keycloak/BFFs, inicia Kong após o bootstrap e consulta o endpoint OIDC até responder.

3. A entrada HTTP do Kong é `http://localhost:8000`. Consulte `GET http://localhost:8000/auth/realms/pluvia/.well-known/openid-configuration`; o campo `issuer` deve coincidir exatamente com `KEYCLOAK_ISSUER`.
4. A administração do Kong não é publicada. O Keycloak também não publica uma porta no Compose padrão. O arquivo `.github/docker-compose-ci.override.yaml` publica Keycloak apenas em `127.0.0.1:18080` para que o teste de CI consiga criar clientes de curta duração.

O bootstrap do serviço `kong-config` consulta descoberta OIDC e JWKS, confirma que o issuer coincide, converte a chave pública RS256 publicada pelo realm e chama o gerador canônico `gateway/render-kong.py`. O Kong só inicia depois da geração bem-sucedida. O YAML gerado e a chave ficam no volume efêmero `kong-config`, não no Git.

## Execução em Kubernetes e Ingress

Os exemplos abaixo usam `pluvia.local` e `http`. Em produção, use hostname HTTPS e certificado/TLS no Ingress; atualize `KC_HOSTNAME`, `KEYCLOAK_ISSUER` e as configurações públicas para a URL canônica com `/auth`. O JWKS usado pelos pods continua acessível pelo DNS interno `keycloak:8080`.

### 1. Instalar Traefik

Instale o controlador no cluster, fora do namespace da aplicação:

```sh
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik traefik/traefik --namespace traefik --create-namespace --version 42.1.3 --set ingressClass.enabled=true --set ingressClass.name=traefik --wait --timeout 180s
kubectl rollout status deployment/traefik --namespace traefik
kubectl get ingressclass traefik
```

O chart cria a classe `traefik`. O manifesto `k8s/ingress/ingress.yaml` usa essa classe e encaminha todo o tráfego HTTP de `pluvia.local` ao Service `kong` na porta 8000. Não há rota direta aos BFFs.

### 2. Criar namespace e Secret do Keycloak

Copie `k8s/keycloak/secret.env.example` para `k8s/keycloak/secret.env`, defina credenciais fortes e mantenha iguais `KC_DB_PASSWORD` e `POSTGRES_PASSWORD`. Não adicione o arquivo ao Git.

```sh
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic keycloak-secret --namespace pluvia --from-env-file=k8s/keycloak/secret.env
```

Construa e publique `pluvia/keycloak:local` no registry usado pelo cluster (ou carregue a imagem no Kind). Depois aplique o Keycloak e espere o banco e o servidor ficarem prontos:

```sh
docker build -t pluvia/keycloak:local infra/keycloak
kubectl apply -k k8s/keycloak
kubectl rollout status statefulset/keycloak-db --namespace pluvia --timeout=300s
kubectl rollout status deployment/keycloak --namespace pluvia --timeout=360s
```

O realm é importado de `k8s/keycloak/pluvia-realm.json`; a senha inicial não é parte do arquivo do realm.

### 3. Gerar o Secret da chave real e o ConfigMap do Kong

Abra um terminal separado e mantenha o port-forward enquanto o script consulta a descoberta e o JWKS:

```sh
kubectl port-forward --namespace pluvia svc/keycloak 18081:8080
```

No terminal principal, defina o issuer externo do cluster, mas aponte descoberta e JWKS para o port-forward. O script valida que o issuer publicado é o esperado, gera PEM a partir da chave real e renderiza uma configuração temporária. `TEMP_DIR` representa um diretório temporário local.

```sh
TEMP_DIR="$(mktemp -d)"
export KEYCLOAK_ISSUER=http://pluvia.local/auth/realms/pluvia
export KEYCLOAK_JWKS_URL=http://127.0.0.1:18081/realms/pluvia/protocol/openid-connect/certs
export KEYCLOAK_DISCOVERY_URL=http://127.0.0.1:18081/realms/pluvia/.well-known/openid-configuration
python infra/kong/bootstrap-kong.py \
  --template gateway/kong.yml.template \
  --renderer gateway/render-kong.py \
  --output "$TEMP_DIR/kong.yml" \
  --key-output "$TEMP_DIR/realm-public-key.pem"
```

Crie o Secret da chave pública e a fonte de configuração canônica do Kong:

```sh
kubectl create secret generic keycloak-jwt-public-key --namespace pluvia \
  --from-file=realm-public-key.pem="$TEMP_DIR/realm-public-key.pem"
kubectl create configmap kong-source --namespace pluvia \
  --from-file=kong.yml.template=gateway/kong.yml.template \
  --from-file=render-kong.py=gateway/render-kong.py \
  --from-file=bootstrap-kong.py=infra/kong/bootstrap-kong.py
```

O Secret contém somente a chave pública ativa do realm. O initContainer confirma que ela ainda aparece no JWKS e gera `kong.yml` em `emptyDir`; o container principal usa `KONG_DATABASE=off` e não abre a porta de administração.

### 4. Construir os BFFs e aplicar a borda

Use imagens em um registry acessível pelo cluster; para Kind, carregue as imagens com `kind load docker-image`. Atualize as referências `image:` nos Deployments caso use nomes/tag diferentes.

```sh
docker build -t pluvia/bff-web:local services/bff-web
docker build -t pluvia/bff-mobile:local services/bff-mobile
docker build -t pluvia/kong:local infra/kong
kind load docker-image --name pluvia pluvia/bff-web:local pluvia/bff-mobile:local pluvia/keycloak:local pluvia/kong:local
kubectl apply -k k8s/bff-web
kubectl apply -k k8s/bff-mobile
kubectl apply -k k8s/kong
kubectl apply -k k8s/ingress
kubectl rollout status deployment/bff-web --namespace pluvia
kubectl rollout status deployment/bff-mobile --namespace pluvia
kubectl rollout status deployment/kong --namespace pluvia
```

Para implantar também os serviços de domínio já existentes, prepare cada `secret.env`, disponibilize as imagens correspondentes e então use `kubectl apply -k k8s`. Essa etapa não é requisito para as rotas técnicas dos BFFs.

### 5. Resolver o host e verificar o Ingress

Configure `pluvia.local` no DNS do cluster ou no arquivo `hosts` da máquina cliente apontando para o endereço de entrada do Traefik. Em Kind local sem endereço de LoadBalancer, encaminhe a porta e envie o Host explicitamente:

```sh
kubectl port-forward --namespace traefik svc/traefik 18080:80
curl -H 'Host: pluvia.local' http://127.0.0.1:18080/mobile/v1/publico/_system/status
curl -H 'Host: pluvia.local' http://127.0.0.1:18080/auth/realms/pluvia/.well-known/openid-configuration
```

Uma resposta pública do BFF prova o fluxo HTTP Ingress → Kong → BFF naquele cluster. A existência do YAML sozinha não prova esse tráfego; o job Kind executa esse smoke test no runner hospedado.

## Limites de rate limiting

As rotas autenticadas aplicam 300 req/min no Web e 120 req/min no Mobile por usuário. O plugin JWT ainda mapeia o issuer para o Consumer `pluvia-keycloak`, mas o plugin local `pluvia-subject-rate-limit` lê o `sub` somente do JWT já validado, deriva um SHA-256 e sobrescreve o header interno `X-Pluvia-RateLimit-Subject`. O plugin nativo `rate-limiting` usa esse valor como chave. Qualquer valor recebido do cliente é substituído depois da autenticação e o plugin `request-transformer` remove o header antes de encaminhar ao BFF.

A CI verifica contadores separados com dois tokens Web e dois tokens Mobile, incluindo requisições com valores forjados e diferentes para o header. Também confirma que o header não chega aos BFFs. Os limites públicos Mobile (30 req/min) e `/auth` (20 req/min) continuam por IP. A política de contagem é local, e a implantação contém uma réplica Kong; ao escalar horizontalmente será necessário uma política de armazenamento compartilhado, como Redis, para manter cotas globais por usuário.

## Testes e CI

Localmente, os testes dos BFFs usam uma chave RSA e um servidor JWKS HTTP efêmeros; verificam health, ausência/token inválido/expirado, perfis permitidos e proibidos, rota pública, prefixos e tentativa de falsificar `x-profile`. Os testes Python exercitam conversão da chave, espera pelo JWKS, descoberta, issuer incorreto e renderização. `scripts/validate-infra.py` verifica sintaxe YAML/JSON e consistência de Compose, Kong, BFF e manifests.

`.github/workflows/ci.yml` executa em runners hospedados pelo GitHub:

- **BFF matrix:** Node 24, `npm ci`, lint, typecheck, testes HTTP e build dos dois BFFs.
- **Validação estática:** Python, PyYAML, testes do bootstrap, configuração efêmera para geradores Kustomize e `kubectl kustomize k8s`.
- **Docker e autenticação real:** gera credenciais descartáveis no runner, valida Compose, constrói o Kong com o plugin local, sobe Keycloak/Postgres/Kong/BFFs, obtém JWTs do Keycloak e verifica issuer, papéis, 401/403, rota pública, contadores por subject, resistência a headers forjados e encaminhamento pelo Kong.
- **Kind e Traefik:** constrói/carrega as imagens, instala e aguarda o chart Traefik, confirma a IngressClass, aplica Keycloak/Kong/BFFs e executa o mesmo teste de autenticação e rate limit através do Ingress. O cluster é removido ao final.

Os gatilhos são push em `BranchLucas`/`BRANCHLUCAS`, Pull Request para `develop` e execução manual. Os jobs não usam secrets permanentes do GitHub. Clientes de teste e credenciais são temporários; o job Docker remove volumes e o job Kind exclui o cluster. Todos os jobs passaram no Pull Request #20.

## Limitações e diagnóstico

- **Executado localmente:** Compose completo e Kubernetes do Docker Desktop (kubeadm, um nó, 6 GB), seguindo este guia do zero, com Traefik pelo Helm. Os 23 pods ficam `Running 1/1` e `scripts/ci_integration.py` passa pelo Ingress (`--gateway-url http://127.0.0.1:80`, sem port-forward, porque o Docker Desktop publica o LoadBalancer do Traefik em `localhost`).
- **Kong reiniciando com `OOMKilled`:** o padrão do Kong abre um worker por CPU do nó, e em máquina com muitos núcleos os workers passam do limite de 512Mi. Por isso o Deployment fixa `KONG_NGINX_WORKER_PROCESSES=2`.
- **401:** confira issuer, audience, assinatura, expiração e se o bearer foi enviado. A rota `/auth` precisa anunciar o issuer externo com esse prefixo.
- **403:** a assinatura foi aceita, mas o token não contém o papel autorizado em `realm_access.roles`.
- **503 no BFF:** verifique se o endereço interno de JWKS (`keycloak:8080` no Compose/Kubernetes) está acessível e se Keycloak já publicou uma chave RS256.
- **Kong não inicia:** confira logs do `kong-config` ou initContainer; issuer incompatível com OIDC ou Secret de chave pública desatualizado impede a renderização.
- **404 no Ingress:** confira `IngressClass traefik`, host `pluvia.local`, regra do Ingress e se o port-forward/DNS aponta ao serviço Traefik.
- **Pods de domínio sem imagem/Secret:** o Kustomize raiz inclui componentes dos outros integrantes; prepare suas imagens e Secrets antes de aplicar a raiz. O job de borda valida apenas os componentes do escopo Lucas.

## Por que Docker multi-stage

Cada Dockerfile separa compilação TypeScript, instalação de dependências de produção e execução. A imagem final não carrega compilador, ferramentas de teste ou dependências de desenvolvimento, e usa usuário sem privilégios. Essa configuração reduz a superfície e o conteúdo da imagem: a imagem final de cada BFF tem 276 MB.
