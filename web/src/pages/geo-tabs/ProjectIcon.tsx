import { useRef } from 'react';
import { FolderKanban } from 'lucide-react';

export type ProjectIconProps = {
  iconDataUrl: string | null;
  size?: number;
  // Quando presente, o quadrado vira botão: clicar nele abre o seletor de arquivo e o
  // arquivo escolhido sobe para o chamador (que reduz e converte, ver projectIconImage.ts).
  onChangeFile?: (file: File) => void;
  label?: string;
};

/**
 * Quadrado do ícone de um Projeto de trabalho (REQ-MOD01-015): a imagem carregada pelo
 * usuário ou um glifo padrão. Sem `onChangeFile`, é só exibição (lista de projetos); com
 * ele, vira o controle de upload do painel de detalhe do projeto.
 */
export function ProjectIcon({ iconDataUrl, size = 40, onChangeFile, label }: ProjectIconProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const content = iconDataUrl ? (
    <img src={iconDataUrl} alt="" className="h-full w-full object-contain" />
  ) : (
    <FolderKanban className="h-1/2 w-1/2 text-app-muted" />
  );

  if (!onChangeFile) {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-app-border bg-app-panel"
        style={{ width: size, height: size }}
      >
        {content}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={label ?? 'Alterar ícone do projeto'}
        aria-label={label ?? 'Alterar ícone do projeto'}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-app-border bg-app-panel transition hover:border-app-accent-border hover:bg-app-accent-soft"
        style={{ width: size, height: size }}
      >
        {content}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onChangeFile(file);
        }}
      />
    </>
  );
}
