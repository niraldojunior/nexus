import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
import MarkdownMessage from './MarkdownMessage';

afterEach(() => {
  cleanup();
});

test('MarkdownMessage renders list and strong text from escaped markdown', () => {
  render(<MarkdownMessage content={'\\- item\\n\\*\\*negrito\\*\\*'} />);

  const listItem = screen.getByText('item');
  assert.equal(listItem.tagName, 'LI');

  const strong = screen.getByText('negrito');
  assert.equal(strong.tagName, 'STRONG');
});

test('MarkdownMessage renders links with safe external attributes', () => {
  render(<MarkdownMessage content={'[Nexus](https://example.com)'} />);

  const link = screen.getByRole('link', { name: 'Nexus' });
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
});

test('MarkdownMessage copies fenced code block content', async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>(async (_text: string) => undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(<MarkdownMessage content={'```ts\nconst a = 1;\n```'} />);

  const copyButton = screen.getByRole('button', { name: 'Copiar codigo' });
  fireEvent.click(copyButton);

  await vi.waitFor(() => {
    assert.equal(writeText.mock.calls.length, 1);
  });
  const firstCall = writeText.mock.calls[0];
  assert.ok(firstCall);
  const copiedText = firstCall[0];
  assert.equal(copiedText, 'const a = 1;');
});
