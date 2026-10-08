import { describe, expect, it } from 'vitest';
import {
  resolveLifecycleStatus,
  resolveNetwinPlantState,
  resolveNetwinSiteStatus,
} from '../src/scripts/netwin-migration-kit.js';

describe('resolveNetwinSiteStatus', () => {
  it('mapeia CAT_STATE do LOCATION para o status do Site', () => {
    expect(resolveNetwinSiteStatus(1000001)).toBe('Planned');
    expect(resolveNetwinSiteStatus(1000002)).toBe('Planned');
    expect(resolveNetwinSiteStatus(1000003)).toBe('Active');
    expect(resolveNetwinSiteStatus(1000004)).toBe('Retired');
  });

  it('ausente ou desconhecido continua Active', () => {
    expect(resolveNetwinSiteStatus(null)).toBe('Active');
    expect(resolveNetwinSiteStatus(undefined)).toBe('Active');
    expect(resolveNetwinSiteStatus(42)).toBe('Active');
  });
});

// Issue #323: a planta interna chegava toda active/enabled/unlocked/idle porque o migrador
// ignorava ESTADO_CICLO_VIDA, ESTADO_OPERACIONAL e ESTADO_PROVISAO/ID_SERVICO.
describe('resolveNetwinPlantState', () => {
  it('porta instalada, em serviço e livre fica active/enabled/idle', () => {
    expect(resolveNetwinPlantState({ cicloVida: 1, operacional: 'S', provisao: 'L' })).toEqual({
      status: 'active',
      administrative_state: 'unlocked',
      operational_state: 'enabled',
      usage_state: 'idle',
    });
  });

  it('ocupado, cativo ou com serviço associado = busy; reservado = active', () => {
    expect(resolveNetwinPlantState({ operacional: 'S', provisao: 'O' }).usage_state).toBe('busy');
    expect(resolveNetwinPlantState({ operacional: 'S', provisao: 'C' }).usage_state).toBe('busy');
    expect(resolveNetwinPlantState({ operacional: 'S', hasService: true }).usage_state).toBe(
      'busy',
    );
    expect(resolveNetwinPlantState({ operacional: 'S', provisao: 'R' }).usage_state).toBe('active');
  });

  it('Fora de Serviço, Com Defeito e Avariado suspendem e desabilitam', () => {
    for (const operacional of ['A', 'V', 'X', 'D', 'P', 'T']) {
      expect(resolveNetwinPlantState({ cicloVida: 1, operacional })).toMatchObject({
        status: 'suspended',
        operational_state: 'disabled',
        administrative_state: 'unlocked',
      });
    }
  });

  it('Bloqueado (O/H) trava administrativamente quando ocioso', () => {
    expect(
      resolveNetwinPlantState({ cicloVida: 1, operacional: 'O', provisao: 'L' }),
    ).toMatchObject({
      status: 'suspended',
      administrative_state: 'locked',
      operational_state: 'disabled',
    });
    expect(resolveNetwinPlantState({ operacional: 'H' }).administrative_state).toBe('locked');
  });

  it('RN-002: bloqueado com uso real não vai a locked', () => {
    expect(resolveNetwinPlantState({ operacional: 'O', provisao: 'O' })).toMatchObject({
      administrative_state: 'unlocked',
      usage_state: 'busy',
    });
  });

  it('Em Manutenção suspende sem travar', () => {
    expect(resolveNetwinPlantState({ operacional: 'M' })).toMatchObject({
      status: 'suspended',
      administrative_state: 'unlocked',
      operational_state: 'disabled',
    });
  });

  it('Projetado / Em Projeto ficam inactive com status_code do catálogo', () => {
    expect(resolveNetwinPlantState({ cicloVida: 2, operacional: 'S' })).toMatchObject({
      status: 'inactive',
      statusCode: 'designed',
    });
    expect(resolveNetwinPlantState({ cicloVida: 4 })).toMatchObject({
      status: 'inactive',
      statusCode: 'planned',
    });
  });

  it('Removido / Extraviado terminam e travam (C6)', () => {
    for (const cicloVida of [3, 5]) {
      expect(resolveNetwinPlantState({ cicloVida, provisao: 'O' })).toEqual({
        status: 'terminated',
        administrative_state: 'locked',
        operational_state: 'disabled',
        usage_state: 'idle',
      });
    }
  });

  it('sem ESTADO_OPERACIONAL o operacional é unknown', () => {
    expect(resolveNetwinPlantState({ cicloVida: 1 }).operational_state).toBe('unknown');
  });
});

// Regressão do gap que suspendia a CDOE-7539 (INFRANODE 472107) e toda a cadeia até a
// estação: o ramo "ativo" exigia `^SERVI` (ancorado) e não normalizava acento, então
// "Em Serviço" e "Disponível" — os valores reais mais comuns na origem — caíam no
// default 'suspended'.
describe('resolveLifecycleStatus', () => {
  it('reconhece os designations ativos reais da origem, com e sem acento', () => {
    for (const designation of [
      'Em Serviço',
      'EM SERVICO',
      'Disponível',
      'Ativo',
      'Operacional',
      'Instalado',
    ]) {
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
    expect(resolveLifecycleStatus(undefined)).toEqual({
      status: 'active',
      substatus: '',
      assumed: true,
    });
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
