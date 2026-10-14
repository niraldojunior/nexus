import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataTable, { type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nome', sortable: true, render: (row) => row.name },
];
const rows: Row[] = [{ id: '1', name: 'Alfa' }];

describe('DataTable', () => {
  afterEach(cleanup);

  it('sinaliza loading com aria-busy e oculta as linhas', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Alfa')).not.toBeInTheDocument();
  });

  it('expõe aria-sort e dispara a ordenação', async () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ key: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Nome/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Nome/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'desc' });
  });
});
