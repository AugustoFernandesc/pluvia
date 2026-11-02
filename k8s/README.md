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
