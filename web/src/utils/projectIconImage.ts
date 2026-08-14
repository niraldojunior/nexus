// Reduz o ícone de projeto (REQ-MOD01-015) carregado pelo usuário a um quadrado pequeno antes
// de subir ao servidor — sem isto, uma foto de câmera (vários MB) viraria uma linha gigante na
// tabela geo_project (ver GEO_PROJECT_ICON_MAX_CHARS em src/shared/http/app.ts, que recusa o
// que passar disso no servidor). Ajuste "contain" (nunca corta a imagem, sobra vira fundo
// transparente) em 128×128, WebP (o navegador cai para PNG sozinho quando o encoder não
// existe — canvas.toDataURL ignora o tipo pedido nesse caso).

const MAX_SOURCE_BYTES = 5 * 1024 * 1024; // 5 MB
const ICON_SIZE = 128;

export class ProjectIconError extends Error {}

// Separado de `readProjectIcon` para ser testável em jsdom: `createImageBitmap`/`canvas` não
// rodam no ambiente de teste (ver AGENTS.md §3), mas a validação de tipo/tamanho é pura.
export function validateProjectIconFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ProjectIconError('O arquivo precisa ser uma imagem.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ProjectIconError('A imagem precisa ter até 5 MB.');
  }
}

export async function readProjectIcon(file: File): Promise<string> {
  validateProjectIconFile(file);

  const bitmap = await createImageBitmap(file);
  try {
    return drawSquareDataUrl(bitmap, ICON_SIZE);
  } finally {
    bitmap.close();
  }
}

function drawSquareDataUrl(source: ImageBitmap, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ProjectIconError('Não foi possível processar a imagem.');

  // Escala pelo menor fator (contain): a imagem inteira cabe no quadrado, sem cortar as
  // bordas — o excedente vira fundo transparente, não um recorte perdido.
  const scale = Math.min(size / source.width, size / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;
  ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, drawWidth, drawHeight);

  return canvas.toDataURL('image/webp', 0.85);
}
