const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Ids from the URL are checked first: Postgres rejects a malformed uuid with an error, not an empty result.
export function isUuid(value: string | null | undefined): value is string {
  return !!value && uuidPattern.test(value)
}
