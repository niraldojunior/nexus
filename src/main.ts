import { createApp } from './shared/http/app.js';
import { loadConfig } from './shared/config/env.js';
import { createLogger } from './shared/logging/logger.js';
import { config as loadEnv } from 'dotenv';

// Load local .env when the server starts directly via `node dist/src/main.js`
// so research/chat routes can see OPENAI_API_KEY outside the SQLite dev helper.
loadEnv();

// Match the SQLite dev helper: many corporate environments intercept TLS with
// self-signed certificates, which breaks OpenAI fetches unless verification is relaxed.
if (process.env.NODE_ENV !== 'production' && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const app = createApp({ config, logger });

app.start().catch((error: unknown) => {
  logger.error({ error }, 'application startup failed');
  process.exitCode = 1;
});
