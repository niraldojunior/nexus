// Utilidades de CEP (código postal brasileiro), usadas pela consulta ao DNE via ViaCEP no
// painel de Endereço (ver services/viaCepApi.ts e hooks/useViaCepAddress.ts).

// Só os 8 dígitos, sem máscara. Devolve null quando não há um CEP completo.
export function normalizeCep(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

// Máscara canônica dos Correios: `24220-401`. Entrada já sem máscara ou com máscara parcial.
export function formatCep(value: string | null | undefined): string {
  const digits = normalizeCep(value);
  if (!digits) return value?.trim() ?? '';
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// Primeiro CEP encontrado num texto livre (a mesma forma reconhecida em useGeonetAddress).
export function cepFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{5}-?\d{3}\b/);
  return match ? normalizeCep(match[0]) : null;
}
