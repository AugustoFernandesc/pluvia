# Correções dos contratos BFF e da chave do Keycloak

## Arquivos revisados

- `docs/api/bff-web.yaml`: 10 respostas `401` acrescentadas. Agora, as 11 operações protegidas têm essa resposta.
- `docs/api/bff-mobile.yaml`: 5 respostas `401` acrescentadas. Agora, as 7 operações protegidas têm essa resposta; as 2 públicas mantêm `security: []`.
- Nos dois contratos, `NaoAutenticado` descreve o JSON nativo do plugin JWT do Kong, inclusive os erros de expiração, sem exigir um corpo Problem Details que o gateway não produz por padrão.
- `docs/arquitetura/03-gateway.md`: explica a geração da configuração com a chave pública PEM e o issuer antes da inicialização do Kong.
- `docs/arquitetura/04-bff.md`: registra a diferença entre `401` e `403` e a política das rotas públicas.

Os caminhos entre os documentos e os contratos foram preservados na estrutura do pacote.

## Geração do kong.yml

O pacote inclui `gateway/kong.yml.template` e `gateway/render-kong.py`. O script requer apenas Python 3 e aceita a chave pública em variável de ambiente ou em arquivo PEM, inclusive com várias linhas.

Defina `KEYCLOAK_ISSUER` com o valor exato do claim `iss` dos tokens. Defina também **uma** entrada de chave: `KEYCLOAK_REALM_PUBLIC_KEY_FILE`, com o caminho do PEM, ou `KEYCLOAK_REALM_PUBLIC_KEY`, com o PEM completo e quebras de linha reais.

Na raiz do projeto, execute:

```sh
python3 gateway/render-kong.py --output /tmp/pluvia-kong/kong.yml
```

O script gera um arquivo com os valores preenchidos e preserva as quebras de linha do PEM. O `kong.yml` gerado deve ficar fora do controle de versão. A chave pública real do realm precisa ser fornecida pelo responsável pelo ambiente; ela não foi enviada com os anexos.

Antes de iniciar o Kong, configure `KONG_DATABASE=off`, aponte `KONG_DECLARATIVE_CONFIG` para o arquivo final e valide-o com `kong config parse`. O exemplo completo e a adaptação para Kubernetes estão em `docs/arquitetura/03-gateway.md`.

## Verificação

Foram conferidas a sintaxe dos YAML, as referências locais dos contratos, a cobertura de `401` nas 18 operações protegidas e a preservação das 2 operações públicas. A geração foi verificada com uma chave RSA de teste, por arquivo e por variável de ambiente, incluindo PEM com várias linhas e rejeição de entradas ausentes ou inválidas.

Não foi executado um Kong real neste ambiente, nem uma integração com o realm do projeto. A validação com `kong config parse` e os testes HTTP devem ser executados no ambiente do projeto com a chave real.
