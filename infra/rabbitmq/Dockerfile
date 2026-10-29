FROM rabbitmq:4.1-management-alpine

COPY --chown=rabbitmq:rabbitmq enabled_plugins rabbitmq.conf definitions.json /etc/rabbitmq/
COPY --chmod=755 entrypoint.sh /usr/local/bin/pluvia-entrypoint.sh

EXPOSE 5672 1883 15672

ENTRYPOINT ["/usr/local/bin/pluvia-entrypoint.sh"]
