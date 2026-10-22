/**
 * Parsing dos argumentos da importação de cabos submarinos.
 *
 * Módulo próprio, sem dependência alguma: `index.ts` importa `oracledb` e o runtime do Nexus no topo,
 * e o teste unitário não deve arrastar aquele grafo só para conferir flags.
 */

export type CliOptions = {
  /** Prefixo Oracle da instância de destino (ex.: `NX_DEV21_`), já normalizado. */
  environment: string;
  /** Pasta com os `.kml`/`.kmz`. */
  sourceDir: string;
  apply: boolean;
  /** `undefined` = resolver do próprio namespace (`environment.tenant_id`). */
  tenantId?: string | undefined;
  /** `undefined` = herdar o tenant resolvido. */
  ownerPartyId?: string | undefined;
  buildFeatures: boolean;
};

export const DEFAULT_SOURCE_DIR = 'legacy-data/cabos_submarinos';

/** Mesma regra de `resolveLoaderEnvironment` (scripts/loader-db.mjs). */
const ORACLE_PREFIX = /^[A-Za-z][A-Za-z0-9_]*_$/;

/**
 * Lê os argumentos. Dry-run é o default (padrão de todo loader do repo): só `--apply` grava.
 *
 * A instância vem de `--environment` e, na falta dele, de `ORACLE_OBJECT_PREFIX`. A flag vence a
 * variável herdada da sessão para que uma carga explícita nunca grave no ambiente errado.
 */
export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): CliOptions {
  let environment: string | undefined;
  const options: Omit<CliOptions, 'environment'> = {
    sourceDir: DEFAULT_SOURCE_DIR,
    apply: false,
    buildFeatures: false,
  };

  const next = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} exige um valor.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--apply':
        options.apply = true;
        break;
      case '--build-features':
        options.buildFeatures = true;
        break;
      case '--environment':
        environment = next(i, '--environment');
        i += 1;
        break;
      case '--source-dir':
        options.sourceDir = next(i, '--source-dir');
        i += 1;
        break;
      case '--tenant-id':
        options.tenantId = next(i, '--tenant-id');
        i += 1;
        break;
      case '--owner-party-id':
        options.ownerPartyId = next(i, '--owner-party-id');
        i += 1;
        break;
      default:
        if (arg?.startsWith('--')) throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  const raw = environment ?? env.ORACLE_OBJECT_PREFIX;
  if (!raw) {
    throw new Error(
      'Informe --environment <prefixo> (ex.: NX_DEV21_) ou defina ORACLE_OBJECT_PREFIX.',
    );
  }
  const prefix = raw.trim().toUpperCase();
  if (!ORACLE_PREFIX.test(prefix)) {
    throw new Error(
      `Ambiente Oracle inválido "${raw}". Use letras, números ou _, começando por letra e terminando em _ (ex.: NX_DEV21_).`,
    );
  }

  return { environment: prefix, ...options };
}
