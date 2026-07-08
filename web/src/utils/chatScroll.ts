export function scrollChatAnchorIntoView(
  container: HTMLElement | null,
  anchor: HTMLElement | null,
  viewportRatio = 0.24,
) {
  if (!container || !anchor) return;

  const containerRect = container.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const desiredTopOffset = container.clientHeight * viewportRatio;
  const nextTop = container.scrollTop + (anchorRect.top - containerRect.top) - desiredTopOffset;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

  container.scrollTo({
    top: Math.max(0, Math.min(nextTop, maxScrollTop)),
    behavior: 'smooth',
  });
}

export function scrollChatToBottom(container: HTMLElement | null, behavior: ScrollBehavior = 'smooth') {
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });
}
