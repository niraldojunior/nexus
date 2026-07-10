# V.tal Nexus

Foundation backend for the V.tal Nexus platform. This repository contains only the infrastructure
layer required to start the project: application bootstrap, configuration, logging, global error
handling, environment loading, persistence abstractions, and basic test/lint/format/CI setup.

No business rules are implemented here.

## Local run

1. Install Node.js 22+.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and adjust values.
4. Run `npm run build`.
5. Start the local stack with `npm run dev`.

## Vercel deploy

This repository is configured for automatic deployment on Vercel:

- pushes to `main` create Production Deployments;
- pull requests and other branches create Preview Deployments;
- the frontend is built from `web/` and served from `web/dist`;
- API routes are exposed through Vercel Functions under `/v1`, `/tmf-api`, and `/health`.

Required environment variables in Vercel:

- `APP_NAME=v-tal-nexus`
- `AUTH_ENABLED=true`
- `AUTH_TOKEN=<strong-secret>`
- `DATABASE_URL_PROD=<neon-production-connection-string>` in the Production scope
- `DATABASE_URL_DEV=<neon-development-connection-string>` in the Preview scope
- `OPENAI_API_KEY=<optional>`
- `OPENAI_MODEL=<optional>`
- `API_ENDPOINT=<optional>`
- `VITE_GOOGLE_MAPS_API_KEY=<optional>`

Set `DATABASE_URL` only when you want to override the environment-specific selection explicitly.
For local test isolation, set `DATABASE_URL_TEST` to a Neon/Postgres database when you do not want tests to reuse `DATABASE_URL_DEV`.

### Recommended Neon layout

| Environment | Vercel scope | Variable used | Database |
|---|---|---|---|
| Local dev | local `.env` | `DATABASE_URL_DEV` | Neon dev |
| Preview | Vercel Preview | `DATABASE_URL_DEV` | Neon dev |
| Production | Vercel Production | `DATABASE_URL_PROD` | Neon PRD |

With this layout:

- feature branches and PR previews never touch production data;
- `main` deploys read/write production data;
- local development points to Neon dev, not SQLite.

### Development with Neon

Use a local `.env` with `DATABASE_URL_DEV` pointing to your Neon development database:

```bash
npm run dev:local
```

This command:

- creates `data/` if needed;
- loads `.env` when present;
- sets `DATABASE_URL` from `DATABASE_URL_DEV`;
- builds the app;
- starts the backend once on `http://127.0.0.1:4001`;
- starts the Vite frontend on `http://127.0.0.1:5200`.

To run only the backend against the same Neon dev database, use:

```bash
npm run start:neon
```

### Initial data load into Neon

When the Neon databases are empty, seed them from the current SQLite snapshot:

```bash
$env:TARGET_DATABASE_URL='<neon-connection-string>'
npm run migrate:neon
```

Run it once for the dev database and once for the production database if you want both populated from the same SQLite baseline.

## Scripts

- `npm run dev` - build and run the local stack: backend on Neon dev, then Vite web after backend health is ready.
- `npm run dev:backend` - alias for `npm run dev:neon`.
- `npm run dev:neon` - build and run only the backend in watch mode, using required `DATABASE_URL_DEV`/Neon.
- `npm run start:neon` - build and run the backend once, using required `DATABASE_URL_DEV`/Neon.
- `npm run start` - start the Vite web app.
- `npm run build` - compile TypeScript to `dist/`.
- `npm run lint` - run ESLint.
- `npm run format` - check formatting.
- `npm run test` - run Node test files from `dist/`.
- `npm run typecheck` - run TypeScript type checking.

## Scope

This foundation includes:

- environment configuration;
- structured logging;
- HTTP server bootstrap;
- auth guard middleware driven by a bearer token;
- global error response mapping;
- repository port and in-memory persistence adapter;
- CI workflow for lint, typecheck, build, and tests;
- initial documentation and repo structure.
