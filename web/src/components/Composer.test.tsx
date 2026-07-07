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
  expect(submitButton).toBeDisabled();
  fireEvent.click(submitButton);
  expect(onSubmit).not.toHaveBeenCalled();
});
