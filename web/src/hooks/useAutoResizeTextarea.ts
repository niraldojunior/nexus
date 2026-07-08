import { useLayoutEffect, useRef } from 'react';

export function useAutoResizeTextarea(value: string, maxHeight?: number) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';

    const nextHeight = maxHeight ? Math.min(textarea.scrollHeight, maxHeight) : textarea.scrollHeight;
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = maxHeight && textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxHeight]);

  return textareaRef;
}
