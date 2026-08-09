# V.tal Nexus — imagem de produção para VPS/Docker.
#
# Multi-stage com dois alvos publicáveis:
#   - `api` : backend Node (dist/ + node_modules de produção + docs/ + scripts/)
#   - `web` : Caddy servindo web/dist + proxy reverso para o `api`
#
# Base bookworm-slim (glibc), NÃO alpine: `better-sqlite3` e `oracledb` são
# dependências de produção e só têm prebuild para glibc; em musl o `npm ci`
# cairia em compilação a partir do fonte.

# ---------------------------------------------------------------- deps (full) --
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Ferramentas de build como seguro: se um prebuild nativo (better-sqlite3 /
# oracledb) não existir para esta plataforma, o npm compila do fonte.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# `npm install` (não `npm ci`): o package-lock.json é gerado no Windows e omite
# deps opcionais específicas de Linux (@emnapi/* via @napi-rs/wasm-runtime), o que
# faz o `npm ci` estrito falhar no runner. Espelha o ci.yml, que já usa `npm install`.
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------- build (app) --
FROM deps AS build
# Variáveis de build do Vite — entram no bundle. Precisam existir como ENV
# durante `web:build` (o Vite lê import.meta.env.VITE_* de process.env).
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_AUTH_TOKEN="change-me"
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
ENV VITE_AUTH_TOKEN=${VITE_AUTH_TOKEN}
COPY . .
RUN npm run build && npm run web:build

# ------------------------------------------------------- prod-deps (runtime) ---
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# `npm install` (não `npm ci`) pelo mesmo motivo do estágio deps: lockfile gerado
# no Windows omite deps opcionais de Linux.
RUN npm install --omit=dev --no-audit --no-fund

# --------------------------------------------------------------- api (target) --
FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/dist         ./dist
COPY package.json ./
# Runtime: local-knowledge-provider.ts e nexus-copilot-context.ts leem docs/
# via resolve(process.cwd(), 'docs/...'). scripts/ roda as cargas no perfil tools.
COPY docs    ./docs
COPY scripts ./scripts
EXPOSE 4001
CMD ["node", "dist/src/main.js"]

# --------------------------------------------------------------- web (target) --
FROM caddy:2-alpine AS web
COPY --from=build /app/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
