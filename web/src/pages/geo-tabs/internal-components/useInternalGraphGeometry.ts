import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
import type { GraphRect } from './internalResourceLayout';

export function useInternalGraphGeometry(hostRef: RefObject<HTMLElement | null>, zoom: number) {
  const [rects, setRects] = useState<Map<string, GraphRect>>(new Map());
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const hostRect = host.getBoundingClientRect();
    const next = new Map<string, GraphRect>();
    let maxRight = 0;
    let maxBottom = 0;
    for (const element of host.querySelectorAll<HTMLElement>('[data-graph-node-id]')) {
      const id = element.dataset.graphNodeId;
      if (!id) continue;
      const rect = element.getBoundingClientRect();
      const x = (rect.left - hostRect.left) / zoom;
      const y = (rect.top - hostRect.top) / zoom;
      const width = rect.width / zoom;
      const height = rect.height / zoom;
      next.set(id, { x, y, width, height });
      maxRight = Math.max(maxRight, x + width);
      maxBottom = Math.max(maxBottom, y + height);
    }

    setRects(next);
    // Deriva o tamanho do conteúdo a partir da extensão real dos nós (bounding
    // box), nunca de host.scrollWidth/scrollHeight: o próprio host contém o SVG
    // de conexões, cujas dimensões são fixadas a partir deste mesmo contentSize
    // em InternalComponentsView — medir scrollWidth criaria um laço que só
    // cresce e nunca encolhe ao trocar para a visão simplificada.
    setContentSize({ width: maxRight, height: maxBottom });
  }, [hostRef, zoom]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [hostRef, measure]);

  return { rects, contentSize, measure };
}
