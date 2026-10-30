#!/bin/sh
# Starts RabbitMQ and creates users from environment variables, so no credential lives in the image.
# RABBITMQ_SENSORES: space separated "sensorId:senha" pairs. Each sensor may only publish to its own MQTT topic.
set -eu

: "${RABBITMQ_ADMIN_USER:?defina RABBITMQ_ADMIN_USER}"
: "${RABBITMQ_ADMIN_PASSWORD:?defina RABBITMQ_ADMIN_PASSWORD}"
: "${RABBITMQ_SERVICOS_USER:?defina RABBITMQ_SERVICOS_USER}"
: "${RABBITMQ_SERVICOS_PASSWORD:?defina RABBITMQ_SERVICOS_PASSWORD}"
RABBITMQ_SENSORES="${RABBITMQ_SENSORES:-}"
VHOST=pluvia
RECURSOS='^(pluvia|monitoramento|operacoes|equipes|frota|risco|notificacoes)\..*$'
RECURSOS_E_SENSORES='^((pluvia|monitoramento|operacoes|equipes|frota|risco|notificacoes)\..*|amq\.topic)$'

docker-entrypoint.sh rabbitmq-server &
server_pid=$!
trap 'kill -TERM "$server_pid"; wait "$server_pid"; exit 0' TERM INT

until rabbitmqctl -q ping >/dev/null 2>&1; do
  kill -0 "$server_pid" 2>/dev/null || exit 1
  sleep 1
done
rabbitmqctl -q await_startup

upsert_user() {
  if rabbitmqctl -q list_users --no-table-headers | cut -f1 | grep -qx "$1"; then
    rabbitmqctl -q change_password "$1" "$2"
  else
    rabbitmqctl -q add_user "$1" "$2"
  fi
}

upsert_user "$RABBITMQ_ADMIN_USER" "$RABBITMQ_ADMIN_PASSWORD"
rabbitmqctl -q set_user_tags "$RABBITMQ_ADMIN_USER" administrator
rabbitmqctl -q set_permissions -p "$VHOST" "$RABBITMQ_ADMIN_USER" ".*" ".*" ".*"

upsert_user "$RABBITMQ_SERVICOS_USER" "$RABBITMQ_SERVICOS_PASSWORD"
rabbitmqctl -q set_user_tags "$RABBITMQ_SERVICOS_USER"
rabbitmqctl -q set_permissions -p "$VHOST" "$RABBITMQ_SERVICOS_USER" "$RECURSOS" "$RECURSOS_E_SENSORES" "$RECURSOS_E_SENSORES"

for par in $RABBITMQ_SENSORES; do
  sensor="${par%%:*}"
  senha="${par#*:}"
  upsert_user "$sensor" "$senha"
  rabbitmqctl -q set_user_tags "$sensor"
  rabbitmqctl -q set_permissions -p "$VHOST" "$sensor" "^$" "^amq\.topic$" "^$"
  rabbitmqctl -q set_topic_permissions -p "$VHOST" "$sensor" amq.topic '^pluvia\.sensores\.{username}\.leituras$' '^$'
done

if rabbitmqctl -q list_users --no-table-headers | cut -f1 | grep -qx guest; then
  rabbitmqctl -q delete_user guest
fi

echo "pluvia: usuarios do RabbitMQ configurados"
wait "$server_pid"
