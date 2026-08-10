import { describe, expect, it } from 'vitest';
import { shortSubstatus } from './substatus';

describe('shortSubstatus', () => {
  it('descarta a fase e reduz o motivo conhecido', () => {
    expect(shortSubstatus('OBRA DESCARTADA - ÁREA DE RISCO')).toBe('Área de Risco');
    expect(shortSubstatus('INSTALAÇÃO IMPEDIDA - ÁREA DE RISCO')).toBe('Área de Risco');
    expect(shortSubstatus('OBRA IMPEDIDA - OBSTRUÇÃO NO ACESSO')).toBe('Obstrução no Acesso');
    expect(shortSubstatus('OBRA IMPEDIDA - INFRAESTR. DE TERCEIRO INADEQUADA')).toBe(
      'Infra. de Terceiro',
    );
  });

  it('mapeia valores sem fase (sem " - ")', () => {
    expect(shortSubstatus('AS-BUILT CONCLUÍDO')).toBe('As-Built Concluído');
    expect(shortSubstatus('EQUIPAMENTO VANDALIZADO')).toBe('Vandalizado');
    expect(shortSubstatus('REDE CONSTRUÍDA')).toBe('Rede Construída');
  });

  it('normaliza acento e caixa antes de casar a chave', () => {
    expect(shortSubstatus('obra impedida - area de risco')).toBe('Área de Risco');
  });

  it('cai num Title Case pt-BR para motivo desconhecido, com conectivos em minúscula', () => {
    expect(shortSubstatus('FASE X - MOTIVO NOVO DE CAMPO')).toBe('Motivo Novo de Campo');
    expect(shortSubstatus('')).toBe('');
  });
});
