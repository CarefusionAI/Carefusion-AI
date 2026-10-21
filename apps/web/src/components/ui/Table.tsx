import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface TableColumn<Row> {
  key: string
  header: ReactNode
  align?: 'left' | 'right'
  width?: number | string
  mono?: boolean
  render?: (row: Row) => ReactNode
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[]
  rows: Row[]
  /** Property name on each row used as the React key. Falls back to the row index. */
  rowKey?: keyof Row & string
  caption?: string
  empty?: ReactNode
  striped?: boolean
  stickyHeader?: boolean
  density?: 'default' | 'compact'
  maxHeight?: number | string
  isRowHighlighted?: (row: Row) => boolean
  className?: string
}

export function Table<Row extends object>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  striped,
  stickyHeader,
  density,
  maxHeight,
  isRowHighlighted,
  className,
}: TableProps<Row>) {
  return (
    <div
      className={clsx('cf-table-wrap', stickyHeader && 'is-sticky', className)}
      style={maxHeight ? { maxHeight } : undefined}
      tabIndex={maxHeight ? 0 : undefined}
    >
      <table className={clsx('cf-table', striped && 'is-striped', density === 'compact' && 'is-compact')}>
        {caption ? <caption className="cf-sr">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.align === 'right' ? 'is-right' : undefined}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr
                key={rowKey ? String((r as Record<string, unknown>)[rowKey]) : i}
                className={isRowHighlighted?.(r) ? 'is-flagged' : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx(c.align === 'right' && 'is-right', c.mono && 'is-mono')}>
                    {c.render ? c.render(r) : (((r as Record<string, unknown>)[c.key] as ReactNode) ?? null)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="cf-table-empty">
                {empty ?? 'Nothing to show yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
