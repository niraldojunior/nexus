import oracledb from 'oracledb';
import { config as loadEnv } from 'dotenv';
import { resolveDatabaseConfig } from './dist/src/shared/config/env.js';

loadEnv();
process.env.DATABASE_PROVIDER = 'oracle';
const database = resolveDatabaseConfig(process.env, 'development');
if (database.provider !== 'oracle') throw new Error('Oracle is not configured');
const connection = await oracledb.getConnection({
  connectString: database.connectString,
  user: database.user,
  password: database.password,
});
try {
  const tableName = `${database.objectPrefix}tmf_geographic_address`.toUpperCase();
  const result = await connection.execute(
    `SELECT column_name AS "columnName"
       FROM user_tab_columns
      WHERE table_name = :tableName
      ORDER BY column_id`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const columns = (result.rows ?? []).map((row) => row.columnName);
  console.log(
    JSON.stringify({
      tableExists: columns.length > 0,
      searchColumns: columns.filter((column) => String(column).endsWith('_SEARCH')),
    }),
  );
} finally {
  await connection.close();
}
