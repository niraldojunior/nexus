import { createApp } from './shared/http/app.js';
import { loadConfig } from './shared/config/env.js';
import { createLogger } from './shared/logging/logger.js';

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const app = createApp({ config, logger });

app.start().catch((error: unknown) => {
  logger.error({ error }, 'application startup failed');
  process.exitCode = 1;
});
