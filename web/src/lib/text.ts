// Spaces and control characters become one space and outer spaces go, as in the import script.
// Empty text becomes null.
export function cleanText(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
  return text === '' ? null : text
}
