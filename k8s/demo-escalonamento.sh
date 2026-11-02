#!/usr/bin/env bash
# Demonstração de escalonamento horizontal, para o vídeo.
#
# Uso: bash k8s/demo-escalonamento.sh [replicas] [requisicoes]
#
# Escala o Deployment da Análise, dispara requisições de dentro do cluster
# pelo Service e mostra qual pod atendeu cada uma.
#
# As chamadas saem de um pod temporário, e não de um port-forward, porque o
# `kubectl port-forward svc/...` escolhe um único pod e manda tudo para ele.
# Só passando pelo Service a carga é dividida entre as réplicas.
set -euo pipefail

NS=pluvia
SERVICO=analise
PORTA=8000
REPLICAS=${1:-3}
REQUISICOES=${2:-30}
SELETOR="app.kubernetes.io/name=${SERVICO}"

titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

titulo "Antes: réplicas do ${SERVICO}"
kubectl -n "$NS" get deploy "$SERVICO"

titulo "Escalando para ${REPLICAS} réplicas"
kubectl -n "$NS" scale "deploy/${SERVICO}" --replicas="$REPLICAS"
kubectl -n "$NS" rollout status "deploy/${SERVICO}" --timeout=180s

titulo "Pods do ${SERVICO} (o banco continua com 1 réplica)"
kubectl -n "$NS" get pods -l "$SELETOR" -o wide
kubectl -n "$NS" get statefulset "${SERVICO}-db"

titulo "Disparando ${REQUISICOES} requisições pelo Service ${SERVICO}:${PORTA}"
# Cada curl abre uma conexão nova, e o kube-proxy escolhe um pod por conexão.
# O cabeçalho X-Atendido-Por traz o hostname, que é o nome do pod.
kubectl -n "$NS" run carga-demo --rm -i --quiet --restart=Never \
  --image=curlimages/curl:8.11.1 --command -- sh -c "
    for i in \$(seq ${REQUISICOES}); do
      curl -s -o /dev/null -D - 'http://${SERVICO}:${PORTA}/health?origem=demo' \
        | tr -d '\r' | sed -n 's/^x-atendido-por: //Ip'
    done" | sort | uniq -c | awk '{ printf "  %-40s %s requisições\n", $2, $1 }'

titulo "Logs de acesso de cada pod (só as chamadas da demonstração)"
# --prefix mostra o pod de origem de cada linha. O filtro tira as chamadas
# da readiness, que também batem em /health.
kubectl -n "$NS" logs -l "$SELETOR" --prefix --since=2m --tail=-1 \
  | grep 'origem=demo' || true

cat <<EOF

Para voltar a 1 réplica:
  kubectl -n ${NS} scale deploy/${SERVICO} --replicas=1
EOF
