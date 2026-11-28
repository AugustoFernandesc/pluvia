# BFF Web

API de borda para o painel web, implementada em NestJS. O serviço não possui banco de dados: autentica cada requisição com JWT RS256 emitido pelo Keycloak e aplica autorização por papéis.

## Configuração e execução

Copie `.env.example` para `.env` e ajuste o issuer e a URL interna do JWKS para o ambiente. `KEYCLOAK_ISSUER` deve ser idêntico ao claim `iss` do token. `KEYCLOAK_JWKS_URL` deve ser acessível pelo processo do BFF.

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

O container escuta na porta 3000 e roda como usuário sem privilégios. O Dockerfile usa estágios separados para compilar, instalar somente dependências de produção e montar a imagem final.

## Rotas desta etapa

- `GET /health`: verificação pública de processo, fora do prefixo da API.
- `GET /web/v1/_system/authorization-check`: verificação técnica acessível a `GESTOR` e `TECNICO`.
- `GET /web/v1/_system/tecnico`: verificação técnica exclusiva de `TECNICO`.

Além das rotas técnicas, o BFF expõe `GET /web/v1/painel`, `GET /web/v1/regioes/{id}`, encaminhamento de ações/SAGA, reconhecimento de sinalizações e `POST /web/v1/consultas`. A composição marca os blocos opcionais indisponíveis em `avisos`; não cria valores para serviços ainda sem endpoint.

Os endereços internos vêm de `TERRITORIO_URL`, `OPERACOES_URL`, `RISCO_URL` e `ANALISE_URL`. Cada chamada tem timeout; rede indisponível responde `503 application/problem+json`, timeout responde `504 application/problem+json`, e erros HTTP de domínio mantêm status, corpo e content-type. POST não tem retry automático. Apenas `X-Request-ID` e, na criação de ação, `Idempotency-Key` são encaminhados; identidade é derivada do JWT validado.

Links HAL de Operações e o header `Location` são convertidos para `/web/v1/...` quando apontam para ações do serviço.

## Autenticação

O BFF verifica a assinatura RS256 usando as chaves públicas do JWKS, além de `iss`, `aud`, `exp` e idade máxima do token. Papéis vêm de `realm_access.roles` somente depois da verificação criptográfica. `x-profile` e outros headers fornecidos pelo cliente não são usados para autorização. Falha temporária ao consultar o JWKS responde 503; token ausente ou inválido responde 401; papel sem permissão responde 403.

O log HTTP registra método, caminho, status, duração e `X-Request-ID`, sem registrar o bearer token.
