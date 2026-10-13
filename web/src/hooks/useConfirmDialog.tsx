import { useCallback, useRef, useState, type ReactNode } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Versão assíncrona de `window.confirm`: `const ok = await confirm({...})`.
 * Renderize `dialog` no JSX do componente. `open` permite a listeners globais de Escape
 * (ex.: modais de edição) não reabrirem o diálogo quando o usuário o cancela.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const dialog = options ? (
    <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, dialog, open: options !== null };
}
