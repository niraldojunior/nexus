/**
 * Parsing dos argumentos do seed.
 *
 * Módulo próprio, sem dependência alguma: `index.ts` importa `oracledb` e o runtime do Nexus no topo,
 * e o teste unitário não deve arrastar aquele grafo só para conferir flags.
 */

import { UF_BBOX } from './mapper.js';

export type CliOptions = {
  apply: boolean;
  limit?: number;
  states: string[];
  /** `undefined` = resolver do próprio namespace (`nexus_environment.tenant_id`). */
  tenantId?: string | undefined;
  /** `undefined` = herdar o tenant resolvido. */
  ownerPartyId?: string | undefined;
  buildFeatures: boolean;
};

const DEFAULT_STATES = ['RJ', 'SP'];

/**
 * Lê os argumentos. Dry-run é o default (padrão de todo loader do repo): só `--apply` grava.
 *
 * Nem `tenantId` nem `ownerPartyId` têm default fixo aqui: ambos saem do namespace de destino na
 * fase 0 (`resolveTenant`). Fixar `'default'` gravaria num tenant que nenhuma tela lê — a DEMO
 * provisionada registra `vtal` em `nexus_environment`, e é esse o tenant do token da sessão.
 * Quem precisar divergir passa `--tenant-id` / `--owner-party-id` explicitamente.
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    states: [...DEFAULT_STATES],
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
      case '--limit': {
        const raw = next(i, '--limit');
        i += 1;
        const limit = Number(raw);
        if (!Number.isInteger(limit) || limit <= 0) {
          throw new Error(`--limit exige um inteiro positivo (recebido: ${raw}).`);
        }
        options.limit = limit;
        break;
      }
      case '--states': {
        const raw = next(i, '--states');
        i += 1;
        const states = raw
          .split(',')
          .map((uf) => uf.trim().toUpperCase())
          .filter(Boolean);
        if (states.length === 0) throw new Error('--states exige ao menos uma UF.');
        const unknown = states.filter((uf) => !(uf in UF_BBOX));
        if (unknown.length > 0) {
          throw new Error(
            `UF sem caixa envolvente conhecida: ${unknown.join(', ')} ` +
              `(disponíveis: ${Object.keys(UF_BBOX).join(', ')}).`,
          );
        }
        options.states = [...new Set(states)];
        break;
      }
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

  return options;
}
