import type {ReactNode} from 'react'

export type Column<Row> = {
  key: string
  label: string
  render: (row: Row) => ReactNode
  /** Value used to sort on this column; without it the header is plain text. */
  sort?: (row: Row) => string | number
}
