import { PostgresStudioRepository } from './postgres-repository.js';

/** Oracle adapter boundary. SQL dialect execution is delegated to OracleDatabase. */
export class OracleStudioRepository extends PostgresStudioRepository {}
