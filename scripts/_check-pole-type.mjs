import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
loadEnv({ quiet: true });
async function main() {
  const db = await openLoaderDb();
  const t = await db.query(`SELECT code, name, category_code, status FROM tmf_resource_type WHERE code = $1`, ['Pole']);
  console.log('resource_type Pole:', JSON.stringify(t.rows));
  const s = await db.query(`SELECT id, name, category, resource_type FROM tmf_resource_specification WHERE resource_type = $1`, ['Pole']);
  console.log('resource_specification Pole:', JSON.stringify(s.rows, null, 2));
  await db.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
