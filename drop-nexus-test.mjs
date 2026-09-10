import { config as loadEnv } from 'dotenv';

loadEnv();

const oracledb = (await import('oracledb')).default;
const prefix = process.env.ORACLE_TEST_OBJECT_PREFIX ?? 'NEXUS_TEST_';
if (!/_(TEST|TST)_$/i.test(prefix)) {
  throw new Error(`Refusing non-test prefix: ${prefix}`);
}

const connection = await oracledb.getConnection({
  connectString: process.env.ORACLE_CONNECTION_STRING,
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
});

const result = await connection.execute(
  'SELECT table_name FROM user_tables WHERE table_name LIKE :1',
  [prefix.toUpperCase() + '%'],
);
for (const [table] of result.rows ?? []) {
  await connection.execute(`DROP TABLE "${table}" CASCADE CONSTRAINTS PURGE`);
}
await connection.commit();
await connection.close();
console.log(`Dropped ${result.rows?.length ?? 0} ${prefix} tables.`);
