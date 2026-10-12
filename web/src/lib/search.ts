import { cleanText } from './text'

export const searchMaxLength = 100

const searchColumns = ['asset_no', 'az_no', 'plate_no', 'chassis_no', 'serial_no', 'description']

// Cleaned like the stored register values. An empty result means "no search".
export function cleanSearch(raw: string): string {
  return (cleanText(raw) ?? '').slice(0, searchMaxLength)
}

// A PostgREST or() filter: case insensitive "contains" on every search column.
export function buildSearchFilter(raw: string): string | null {
  const text = cleanSearch(raw)
  if (!text) return null

  // 1. LIKE: \ % _ are special, so match them literally. PostgREST turns * into %,
  //    so a typed * becomes _ (any one character), which still matches the *.
  const like = text.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_')
  // 2. PostgREST: a value in double quotes may hold commas and parentheses; \ and " are escaped.
  const quoted = `"${`%${like}%`.replace(/[\\"]/g, '\\$&')}"`
  return searchColumns.map((column) => `${column}.ilike.${quoted}`).join(',')
}
