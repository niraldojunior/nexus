export type GraphRect = { x: number; y: number; width: number; height: number };

export function routeOrthogonalPath(source: GraphRect, target: GraphRect): string {
  const sourceX = source.x + source.width / 2;
  const targetX = target.x + target.width / 2;
  const sourceBottom = source.y + source.height;
  const targetTop = target.y;
  const targetBottom = target.y + target.height;
  const sourceTop = source.y;

  if (targetTop >= sourceBottom) {
    const middleY = (sourceBottom + targetTop) / 2;
    return `M ${sourceX} ${sourceBottom} L ${sourceX} ${middleY} L ${targetX} ${middleY} L ${targetX} ${targetTop}`;
  }
  if (sourceTop >= targetBottom) {
    const middleY = (sourceTop + targetBottom) / 2;
    return `M ${sourceX} ${sourceTop} L ${sourceX} ${middleY} L ${targetX} ${middleY} L ${targetX} ${targetBottom}`;
  }

  const detourY = Math.max(sourceBottom, targetBottom) + 10;
  return `M ${sourceX} ${sourceBottom} L ${sourceX} ${detourY} L ${targetX} ${detourY} L ${targetX} ${targetBottom}`;
}
