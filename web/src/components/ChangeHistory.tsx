import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatDateTime, formatNumber } from '../lib/format'
import { machineFields } from '../machines/fields'
import { changesPageSize, fetchMachineChanges } from '../machines/queries'
import type { MachineChange } from '../machines/types'
import { LtrValue } from './LtrValue'
import { Pager } from './Pager'

type HistoryResult = { key: string } & ({ status: 'ready'; rows: MachineChange[]; total: number } | { status: 'error' })

// Change history of one machine: newest first, 20 per page. Values are stored as text by the
// database trigger; status, customer and location are stored as names.
export function ChangeHistory({ machineId, timeZone }: { machineId: string; timeZone: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${machineId}|${page}|${reloadKey}`
  const [result, setResult] = useState<HistoryResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMachineChanges(machineId, page).then(
      ({ rows, total }) => {
        if (!cancelled) setResult({ key: requestKey, status: 'ready', rows, total })
      },
      () => {
        if (!cancelled) setResult({ key: requestKey, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [machineId, page, requestKey])

  const current = result?.key === requestKey ? result : null
  const notSet = <span className="text-gray-400">{t('common.notSet')}</span>

  function fieldLabel(field: string): string {
    const known = machineFields[field]
    return known ? t(`machines.fields.${known.label}`) : field
  }

  function value(field: string, raw: string | null): ReactNode {
    if (raw === null) return notSet
    switch (machineFields[field]?.kind) {
      case 'date':
        return formatDate(raw, lang)
      case 'boolean':
        return t(raw === 'true' ? 'common.yes' : 'common.no')
      case 'number':
        return formatNumber(Number(raw), lang, 2)
      case 'code':
        return <LtrValue value={raw} />
      default:
        return raw
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow lg:col-span-2">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('machines.history.title')}</h2>

      {!current && <p className="text-gray-600">{t('app.loading')}</p>}

      {current?.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-red-700">{t('machines.history.error')}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded border border-red-300 bg-white px-3 py-1 text-sm text-red-700"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {current?.status === 'ready' && current.total === 0 && <p className="text-gray-600">{t('machines.history.empty')}</p>}

      {current?.status === 'ready' && current.total > 0 && (
        <>
          <ul className="divide-y divide-gray-200 text-sm">
            {current.rows.map((change) => (
              <li key={change.id} className="py-2">
                <p className="text-gray-500">
                  {formatDateTime(change.changed_at, lang, timeZone)} ·{' '}
                  {change.profiles?.full_name ?? t('machines.history.import')}
                  {change.action === 'create' && ` · ${t('machines.history.created')}`}
                </p>
                <p className="mt-1 font-medium text-gray-900">{fieldLabel(change.field)}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-gray-500">{t('machines.history.oldValue')}</dt>
                  <dd className="text-gray-900">{value(change.field, change.old_value)}</dd>
                  <dt className="text-gray-500">{t('machines.history.newValue')}</dt>
                  <dd className="text-gray-900">{value(change.field, change.new_value)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <Pager page={page} pageSize={changesPageSize} shown={current.rows.length} total={current.total} onPage={setPage} />
        </>
      )}
    </section>
  )
}
