import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.DATABASE_AUTO_SCHEMA = process.env.DATABASE_AUTO_SCHEMA ?? 'true';

import '../dist/test/geo.integration.spec.js';
import '../dist/test/geo.e2e.spec.js';
import '../dist/test/event-management.spec.js';
import '../dist/test/party-management.spec.js';
import '../dist/test/resource-management.spec.js';
import '../dist/test/service-management.spec.js';
import '../dist/test/order-management.spec.js';
import '../dist/test/tmf-functional-routes.integration.spec.js';

console.log('tests passed');
