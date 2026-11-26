# BFF Mobile

API de borda para o aplicativo móvel, implementada em NestJS. O serviço não possui banco de dados: autentica cada requisição privada com JWT RS256 emitido pelo Keycloak e aplica autorização por papéis.

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
- `GET /mobile/v1/publico/_system/status`: verificação técnica pública.
- `GET /mobile/v1/_system/authorization-check`: verificação técnica exclusiva de `AGENTE`.

O fluxo público implementa `GET /mobile/v1/publico/regioes` (catálogo sem geometria) e `GET /mobile/v1/publico/regioes/{id}/resumo`. A lista vem de Território; o resumo combina nome e nível/data reais de Território e Risco. Sem nível ou data confiável, responde `502`; sem uma dependência essencial, responde `503` em `application/problem+json`. O resumo envia `ETag` e aceita `If-None-Match`.

Os endereços internos usam `TERRITORIO_URL` e `RISCO_URL`, com timeout configurável. Rotas públicas não usam JWT; rotas privadas continuam protegidas pelos guards atuais.

## Autenticação

O BFF verifica a assinatura RS256 usando as chaves públicas do JWKS, além de `iss`, `aud`, `exp` e idade máxima do token. Papéis vêm de `realm_access.roles` somente depois da verificação criptográfica. `x-profile` e outros headers fornecidos pelo cliente não são usados para autorização. Falha temporária ao consultar o JWKS responde 503; token ausente ou inválido responde 401; papel sem permissão responde 403.

O log HTTP registra método, caminho, status, duração e `X-Request-ID`, sem registrar o bearer token.
