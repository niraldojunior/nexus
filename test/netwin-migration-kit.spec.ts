import { describe, expect, it } from 'vitest';
import { resolveLifecycleStatus } from '../src/scripts/netwin-migration-kit.js';

// Regressão do gap que suspendia a CDOE-7539 (INFRANODE 472107) e toda a cadeia até a
// estação: o ramo "ativo" exigia `^SERVI` (ancorado) e não normalizava acento, então
// "Em Serviço" e "Disponível" — os valores reais mais comuns na origem — caíam no
// default 'suspended'.
describe('resolveLifecycleStatus', () => {
  it('reconhece os designations ativos reais da origem, com e sem acento', () => {
    for (const designation of ['Em Serviço', 'EM SERVICO', 'Disponível', 'Ativo', 'Operacional', 'Instalado']) {
      expect(resolveLifecycleStatus(designation)).toEqual({
        status: 'active',
        substatus: '',
        assumed: false,
      });
    }
  });

  it('reconhece designations suspensos e guarda o motivo cru no substatus', () => {
    expect(resolveLifecycleStatus('Fora de Serviço')).toEqual({
      status: 'suspended',
      substatus: 'Fora de Serviço',
      assumed: false,
    });
    expect(resolveLifecycleStatus('Bloqueado')).toEqual({
      status: 'suspended',
      substatus: 'Bloqueado',
      assumed: false,
    });
  });

  it('reconhece designations terminados', () => {
    expect(resolveLifecycleStatus('Terminado')).toMatchObject({ status: 'terminated' });
    expect(resolveLifecycleStatus('Abortado')).toMatchObject({ status: 'terminated' });
    expect(resolveLifecycleStatus('Retirado')).toMatchObject({ status: 'terminated' });
  });

  it('assume ativo (não suspenso) quando a designation está ausente, e marca assumed', () => {
    expect(resolveLifecycleStatus(undefined)).toEqual({ status: 'active', substatus: '', assumed: true });
    expect(resolveLifecycleStatus('')).toEqual({ status: 'active', substatus: '', assumed: true });
  });

  it('designation desconhecida (não vazia, fora do vocabulário) cai em suspenso auditável', () => {
    expect(resolveLifecycleStatus('Planejado')).toEqual({
      status: 'suspended',
      substatus: 'Planejado',
      assumed: false,
    });
  });
});
