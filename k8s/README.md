# Kubernetes

Os manifestos são organizados por componente com Kustomize. O roteiro de bootstrap completo de Keycloak, Kong, Traefik e dos BFFs está em [`docs/parte3/validacao-lucas.md`](../docs/parte3/validacao-lucas.md).

## Recursos desta implementação

- `bff-web` e `bff-mobile`: Deployment, Service `ClusterIP`, ConfigMap, probes HTTP e limites de recursos. Não há banco nem Secret para os BFFs.
- `keycloak`: Deployment, Service interno, ConfigMap, importação do realm e PostgreSQL StatefulSet com volume persistente. Credenciais são fornecidas pelo Secret `keycloak-secret`, criado fora do Git.
- `kong`: Deployment DB-less com initContainer Python, template e scripts montados de `kong-source`, chave pública em `keycloak-jwt-public-key` e arquivo final no `emptyDir`.
- `ingress`: Ingress `networking.k8s.io/v1`, classe `traefik`, host `pluvia.local`, direcionado somente ao Service do Kong.

## Segredos

Os arquivos `secret.env.example` são modelos sem credenciais válidas. Crie `secret.env` localmente, gere senhas fortes e não o versione. Para o Keycloak, `KC_DB_PASSWORD` e `POSTGRES_PASSWORD` precisam ser iguais. O Secret da chave JWT deve conter `realm-public-key.pem` obtida do próprio realm, nunca uma chave de exemplo.

O Kustomize raiz também inclui componentes de outros integrantes. Antes de aplicá-lo, prepare os Secrets e as imagens exigidos por esses serviços. Para validar somente o escopo de borda, aplique as Kustomizations individuais descritas no guia da Parte 3.
