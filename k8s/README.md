# Kubernetes

Manifestos do Pluvia, organizados com Kustomize (embutido no `kubectl`). Cada componente tem uma pasta própria, e o `kustomization.yaml` desta pasta junta todos no namespace `pluvia`.

## Subir

As imagens dos serviços são as que o `docker compose build` gera (`pluvia-<servico>:latest`). Em cluster que não compartilha as imagens do Docker local, como o kind, carregue-as antes com `kind load docker-image`.

```bash
docker compose build
kubectl apply -k k8s
kubectl -n pluvia get pods
```

Para testar um serviço sem Ingress:

```bash
kubectl -n pluvia port-forward svc/territorio 3000:3000
```

## Padrão de cada serviço

Use `k8s/territorio` como modelo. Uma pasta por serviço, com:

| Arquivo | Conteúdo |
|---|---|
| `configmap.yaml` | `<servico>-config`: tudo que não é segredo, como `PORT`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` e `PGDATA` |
| `deployment.yaml` | Deployment do serviço. Lê o ConfigMap e o Secret com `envFrom`. Readiness em `GET /health`, liveness por TCP, `requests` e `limits` definidos |
| `service.yaml` | Service `ClusterIP` com o nome do serviço, porta 3000 |
| `db.yaml` | StatefulSet do banco com volume persistente (`volumeClaimTemplates`) e Service headless `<servico>-db` |
| `kustomization.yaml` | Lista os arquivos e gera o Secret `<servico>-secret` a partir de `secret.env` |
| `secret.env.example` | Modelo do segredo, versionado. Só as variáveis secretas, como `POSTGRES_PASSWORD` |

Para criar um serviço novo, copie a pasta, troque o nome com `sed -i 's/territorio/<servico>/g'`, troque a imagem do banco em `db.yaml` e adicione a pasta em `resources:` no `kustomization.yaml` desta pasta.

## Regras

- **Segredo nunca entra no Git.** O `secret.env` de cada pasta é ignorado pelo `.gitignore`. Crie a partir do exemplo: `cp k8s/<servico>/secret.env.example k8s/<servico>/secret.env` e troque os valores. A senha deve ser a mesma do `.env` do compose do serviço.
- **ConfigMap para configuração, Secret para credencial.** Nada de senha em ConfigMap, nem configuração comum em Secret.
- **O Secret é gerado pelo Kustomize**, com um sufixo de hash no nome. Quando o `secret.env` muda, o nome muda e os pods reiniciam com o valor novo.
- **Nomes iguais aos do compose.** O Service do banco se chama `<servico>-db`, o mesmo host do compose, para o código não mudar entre os dois ambientes.
- **Liveness não depende do banco.** O `/health` verifica o PostgreSQL; se ele fosse a liveness, uma queda do banco reiniciaria todos os pods do serviço sem resolver nada. Por isso o `/health` fica na readiness, que só tira o pod do balanceamento.
- **`requests` e `limits` sempre definidos.** Sem eles o escalonamento automático por CPU não funciona.
- **Banco com uma réplica.** Só o Deployment do serviço escala; o banco é um StatefulSet com volume próprio.

## Serviço com mais de um banco (Risco)

O Risco tem um banco de escrita e um de leitura. Em vez de um `db.yaml`, a pasta tem `db-escrita.yaml` e `db-leitura.yaml`, cada um com StatefulSet, volume e Service headless próprios (`risco-escrita-db` e `risco-leitura-db`, os mesmos hosts do compose).

O ConfigMap e o Secret guardam as variáveis dos dois bancos com prefixo (`POSTGRES_ESCRITA_*` e `POSTGRES_LEITURA_*`). O Deployment do serviço lê tudo com `envFrom`. Cada StatefulSet usa `env` com `configMapKeyRef` e `secretKeyRef` para transformar as do seu banco nas variáveis padrão da imagem (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`). Assim cada banco tem usuário e senha próprios, e o Secret continua sendo um só, gerado pelo Kustomize.

## Banco com extensão (Análise)

A Análise usa `pgvector/pgvector:pg17`. A extensão é criada por um script em `/docker-entrypoint-initdb.d`, que vem do ConfigMap `analise-db-init` gerado no `kustomization.yaml` da pasta. Ele só roda quando o volume é criado.

## Demonstração de escalonamento

```bash
bash k8s/demo-escalonamento.sh        # 3 réplicas, 30 requisições
bash k8s/demo-escalonamento.sh 4 60   # 4 réplicas, 60 requisições
```

O script escala o Deployment da Análise, mostra os pods (o banco continua com 1 réplica), dispara requisições de dentro do cluster pelo Service e conta quantas cada pod atendeu, pelo cabeçalho `X-Atendido-Por`. No fim, mostra os logs de acesso com `--prefix`, filtrando só as chamadas da demonstração.

As requisições saem de um pod temporário porque o `kubectl port-forward svc/...` escolhe um único pod e manda tudo para ele, o que esconderia a divisão da carga.
