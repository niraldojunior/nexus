import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageCharacteristicInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  ariaLabel?: string;
  /** Alinhamento da miniatura em modo `readOnly`. `'center'` (padrão) mantém o layout do modal de
   *  Especificação (coluna estreita); o painel do recurso no Geo usa `'left'` para acompanhar as
   *  demais linhas de característica, que começam na borda esquerda. */
  align?: 'center' | 'left';
};

export function ImageCharacteristicInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  name,
  ariaLabel,
  align = 'center',
}: ImageCharacteristicInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgLoadError, setImgLoadError] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // Lightbox de imagem em tamanho real (clique sobre a miniatura) — sem isso o usuário não
  // consegue ler detalhes de uma foto de instalação anexada como característica de instância.
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFileError('O arquivo selecionado deve ser uma imagem.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setFileError('A imagem deve ter no máximo 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImgLoadError(false);
        onChange(reader.result);
      }
    };
    reader.onerror = () => {
      setFileError('Erro ao carregar a imagem.');
    };
    reader.readAsDataURL(file);
  };

  const isDataUri = value.startsWith('data:image/');

  const lightbox =
    lightboxOpen && value && !imgLoadError
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
            role="dialog"
            aria-modal="true"
            aria-label={name ? `Imagem: ${name}` : 'Imagem em tamanho real'}
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Fechar"
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-app-panel text-app-text shadow-lg transition hover:bg-app-accent-soft"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={value}
              alt={name || 'Imagem'}
              className="max-h-[90vh] max-w-[90vw] rounded-[12px] object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )
      : null;

  if (readOnly) {
    const isLeftAligned = align === 'left';
    if (!value) {
      return (
        <div
          className={`flex items-center w-full ${isLeftAligned ? 'justify-start' : 'justify-center'}`}
        >
          <span className="text-[0.84rem] text-app-muted">—</span>
        </div>
      );
    }
    return (
      <div
        className={`flex flex-col gap-1.5 w-full ${
          isLeftAligned ? 'items-start' : 'items-center justify-center'
        }`}
      >
        <button
          type="button"
          disabled={imgLoadError}
          onClick={() => setLightboxOpen(true)}
          title={imgLoadError ? undefined : 'Ver em tamanho real'}
          className={`relative h-28 w-28 shrink-0 overflow-hidden rounded-[12px] border border-app-border bg-[var(--surface-muted)] flex items-center justify-center p-1 shadow-2xs transition ${
            imgLoadError ? 'cursor-default' : 'cursor-zoom-in hover:border-app-accent'
          }`}
        >
          {!imgLoadError ? (
            <img
              src={value}
              alt={name || 'Imagem'}
              className="h-full w-full object-contain"
              onError={() => setImgLoadError(true)}
            />
          ) : (
            <ImageIcon className="h-10 w-10 text-app-muted opacity-60" />
          )}
        </button>
        {!isDataUri && (
          <span
            className={`text-[0.78rem] font-mono text-app-muted truncate max-w-[200px] ${
              isLeftAligned ? 'text-left' : 'text-center'
            }`}
            title={value}
          >
            {value}
          </span>
        )}
        {lightbox}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={handleFileChange}
        className="hidden"
        data-testid="image-file-input"
      />

      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <button
            type="button"
            disabled={imgLoadError}
            onClick={() => setLightboxOpen(true)}
            title={imgLoadError ? undefined : 'Ver em tamanho real'}
            className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-app-border bg-[var(--surface-muted)] flex items-center justify-center p-0.5 transition ${
              imgLoadError ? 'cursor-default' : 'cursor-zoom-in hover:border-app-accent'
            }`}
          >
            {!imgLoadError ? (
              <img
                src={value}
                alt={name || 'Imagem'}
                className="h-full w-full object-contain"
                onError={() => setImgLoadError(true)}
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-app-muted opacity-60" />
            )}
          </button>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.8rem] font-medium text-app-text hover:bg-app-accent-soft hover:border-app-accent transition disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5 text-app-muted" />
          <span>{value ? 'Substituir imagem' : 'Upload imagem'}</span>
        </button>

        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setImgLoadError(false);
              setFileError(null);
              onChange('');
            }}
            title="Remover imagem"
            aria-label="Remover imagem"
            className="inline-flex items-center justify-center h-8 w-8 rounded-[10px] border border-transparent text-status-red hover:bg-status-red-soft transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {fileError && <p className="text-[0.78rem] text-status-red">{fileError}</p>}

      {!isDataUri && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setImgLoadError(false);
            setFileError(null);
            onChange(e.target.value);
          }}
          placeholder="https://exemplo.com/imagem.png ou media/imagem.png"
          aria-label={
            ariaLabel ||
            (name ? `URL ou referência da imagem para ${name}` : 'URL ou referência da imagem')
          }
          className="geo-input disabled:bg-[var(--surface-muted)] disabled:text-app-text"
        />
      )}
      {lightbox}
    </div>
  );
}
