import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  /** Defaults to String(row[key]). Lets a column host a Badge, an inline-edit input, a row action. */
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Falls back to a generic EmptyState if omitted. */
  emptyState?: ReactNode;
}

/**
 * Static-column data table — no built-in sort/filter (the reference filters upstream via
 * tabs/pills, never in-table). Row actions and inline-editable cells go through a
 * column `render` fn, not special-cased props.
 */
export function Table<T>({ columns, rows, rowKey, onRowClick, emptyState }: TableProps<T>) {
  if (rows.length === 0) {
    return <>{emptyState ?? <EmptyState title="Nothing here yet" />}</>;
  }

  const clickable = !!onRowClick;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--av2-text-base)' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? 'left',
                  padding: 'var(--av2-space-2) var(--av2-space-3)',
                  borderBottom: '1px solid var(--av2-border)',
                  fontSize: 'var(--av2-text-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--av2-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={clickable ? () => onRowClick!(row) : undefined}
              style={{
                cursor: clickable ? 'pointer' : 'default',
                transition: 'background var(--av2-duration-fast) var(--av2-ease-standard)',
              }}
              onMouseEnter={
                clickable ? (e) => (e.currentTarget.style.background = 'var(--av2-surface-alt)') : undefined
              }
              onMouseLeave={clickable ? (e) => (e.currentTarget.style.background = '') : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align ?? 'left',
                    padding: 'var(--av2-space-2) var(--av2-space-3)',
                    borderBottom: '1px solid var(--av2-border)',
                    color: 'var(--av2-text)',
                  }}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
