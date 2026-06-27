ARG DOCKER_PROXY=docker.io

FROM ${DOCKER_PROXY}/node:24-alpine AS release

ARG NEXUS_NPM_AUTHENTICATION=
ARG NEXUS_NPM_PROXY=

WORKDIR /app

EXPOSE 3000

ENV TZ=America/Sao_Paulo \
    LANG=pt_BR.UTF-8     \
    LC_ALL=pt_BR.UTF-8   \
    LANGUAGE=pt_BR:pt    \
    NODE_ENV=production

RUN npm config set strict-ssl false; \
    ( test -z "$NEXUS_NPM_PROXY" || npm config set registry $NEXUS_NPM_PROXY ); \
    if test -n "$NEXUS_NPM_AUTHENTICATION"; then \
        ((for i in $NEXUS_NPM_AUTHENTICATION; do \
            sleep 4; printf '%s\n' $i; done) | npm login); \
    fi;

RUN apk update && \
    apk add busybox-extras bash curl tzdata ca-certificates openssl && \
    update-ca-certificates && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone;

### Oracle Instant Client ###
# Mandatory when DB_THICK_MODE is true, i.e., when using Oracle Database with thick mode (OCI).
# Database version 11c and below requires using thick mode.
# Ref:
#     https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html
#     https://stackoverflow.com/questions/53263972/oracle-on-alpine-linux

# ENV LD_LIBRARY_PATH "/opt/oracle/instantclient:$LD_LIBRARY_PATH"
# RUN apk add libaio libnsl libc6-compat && \
#     mkdir -p /opt/oracle && cd /opt/oracle && \
#     curl --connect-timeout 5 --retry 10 --retry-delay 0 -SL -o instantclient-basiclite.zip \
#         https://download.oracle.com/otn_software/linux/instantclient/2120000/instantclient-basiclite-linux.x64-21.20.0.0.0dbru.zip && \
#     unzip instantclient-basiclite.zip && rm instantclient-basiclite.zip && \
#     mv instantclient* instantclient && cd instantclient && \
#     ln -s libclntsh.so.12.1 /usr/lib/libclntsh.so && \
#     ln -s libocci.so.12.1 /usr/lib/libocci.so;

### Oracle Instant Client ###

ADD --chown=node:node package*.json .

RUN sed -i 's/\("prepare": "\)husky/\1true/' package.json; npm ci --omit=dev;

ADD --chown=node:node . .

RUN chmod +x /app/entrypoint.sh; \
    chmod a+rw /usr/local/share/ca-certificates /etc/ssl/certs /etc/ssl/certs/ca-certificates.crt; \
    npm run build; \
    bash -O extglob -O dotglob -c 'rm -rf -- !(dist|entrypoint.sh|node_modules)'; \
    >/app/log.txt && chown node:node /app/log.txt && chmod 777 /app/log.txt

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
