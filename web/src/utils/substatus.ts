// Versões reduzidas do sub-status (ds_estado_controle na origem Netwin) para caberem no
// rótulo "Suspensa (motivo)" da lista de CDOs da aba Viabilidade. Os valores da origem são
// longos e em CAIXA ALTA, no formato "<FASE> - <MOTIVO>" (ex.: "OBRA DESCARTADA - ÁREA DE
// RISCO"); aqui descartamos a fase e ficamos com o motivo, encurtado e em Title Case pt-BR.

// Chave normalizada (sem acento, CAIXA ALTA, espaços colapsados) → rótulo curto. Cobre os
// motivos observados no acervo (ver legacy-data/recursos_*.csv); a fase é descartada, como
// nos exemplos da operação ("Suspensa (Área de Risco)").
const SUBSTATUS_SHORT: Record<string, string> = {
  'AREA DE RISCO': 'Área de Risco',
  'ACESSO NEGADO PARA CONSTRUCAO': 'Acesso Negado',
  'ACESSO NEGADO': 'Acesso Negado',
  'OBSTRUCAO NA PRUMADA': 'Obstrução na Prumada',
  'OBSTRUCAO NO ACESSO': 'Obstrução no Acesso',
  'OBSTRUCAO EXTERNA': 'Obstrução Externa',
  'ACESSO OBSTRUIDO OU INVIAVEL': 'Acesso Obstruído',
  'AUTORIZACAO NEGADA P/ CONSTRUCAO': 'Autorização Negada',
  'AUTORIZACAO NEGADA PARA CONSTRUCAO': 'Autorização Negada',
  'INFRAESTR. DE TERCEIRO INADEQUADA': 'Infra. de Terceiro',
  'SEM AUTORIZACAO': 'Sem Autorização',
  'EDIFICACAO EM CONSTRUCAO': 'Edificação em Obra',
  'PRUMADA COM PENDENCIA': 'Prumada Pendente',
  'AGUARDA OBRA CIVIL': 'Aguarda Obra Civil',
  // Valores sem fase (não têm " - ")
  'AS-BUILT CONCLUIDO': 'As-Built Concluído',
  'AS-BUILT ACEITO': 'As-Built Aceito',
  'REDE CONSTRUIDA': 'Rede Construída',
  'EQUIPAMENTO VANDALIZADO': 'Vandalizado',
  'TESTE OPTICO OK': 'Teste Óptico OK',
  'PROJETO CONCLUIDO': 'Projeto Concluído',
  'OBRA NAO INICIADA': 'Obra Não Iniciada',
  'DOCUMENTOS COM FALTA DE INFORMACAO': 'Documentação Incompleta',
};

// Conectivos que ficam em minúscula no meio do Title Case pt-BR (fallback).
const SMALL_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'ou',
  'a',
  'o',
  'para',
  'p/',
  'com',
]);

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Title Case pt-BR para o fallback: primeira palavra sempre capitalizada; conectivos curtos
// ficam em minúscula no meio.
function toTitleCase(value: string): string {
  const words = value.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
  return words
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    )
    .join(' ');
}

/**
 * Versão curta do sub-status para o rótulo "Suspensa (…)". Descarta a fase (o trecho antes
 * de " - ") e mapeia o motivo para um rótulo enxuto; motivo desconhecido cai num Title Case
 * pt-BR do próprio texto, sem inventar mapeamento.
 */
export function shortSubstatus(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Só o hífen cercado de espaços separa fase e motivo ("OBRA IMPEDIDA - ..."); o de
  // "AS-BUILT" não conta.
  const parts = trimmed.split(/\s+-\s+/);
  const reason = parts.length > 1 ? parts[parts.length - 1] : trimmed;
  return SUBSTATUS_SHORT[normalizeKey(reason)] ?? toTitleCase(reason);
}
