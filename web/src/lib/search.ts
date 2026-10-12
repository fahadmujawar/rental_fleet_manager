export const searchMaxLength = 100

const searchColumns = ['asset_no', 'az_no', 'plate_no', 'chassis_no', 'serial_no', 'description']

// Spaces and control characters become one space, as in the stored register values; outer spaces go.
// An empty result means "no search".
export function cleanSearch(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, searchMaxLength)
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
