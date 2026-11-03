#!/usr/bin/env bash
# Sobe o Pluvia inteiro no Kubernetes local (testado no cluster do Docker Desktop).
#
# Uso, na raiz do repositório: bash scripts/subir-k8s.sh
#
# Cria os .env e secret.env que faltarem, com senhas aleatórias, builda as
# imagens, instala o Traefik, sobe o Keycloak, gera a chave pública do realm
# para o Kong e aplica a Kustomization raiz. Arquivos que já existem não são
# alterados, então dá para rodar de novo.
#
# Em clusters que não enxergam as imagens do Docker local, como o Kind,
# carregue as imagens com `kind load docker-image` depois do build.
set -euo pipefail
cd "$(dirname "$0")/.."

NS=pluvia
PORTA_KEYCLOAK=18081
ISSUER=http://pluvia.local/auth/realms/pluvia

passo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

if python3 -c '' 2>/dev/null; then PY=python3; else PY=python; fi
for cmd in docker kubectl helm "$PY"; do
  command -v "$cmd" >/dev/null || { echo "Falta instalar: $cmd" >&2; exit 1; }
done
kubectl get nodes >/dev/null || { echo "O kubectl não alcança nenhum cluster." >&2; exit 1; }

passo "Arquivos de ambiente"
for f in services/*/.env.example infra/*/.env.example; do
  [ -f "${f%.example}" ] || cp "$f" "${f%.example}"
done
"$PY" - <<'EOF'
import pathlib, secrets

for exemplo in sorted(pathlib.Path("k8s").glob("*/secret.env.example")):
    destino = exemplo.with_name("secret.env")
    if destino.exists():
        continue
    valores = {}
    for linha in exemplo.read_text(encoding="utf-8").splitlines():
        nome, separador, valor = linha.partition("=")
        if not separador:
            continue
        if "troque" in valor or "replace-with" in valor:
            prefixo = valor.rpartition(":")[0]
            valor = f"{prefixo}:{secrets.token_urlsafe(24)}" if prefixo else secrets.token_urlsafe(24)
        valores[nome] = valor
    # O Keycloak e o banco dele precisam da mesma senha.
    if "KC_DB_PASSWORD" in valores:
        valores["POSTGRES_PASSWORD"] = valores["KC_DB_PASSWORD"]
    with destino.open("w", encoding="utf-8", newline="\n") as arquivo:
        arquivo.writelines(f"{k}={v}\n" for k, v in valores.items())
    print(f"criado {destino}")
EOF

passo "Build das imagens"
docker compose build

passo "Traefik (controlador de Ingress)"
helm repo add traefik https://traefik.github.io/charts --force-update >/dev/null
helm upgrade --install traefik traefik/traefik --namespace traefik --create-namespace --version 42.1.3 \
  --set ingressClass.enabled=true --set ingressClass.name=traefik --wait --timeout 180s >/dev/null
kubectl get ingressclass traefik

passo "Keycloak"
kubectl apply -f k8s/namespace.yaml
kubectl -n "$NS" create secret generic keycloak-secret --from-env-file=k8s/keycloak/secret.env \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -k k8s/keycloak
kubectl -n "$NS" rollout status statefulset/keycloak-db --timeout=300s
kubectl -n "$NS" rollout status deployment/keycloak --timeout=360s

passo "Chave pública do realm e configuração do Kong"
TMP_DIR="$(mktemp -d)"
kubectl -n "$NS" port-forward svc/keycloak "$PORTA_KEYCLOAK":8080 >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT
sleep 5
KEYCLOAK_ISSUER="$ISSUER" \
KEYCLOAK_JWKS_URL="http://127.0.0.1:$PORTA_KEYCLOAK/realms/pluvia/protocol/openid-connect/certs" \
KEYCLOAK_DISCOVERY_URL="http://127.0.0.1:$PORTA_KEYCLOAK/realms/pluvia/.well-known/openid-configuration" \
"$PY" infra/kong/bootstrap-kong.py --template gateway/kong.yml.template --renderer gateway/render-kong.py \
  --output "$TMP_DIR/kong.yml" --key-output "$TMP_DIR/realm-public-key.pem"
kubectl -n "$NS" create secret generic keycloak-jwt-public-key \
  --from-file=realm-public-key.pem="$TMP_DIR/realm-public-key.pem" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" create configmap kong-source \
  --from-file=kong.yml.template=gateway/kong.yml.template \
  --from-file=render-kong.py=gateway/render-kong.py \
  --from-file=bootstrap-kong.py=infra/kong/bootstrap-kong.py --dry-run=client -o yaml | kubectl apply -f -

passo "Sistema completo"
kubectl apply -k k8s
for recurso in $(kubectl -n "$NS" get deploy,statefulset -o name); do
  kubectl -n "$NS" rollout status "$recurso" --timeout=300s
done
kubectl -n "$NS" get pods

cat <<EOF

Pronto. O Traefik atende em http://localhost com o host pluvia.local:
  curl -H 'Host: pluvia.local' http://localhost/mobile/v1/publico/_system/status   # 200
  curl -H 'Host: pluvia.local' http://localhost/web/v1/_system/authorization-check # 401 sem token

Para abrir no navegador, adicione "127.0.0.1 pluvia.local" ao arquivo hosts.
EOF
