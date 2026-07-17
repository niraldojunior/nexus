import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Composer from './Composer';

afterEach(() => {
  cleanup();
});

test('Composer submits the current value', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  render(
    <Composer
      value="Consulta TMF"
      onChange={onChange}
      onSubmit={onSubmit}
      loading={false}
      placeholder="Pergunte algo"
      size="compact"
      modelLabel="Nexus"
      qualityLabel="TMF-first"
    />,
  );

  fireEvent.click(screen.getByLabelText('Enviar'));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect((screen.getByPlaceholderText('Pergunte algo') as HTMLTextAreaElement).value).toBe('Consulta TMF');
});

test('Composer submits on Enter instead of inserting a new line', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  render(
    <Composer
      value="Consulta TMF"
      onChange={onChange}
      onSubmit={onSubmit}
      loading={false}
      placeholder="Pergunte algo"
      size="compact"
      modelLabel="Nexus"
      qualityLabel="TMF-first"
    />,
  );

  const textarea = screen.getByPlaceholderText('Pergunte algo') as HTMLTextAreaElement;
  const eventResult = fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

  expect(eventResult).toBe(false);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
  expect(textarea.value).toBe('Consulta TMF');
});

test('Composer submits on Shift+Enter instead of inserting a new line', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  render(
    <Composer
      value="Consulta TMF"
      onChange={onChange}
      onSubmit={onSubmit}
      loading={false}
      placeholder="Pergunte algo"
      size="compact"
      modelLabel="Nexus"
      qualityLabel="TMF-first"
    />,
  );

  const textarea = screen.getByPlaceholderText('Pergunte algo') as HTMLTextAreaElement;
  const eventResult = fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });

  expect(eventResult).toBe(false);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
  expect(textarea.value).toBe('Consulta TMF');
});

test('Composer disables submit while loading', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  render(
    <Composer
      value="Consulta TMF"
      onChange={onChange}
      onSubmit={onSubmit}
      loading={true}
      placeholder="Pergunte algo"
      size="hero"
      modelLabel="Nexus"
      qualityLabel="TMF-first"
    />,
  );

  const submitButton = screen.getByRole('button', { name: 'Enviar' });
  expect((submitButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submitButton);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('Composer auto-expands the textarea height as content grows', () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const scrollHeightSpy = vi
    .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
    .mockReturnValue(164);

  render(
    <Composer
      value={'Linha 1\nLinha 2\nLinha 3'}
      onChange={onChange}
      onSubmit={onSubmit}
      loading={false}
      placeholder="Pergunte algo"
      size="compact"
      modelLabel="Nexus"
      qualityLabel="TMF-first"
    />,
  );

  const textarea = screen.getByPlaceholderText('Pergunte algo') as HTMLTextAreaElement;
  expect(textarea.style.height).toBe('164px');

  scrollHeightSpy.mockRestore();
});
