import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
loadEnv({ quiet: true });
async function main() {
  const db = await openLoaderDb();
  const res = await db.query(`SELECT id, name, category, resource_type FROM tmf_resource_specification WHERE category = $1`, ['Infrastructure.CivilWorks']);
  console.log(JSON.stringify(res.rows, null, 2));
  await db.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
