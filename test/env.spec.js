import assert from 'node:assert/strict';
import { loadConfig } from '../src/shared/config/env.js';
const config = loadConfig({});
assert.equal(config.appName, 'v-tal-nexus');
assert.equal(config.port, 4001);
assert.equal(config.authEnabled, true);
//# sourceMappingURL=env.spec.js.map