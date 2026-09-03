import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectListView } from './ProjectListView';
import type { GeoProject } from '../../services/geoProjectApi';

afterEach(() => {
  cleanup();
});

const project = (overrides: Partial<GeoProject> = {}): GeoProject => ({
  id: 'prj-1',
  tenantId: 'default',
  name: 'Expansão Icaraí',
  description: null,
  iconDataUrl: null,
  status: 'planned',
  createdBy: null,
  siteCount: 3,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

describe('ProjectListView', () => {
  it('mostra o botão de criar mesmo sem projetos, com o estado vazio', () => {
    render(
      <ProjectListView
        projects={[]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /novo projeto/i })).toBeInTheDocument();
    expect(screen.getByText(/nenhum projeto criado ainda/i)).toBeInTheDocument();
  });

  it('chama onCreate ao clicar em + Novo Projeto', () => {
    const onCreate = vi.fn();
    render(
      <ProjectListView
        projects={[]}
        loading={false}
        canEdit
        onCreate={onCreate}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /novo projeto/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('lista nome e volume de locais de cada projeto, e abre ao clicar', () => {
    const onOpen = vi.fn();
    render(
      <ProjectListView
        projects={[project(), project({ id: 'prj-2', name: 'Levantamento Centro', siteCount: 1 })]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Expansão Icaraí')).toBeInTheDocument();
    expect(screen.getByText('3 locais')).toBeInTheDocument();
    expect(screen.getByText('Levantamento Centro')).toBeInTheDocument();
    expect(screen.getByText('1 local')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Expansão Icaraí'));
    expect(onOpen).toHaveBeenCalledWith('prj-1');
  });

  it('mostra o selo de status de cada projeto', () => {
    render(
      <ProjectListView
        projects={[project({ status: 'active' })]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('excluir pede confirmação (com a contagem de locais) antes de chamar onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: true, retired: 3, skipped: 0, blocked: 0 });
    render(
      <ProjectListView
        projects={[project()]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /excluir projeto expansão icaraí/i }));
    expect(screen.getByText(/3 locais criados neste projeto serão encerrados/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onDelete).toHaveBeenCalledWith('prj-1');
    await screen.findByRole('button', { name: /novo projeto/i });
  });

  it('cancelar a confirmação não chama onDelete', () => {
    const onDelete = vi.fn();
    render(
      <ProjectListView
        projects={[project()]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /excluir projeto expansão icaraí/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/locais criados neste projeto serão encerrados/i),
    ).not.toBeInTheDocument();
  });

  it('local bloqueado mantém o projeto e avisa, em vez de sumir da lista (issue #58)', async () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: false, retired: 2, skipped: 1, blocked: 1 });
    render(
      <ProjectListView
        projects={[project()]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /excluir projeto expansão icaraí/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText(/1 local não pôde ser encerrado/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Expansão Icaraí').length).toBeGreaterThan(0);
  });

  it('erro na exclusão avisa em vez de falhar silenciosamente', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('network'));
    render(
      <ProjectListView
        projects={[project()]}
        loading={false}
        canEdit
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /excluir projeto expansão icaraí/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText(/não foi possível excluir o projeto/i),
    ).toBeInTheDocument();
  });

  it('sem canEdit, oculta "Novo Projeto" e a lixeira de cada projeto', () => {
    render(
      <ProjectListView
        projects={[project()]}
        loading={false}
        canEdit={false}
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /novo projeto/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /excluir projeto expansão icaraí/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Expansão Icaraí')).toBeInTheDocument();
  });
});
