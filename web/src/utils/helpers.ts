export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// Formato curto dd/mm/aaaa para os campos "Criado em"/"Atualizado em" do painel de
// recurso (ResourceOverviewTab) — `formatDate` acima é o formato longo, usado em outro
// lugar; mantido intacto. Retorna null para vazio/data inválida (cobre o repositório em
// memória, que devolve createdAt/updatedAt como ''). Formata em UTC, não no fuso local:
// os timestamps chegam como ISO UTC (`createdAt`/`updatedAt`) e a data de calendário não
// deve variar conforme o fuso de quem está vendo a tela — sem isso, um timestamp de
// meia-noite UTC "vaza" para o dia anterior em fusos negativos.
export const formatDateBR = (iso: string | undefined | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
