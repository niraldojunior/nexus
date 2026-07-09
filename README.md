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
5. Start the web app with `npm run start` or `npm run web:dev`.

## Vercel deploy

This repository is configured for automatic deployment on Vercel:

- pushes to `main` create Production Deployments;
- pull requests and other branches create Preview Deployments;
- the frontend is built from `web/` and served from `web/dist`;
- API routes are exposed through Vercel Functions under `/v1`, `/tmf-api`, and `/health`.

Required environment variables in Vercel:

- `NODE_ENV=production`
- `APP_NAME=v-tal-nexus`
- `AUTH_ENABLED=true`
- `AUTH_TOKEN=<strong-secret>`
- `DATABASE_URL=sqlite:///tmp/nexus.db`
- `OPENAI_API_KEY=<optional>`
- `OPENAI_MODEL=<optional>`
- `API_ENDPOINT=<optional>`
- `VITE_GOOGLE_MAPS_API_KEY=<optional>`

The SQLite database is ephemeral on Vercel. It is suitable for previews and demos, not durable production data.

### Development with SQLite

Use the local SQLite bootstrap for development:

```bash
npm run dev:sqlite
```

This command:

- creates `data/` if needed;
- loads `.env` when present;
- defaults `DATABASE_URL` to `sqlite://./data/nexus.db`;
- builds the app;
- runs the compiled output in watch mode.

## Scripts

- `npm run dev` - run the built output in watch mode.
- `npm run dev:sqlite` - build and run the app in watch mode with local SQLite defaults.
- `npm run start:sqlite` - build and run the backend app once with local SQLite defaults.
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
