// Gregorian calendar and Latin digits in every language; grouping follows the language.
export function appLocale(lang: string): string {
  return lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB-u-ca-gregory-nu-latn'
}

// Database dates are 'YYYY-MM-DD'. Read and format them in UTC so the day never moves.
function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`)
}

export function formatDate(isoDate: string, lang: string): string {
  return new Intl.DateTimeFormat(appLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(isoDate))
}

export function formatNumber(value: number, lang: string, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(appLocale(lang), { maximumFractionDigits: maxFractionDigits }).format(value)
}

// Today as 'YYYY-MM-DD' in the given time zone (the company's, not the browser's).
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
}

const soonDays = 30

export function expiryState(isoDate: string, today: string): 'expired' | 'soon' | null {
  if (isoDate < today) return 'expired'
  const limit = parseIsoDate(today)
  limit.setUTCDate(limit.getUTCDate() + soonDays)
  return isoDate <= limit.toISOString().slice(0, 10) ? 'soon' : null
}
