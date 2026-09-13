import { config as loadEnv } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig } from '../shared/config/env.js';
import {
  OracleEnvironmentManager,
  type OracleEnvironment,
} from '../shared/persistence/oracle-environment.js';
import { normalizeOracleObjectPrefix } from '../shared/persistence/oracle-object-names.js';

loadEnv();

const config = loadConfig({ ...process.env, DATABASE_AUTO_SCHEMA: 'false' });
const manager = new OracleEnvironmentManager(config.database);
const prompt = createInterface({ input, output });

const ask = async (question: string): Promise<string> => (await prompt.question(question)).trim();

const selectEnvironment = async (environments: OracleEnvironment[]): Promise<OracleEnvironment | undefined> => {
  if (environments.length === 0) {
    output.write('\nNenhum ambiente Nexus foi encontrado no schema Oracle atual.\n');
    return undefined;
  }
  output.write('\nAmbientes detectados:\n');
  for (const [index, environment] of environments.entries()) {
    output.write(
      `  ${index + 1}. ${environment.prefix} — ${environment.status === 'complete' ? 'completo' : 'parcial'} (${environment.tableCount} tabela(s))\n`,
    );
  }
  const answer = await ask('\nSelecione o ambiente a excluir (0 para cancelar): ');
  const index = Number(answer);
  if (!Number.isInteger(index) || index < 1 || index > environments.length) {
    output.write('Operação cancelada.\n');
    return undefined;
  }
  return environments[index - 1];
};

const createEnvironment = async (): Promise<void> => {
  const rawPrefix = await ask('\nPrefixo Oracle do novo ambiente (ex.: NX_DEV1_): ');
  let prefix: string;
  try {
    prefix = normalizeOracleObjectPrefix(rawPrefix);
  } catch (error) {
    output.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }
  const tenantName = await ask('Nome do Tenant inicial: ');
  if (!tenantName) {
    output.write('O nome do Tenant é obrigatório. Operação cancelada.\n');
    return;
  }

  output.write(`\nCriando ${prefix} para o Tenant "${tenantName}"...\n`);
  const environment = await manager.create({ prefix, tenantName });
  output.write('\nAmbiente criado com sucesso.\n');
  output.write(`Prefixo: ${environment.prefix}\n`);
  output.write(`Tenant: ${environment.tenantName}\n`);
  output.write(`Tenant ID: ${environment.tenantId}\n`);
  output.write(`Administrador: ${environment.adminEmail}\n`);
  output.write(`Senha temporária: ${environment.temporaryPassword}\n`);
  output.write('Use a senha temporária somente no primeiro login e altere-a imediatamente.\n');
  output.write('O script não altera seu .env: configure ORACLE_OBJECT_PREFIX com o prefixo acima.\n');
};

const destroyEnvironment = async (): Promise<void> => {
  const selected = await selectEnvironment(await manager.discover());
  if (!selected) return;

  output.write(
    `\nATENÇÃO: ${selected.prefix} (${selected.tableCount} tabela(s) Nexus) será removido permanentemente.\n`,
  );
  const confirmation = await ask(`Digite exatamente ${selected.prefix} para confirmar: `);
  if (confirmation !== selected.prefix) {
    output.write('Confirmação divergente. Nenhum objeto foi removido.\n');
    return;
  }

  const result = await manager.destroy(selected.prefix);
  if (result.remainingTables.length > 0) {
    throw new Error(
      `A remoção de ${result.prefix} ficou parcial; restaram: ${result.remainingTables.join(', ')}.`,
    );
  }
  output.write(`\nAmbiente ${result.prefix} removido com sucesso (${result.droppedTables.length} tabela(s)).\n`);
};

try {
  output.write('Gerenciador de ambientes Oracle Nexus\n\n');
  output.write('  1. Criar ambiente\n');
  output.write('  2. Excluir ambiente\n');
  output.write('  0. Cancelar\n');
  const operation = await ask('\nEscolha uma opção: ');
  if (operation === '1') await createEnvironment();
  else if (operation === '2') await destroyEnvironment();
  else output.write('Operação cancelada.\n');
} catch (error) {
  output.write(`\nFalha ao gerenciar o ambiente: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
