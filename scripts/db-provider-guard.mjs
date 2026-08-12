// These loaders/maintenance scripts talk to Postgres directly (raw `pg`, `$1` binds, ON CONFLICT,
// Postgres TRUNCATE/FK semantics), so they are Postgres-only by construction. The path onto the
// corporate Oracle is not these scripts — it is `npm run migrate:postgres-to-oracle`, which reads
// the Postgres data these produce and writes the prefixed Oracle objects.
//
// This guard turns "ran a Postgres loader against Oracle" into a loud, immediate failure instead of
// a pile of cryptic `$1`/schema errors.
export const requirePostgresProvider = (scriptName) => {
  if ((process.env.DATABASE_PROVIDER ?? 'postgres') === 'oracle') {
    console.error(
      `${scriptName} é um utilitário Postgres-only. Para carregar Oracle, rode a carga contra o ` +
        `Postgres e depois "npm run migrate:postgres-to-oracle" (prefixa os objetos por ambiente).`,
    );
    process.exit(1);
  }
};
