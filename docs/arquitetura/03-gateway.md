# 4.3 API Gateway e gateway routing

## Escolha

**Kong**, em modo declarativo (sem banco próprio), configurado por um único arquivo final `kong.yml`. O repositório versiona o modelo `gateway/kong.yml.template` e o gerador `gateway/render-kong.py`; o arquivo final é gerado antes da inicialização, com a chave pública e o emissor do Keycloak do ambiente.

Kong foi escolhido porque oferece, por configuração e sem código, os três recursos de que a Pluvia precisa na borda: roteamento por caminho, validação de JWT e limitação de taxa. O modo declarativo mantém toda a configuração do gateway no Git, revisável por pull request como qualquer outro código.

---

## Princípio

**O gateway só conhece os BFFs.** Nenhum serviço de domínio é roteado diretamente para fora. Isso significa que:

- a superfície exposta é mínima: dois destinos, não dez;
- os serviços internos podem mudar de endereço, versão ou forma sem afetar os clientes;
- o gateway permanece burro de propósito. Composição e adaptação de resposta são papel dos BFFs.

---

## Regras de roteamento

| Caminho externo | Destino | Autenticação | Limite |
|---|---|---|---|
| `/web/v1/*` | BFF Web | JWT obrigatório | 300 req/min por usuário |
| `/mobile/v1/publico/*` | BFF Mobile | Nenhuma | 30 req/min por IP |
| `/mobile/v1/*` | BFF Mobile | JWT obrigatório | 120 req/min por usuário |
| `/auth/*` | Keycloak | Nenhuma | 20 req/min por IP |

Os caminhos chegam aos BFFs **sem alteração**: `/web/v1/painel` chega ao BFF Web como `/web/v1/painel`. Cada BFF é dono do seu espaço de caminhos, o que evita reescrita no gateway e mantém o mesmo endereço nos logs do gateway e do BFF.

Quando dois prefixos se sobrepõem, como `/mobile/v1/publico` e `/mobile/v1`, o Kong prioriza o caminho mais longo. A rota pública é avaliada primeiro.

### Por que existe uma rota pública

A comunidade pode consultar o resumo da própria região sem criar conta. Exigir login para saber se o próprio bairro está em atenção seria uma barreira injustificada. Em contrapartida, essa rota tem o limite mais restritivo e expõe apenas leitura de resumo.

### O que não passa pelo gateway

**Leituras dos sensores.** Sensores publicam via MQTT diretamente no plugin MQTT do RabbitMQ. MQTT não é HTTP, e forçar o tráfego de dispositivos pelo gateway exigiria convertê-lo, sem ganho. A autenticação dos sensores é feita no próprio broker, com credencial por dispositivo.

---

## Responsabilidades

| Responsabilidade | No gateway? | Onde fica |
|---|---|---|
| Ponto único de entrada e roteamento | Sim | Kong |
| Terminação TLS | Sim | Kong |
| Validação de assinatura e expiração do JWT | Sim | Plugin `jwt` |
| Limitação de taxa | Sim | Plugin `rate-limiting` |
| Identificador de correlação | Sim | Plugin `correlation-id`, cabeçalho `X-Request-ID` |
| CORS do painel web | Sim | Plugin `cors` |
| Limite de tamanho de requisição | Sim | Plugin `request-size-limiting` |
| Autorização por perfil (gestor, técnico, agente) | Não | BFF, que conhece o contexto de cada tela |
| Agregação de respostas | Não | BFF |
| Regras de negócio | Não | Serviços de domínio |

**Por que a agregação não fica no gateway.** Agregar no gateway levaria para a borda o conhecimento de como cada tela precisa dos dados, que é justamente a razão de existir dos BFFs. Com os dois, a responsabilidade fica duplicada e confusa. O gateway cuida do que é comum a todo tráfego; o BFF cuida do que é específico de cada cliente.

**Por que a autorização por perfil não fica no gateway.** O gateway sabe se o token é válido, mas não sabe se um agente pode ver as ações de outra equipe. Essa decisão depende de dados, e fica no BFF.

---

## Configuração declarativa

Conteúdo do `gateway/kong.yml.template` que será usado na implementação. Os marcadores `__KEYCLOAK_ISSUER_JSON__` e `__KEYCLOAK_REALM_PUBLIC_KEY_JSON__` são substituídos pelo gerador, antes de o Kong ler a configuração:

```yaml
_format_version: "3.0"

services:
  - name: bff-web
    url: http://bff-web:3000
    routes:
      - name: web
        paths: ["/web/v1"]
        strip_path: false
    plugins:
      - name: jwt
        config:
          key_claim_name: iss
          claims_to_verify: ["exp"]
      - name: rate-limiting
        config:
          minute: 300
          limit_by: consumer
          policy: local
      - name: cors
        config:
          origins: ["http://localhost:5173"]
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]

  - name: bff-mobile
    url: http://bff-mobile:3000
    routes:
      - name: mobile-publico
        paths: ["/mobile/v1/publico"]
        strip_path: false
        plugins:
          - name: rate-limiting
            config:
              minute: 30
              limit_by: ip
              policy: local
      - name: mobile
        paths: ["/mobile/v1"]
        strip_path: false
        plugins:
          - name: jwt
            config:
              key_claim_name: iss
              claims_to_verify: ["exp"]
          - name: rate-limiting
            config:
              minute: 120
              limit_by: consumer
              policy: local

  - name: keycloak
    url: http://keycloak:8080
    routes:
      - name: auth
        paths: ["/auth"]
        strip_path: true
    plugins:
      - name: rate-limiting
        config:
          minute: 20
          limit_by: ip
          policy: local

consumers:
  - username: pluvia-keycloak
    jwt_secrets:
      - key: __KEYCLOAK_ISSUER_JSON__
        algorithm: RS256
        rsa_public_key: __KEYCLOAK_REALM_PUBLIC_KEY_JSON__

plugins:
  - name: correlation-id
    config:
      header_name: X-Request-ID
      generator: uuid
      echo_downstream: true
  - name: request-size-limiting
    config:
      allowed_payload_size: 1
```

