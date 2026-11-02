# Kubernetes

Manifestos do Pluvia organizados por componente com Kustomize (embutido no `kubectl`). O roteiro de bootstrap completo de Keycloak, Kong, Traefik e dos BFFs está em [`docs/parte3/validacao-lucas.md`](../docs/parte3/validacao-lucas.md).

## Subir

As imagens dos serviços são as que `docker compose build` gera (`pluvia-<servico>:latest`). Em clusters que não compartilham as imagens do Docker local, como o Kind, carregue-as antes com `kind load docker-image`.

```bash
docker compose build
kubectl apply -k k8s
kubectl -n pluvia get pods
```

A Kustomization raiz inclui os serviços de todos os integrantes. Antes de aplicá-la, crie os Secrets locais e prepare/carregue as imagens de todos os serviços. O job de CI da Parte 3 aplica separadamente seus componentes de borda, conforme o guia acima.

Para testar um serviço sem Ingress:

```bash
kubectl -n pluvia port-forward svc/territorio 3000:3000
```

## Recursos da Parte 3

- `bff-web` e `bff-mobile`: Deployment, Service `ClusterIP`, ConfigMap, probes HTTP e limites de recursos. Não há banco nem Secret para os BFFs.
- `keycloak`: Deployment, Service interno, ConfigMap, importação do realm e PostgreSQL StatefulSet com volume persistente. Credenciais são fornecidas pelo Secret `keycloak-secret`, criado fora do Git.
- `kong`: Deployment DB-less com initContainer Python, template e scripts montados de `kong-source`, chave pública em `keycloak-jwt-public-key` e arquivo final no `emptyDir`.
- `ingress`: Ingress `networking.k8s.io/v1`, classe `traefik`, host `pluvia.local`, direcionado somente ao Service do Kong.

## Segredos

Os arquivos `secret.env.example` são modelos sem credenciais válidas. Crie `secret.env` localmente, gere senhas fortes e não o versione. Para o Keycloak, `KC_DB_PASSWORD` e `POSTGRES_PASSWORD` precisam ser iguais. O Secret da chave JWT deve conter `realm-public-key.pem` obtida do próprio realm, nunca uma chave de exemplo.

## Padrão de cada serviço

Use `k8s/territorio` como modelo. Uma pasta por serviço, com:

| Arquivo | Conteúdo |
|---|---|
| `configmap.yaml` | `<servico>-config`: configuração não secreta, como `PORT`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` e `PGDATA` |
| `deployment.yaml` | Deployment que lê ConfigMap e Secret. Readiness em `GET /health`, liveness por TCP e `requests`/`limits` definidos |
| `service.yaml` | Service `ClusterIP` com o nome e a porta esperados pelo serviço |
| `db.yaml` | StatefulSet do banco com volume persistente (`volumeClaimTemplates`) e Service headless `<servico>-db` |
| `kustomization.yaml` | Lista os arquivos e gera o Secret `<servico>-secret` a partir de `secret.env` |
| `secret.env.example` | Modelo versionado que contém apenas nomes e placeholders das variáveis secretas |

Para criar um serviço novo, copie a pasta, troque o nome com `sed -i 's/territorio/<servico>/g'`, troque a imagem do banco em `db.yaml` e adicione a pasta em `resources:` na Kustomization raiz.

## Regras

- **Segredo nunca entra no Git.** Crie `secret.env` a partir do exemplo: `cp k8s/<servico>/secret.env.example k8s/<servico>/secret.env`, substitua os placeholders por valores locais fortes e não versione o arquivo.
- **ConfigMap para configuração, Secret para credencial.** Nada de senha em ConfigMap nem configuração comum em Secret.
- **O Secret é gerado pelo Kustomize**, com um sufixo de hash no nome. Quando `secret.env` muda, o nome muda e os pods reiniciam com o valor novo.
- **Nomes iguais aos do Compose.** O Service do banco usa o mesmo host nos dois ambientes para o código não mudar.
- **Liveness não depende do banco.** Se a liveness depender do banco, uma queda do banco reinicia os pods sem resolver a causa. A readiness retira o pod do balanceamento enquanto o banco está indisponível.
- **`requests` e `limits` sempre definidos.** Sem eles o escalonamento por CPU não funciona.
- **Banco com uma réplica.** O serviço pode escalar; cada StatefulSet de banco permanece com uma réplica e volume próprio.

## Serviço com mais de um banco (Risco)

O Risco tem um banco de escrita e um de leitura. A pasta contém `db-escrita.yaml` e `db-leitura.yaml`, cada um com StatefulSet, volume e Service headless próprios (`risco-escrita-db` e `risco-leitura-db`), os mesmos hosts do Compose.

O ConfigMap e o Secret guardam as variáveis dos dois bancos com prefixos (`POSTGRES_ESCRITA_*` e `POSTGRES_LEITURA_*`). O Deployment lê ambos com `envFrom`. Cada StatefulSet usa `configMapKeyRef` e `secretKeyRef` para definir as variáveis padrão da imagem (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`).

## Banco com extensão (Análise)

A Análise usa `pgvector/pgvector:pg17`. A extensão é criada por um script em `/docker-entrypoint-initdb.d`, montado via ConfigMap `analise-db-init` gerado na Kustomization da pasta. O script só roda quando o volume é criado.

## Demonstração de escalonamento

```bash
bash k8s/demo-escalonamento.sh        # 3 réplicas, 30 requisições
bash k8s/demo-escalonamento.sh 4 60   # 4 réplicas, 60 requisições
```

O script escala o Deployment da Análise, mostra os pods (o banco continua com uma réplica), envia requisições de dentro do cluster pelo Service e conta quantas cada pod atendeu pelo cabeçalho `X-Atendido-Por`. No fim, mostra logs de acesso com `--prefix`, filtrando as chamadas da demonstração.

As requisições saem de um pod temporário porque `kubectl port-forward svc/...` escolhe um único pod e enviaria tudo para ele, escondendo a distribuição da carga.
