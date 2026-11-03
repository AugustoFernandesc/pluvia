FROM kong:3.9.3

COPY --chown=kong:kong plugins/pluvia-subject-rate-limit /usr/local/share/lua/5.1/kong/plugins/pluvia-subject-rate-limit

ENV KONG_PLUGINS=bundled,pluvia-subject-rate-limit