### Geração do arquivo carregado pelo Kong

O Kong **não interpola `${VARIAVEL}` dentro do YAML declarativo**. Definir uma variável de ambiente com a chave, por si só, não preenche `rsa_public_key`. Por isso, `gateway/render-kong.py` lê o modelo e gera o `kong.yml` com os valores concretos. O script usa apenas a biblioteca padrão do Python 3.

O gerador exige `KEYCLOAK_ISSUER`, com o valor exato do claim `iss` dos tokens, e uma das duas entradas para a chave: `KEYCLOAK_REALM_PUBLIC_KEY_FILE`, apontando para um arquivo PEM, ou `KEYCLOAK_REALM_PUBLIC_KEY`, contendo o PEM completo com quebras de linha reais. As duas entradas de chave não devem ser definidas ao mesmo tempo. Deve ser a chave pública RSA correspondente à assinatura RS256 do realm, com os delimitadores `BEGIN PUBLIC KEY` e `END PUBLIC KEY` (ou `RSA PUBLIC KEY`).

A chave é serializada como string JSON, que também é válida no YAML. Assim, as quebras de linha ficam escapadas no arquivo e são reconstruídas na leitura, sem depender da indentação do PEM. O arquivo final contém a chave pública; o que fica fora do Git são os valores de cada ambiente e o arquivo gerado. A chave privada do Keycloak não participa desse processo.

Exemplo em shell POSIX, executado na raiz do projeto, em um ambiente com Python 3 e a CLI do Kong instalados:

```sh
set -eu
# Use o issuer exato dos tokens deste ambiente, inclusive o prefixo /auth, se houver.
export KEYCLOAK_ISSUER="https://api.pluvia.local/auth/realms/pluvia"
# O arquivo deve conter a chave pública real do realm em formato PEM.
export KEYCLOAK_REALM_PUBLIC_KEY_FILE="/run/secrets/keycloak/realm-public-key.pem"
export KONG_DATABASE=off
export KONG_DECLARATIVE_CONFIG="/tmp/pluvia-kong/kong.yml"

python3 gateway/render-kong.py --output "$KONG_DECLARATIVE_CONFIG"
kong config parse "$KONG_DECLARATIVE_CONFIG"
kong start
```

O gerador encerra com erro se faltar o emissor, a chave estiver ausente, a estrutura PEM estiver incorreta ou algum marcador não for resolvido. `kong config parse` verifica a configuração declarativa antes da inicialização. O modelo nunca deve ser passado diretamente a `KONG_DECLARATIVE_CONFIG`.

Na Parte 3, um `initContainer` com Python 3 recebe o modelo por `ConfigMap`, lê a chave montada a partir de um `Secret` e grava o `kong.yml` em um volume `emptyDir` compartilhado com o contêiner do Kong. O Kong recebe `KONG_DATABASE=off` e `KONG_DECLARATIVE_CONFIG` apontando para esse arquivo. Os arquivos e permissões do volume devem permitir que o usuário do Kong leia a configuração. A atualização da chave exige gerar e carregar novamente a configuração em cada instância.

### Respostas de autenticação nos contratos

Todas as operações protegidas dos dois contratos BFF documentam a resposta `401` por referência ao componente `NaoAutenticado`. Ela cobre token ausente, inválido ou expirado e é emitida pelo gateway, antes de a requisição chegar ao BFF. As duas operações públicas do Mobile continuam com `security: []`.

Os contratos descrevem o corpo JSON nativo do plugin `jwt`: ele pode conter `message` nas falhas de credencial ou campos de erro dos claims, como `exp` na expiração. O cliente deve tratar o status `401`, sem depender do texto da mensagem. O `403` continua indicando falta de autorização para uma operação após a autenticação.

---

## Relação com a Parte 3

No Kubernetes, o **Ingress** recebe o tráfego externo do cluster e encaminha tudo para o `Service` do Kong. O Kong continua aplicando as regras deste documento. O Ingress resolve "como o tráfego entra no cluster"; o gateway resolve "para onde cada requisição vai e com quais políticas".

## Referências

- [Kong — configuração declarativa em modo DB-less](https://developer.konghq.com/gateway/db-less-mode/).
- [Kong — plugin JWT, chave pública RSA e identificação pelo claim `iss`](https://developer.konghq.com/plugins/jwt/).
- [Kong — CLI `kong config parse`](https://developer.konghq.com/gateway/cli/reference/).
- [Kong — implementação das respostas do plugin JWT](https://github.com/Kong/kong/blob/master/kong/plugins/jwt/handler.lua).
