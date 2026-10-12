import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { CompanyDepartment } from '../components/CompanyDepartment'
import { LtrValue } from '../components/LtrValue'
import { usePermission } from '../auth/usePermission'
import { Pager } from '../components/Pager'
import { appLocale } from '../lib/format'
import { cleanSearch, searchMaxLength } from '../lib/search'
import { isUuid } from '../lib/uuid'
import { fetchFilterOptions, fetchMachinePage, pageSize } from '../machines/queries'
import {
  statusName,
  type FilterOptions,
  type MachineListParams,
  type MachineListRow,
  type SortDir,
  type SortKey,
} from '../machines/types'

const sortKeys: readonly SortKey[] = ['az_no', 'asset_no', 'plate_no', 'customer', 'status']
const searchDelayMs = 300

// The URL query string is the only source of the list state. Bad or unknown values fall back to the default.
function readParams(search: URLSearchParams): MachineListParams {
  const sort = search.get('sort') as SortKey
  const page = Number(search.get('page'))
  const status = search.get('status')
  const customer = search.get('customer')
  const location = search.get('location')
  return {
    q: cleanSearch(search.get('q') ?? ''),
    status: isUuid(status) ? status : null,
    category: search.get('category') || null,
    customer: isUuid(customer) ? customer : null,
    location: isUuid(location) ? location : null,
    inactive: search.get('inactive') === '1',
    sort: sortKeys.includes(sort) ? sort : 'asset_no',
    dir: search.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  }
}

type ParamChanges = Partial<Record<'q' | 'status' | 'category' | 'customer' | 'location' | 'inactive' | 'sort' | 'dir' | 'page', string | null>>

type ListResult = { key: string } & ({ status: 'ready'; rows: MachineListRow[]; total: number } | { status: 'error' })
type OptionsResult = { key: number } & ({ status: 'ready'; options: FilterOptions } | { status: 'error' })

export function MachineListPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const canEdit = usePermission('machines.manage') === true
  const params = useMemo(() => readParams(searchParams), [searchParams])
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${searchParams.toString()}|${reloadKey}`
  const [result, setResult] = useState<ListResult | null>(null)
  const [optionsResult, setOptionsResult] = useState<OptionsResult | null>(null)

  // null removes a key, so default values never appear in the URL. Any change except paging goes back to page 1.
  const updateParams = useCallback(
    (changes: ParamChanges, { replace = false, keepPage = false } = {}) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [name, value] of Object.entries(changes)) {
            if (value) next.set(name, value)
            else next.delete(name)
          }
          if (!keepPage) next.delete('page')
          return next
        },
        { replace },
      )
    },
    [setSearchParams],
  )

  // Load one page of machines each time the query string changes, or on Retry.
  useEffect(() => {
    const controller = new AbortController()
    fetchMachinePage(params, controller.signal).then(
      ({ rows, total }) => {
        if (controller.signal.aborted) return
        // The page is past the end (for example, after a filter or the data changed): go to the last page.
        if (rows.length === 0 && total > 0 && params.page > 1) {
          const lastPage = Math.ceil(total / pageSize)
          updateParams({ page: lastPage > 1 ? String(lastPage) : null }, { replace: true, keepPage: true })
          return
        }
        setResult({ key: requestKey, status: 'ready', rows, total })
      },
      (error: { code?: string }) => {
        if (controller.signal.aborted) return
        // PostgREST "range not satisfiable": the page is past the end. Start again at page 1.
        if (error?.code === 'PGRST103') {
          updateParams({ page: null }, { replace: true, keepPage: true })
          return
        }
        setResult({ key: requestKey, status: 'error' })
      },
    )
    return () => controller.abort()
  }, [params, requestKey, updateParams])

  // Filter option lists: loaded once, and again on Retry.
  useEffect(() => {
    let cancelled = false
    fetchFilterOptions().then(
      (options) => {
        if (!cancelled) setOptionsResult({ key: reloadKey, status: 'ready', options })
      },
      () => {
        if (!cancelled) setOptionsResult({ key: reloadKey, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Search box: typed text waits 300 ms, then goes to the URL. replace, so Back does not step through each key.
  const [searchText, setSearchText] = useState(params.q)
  const [syncedQ, setSyncedQ] = useState(params.q)
  if (syncedQ !== params.q) {
    // The URL changed from outside (Back button, link): show its search text.
    setSyncedQ(params.q)
    if (cleanSearch(searchText) !== params.q) setSearchText(params.q)
  }
  useEffect(() => {
    const value = cleanSearch(searchText)
    if (value === params.q) return
    const timer = setTimeout(() => updateParams({ q: value || null }, { replace: true }), searchDelayMs)
    return () => clearTimeout(timer)
  }, [searchText, params.q, updateParams])

  const options = optionsResult?.status === 'ready' ? optionsResult.options : null
  const statusOptions = useMemo(() => {
    if (!options) return []
    const collator = new Intl.Collator(appLocale(lang))
    return options.statuses
      .map((s) => ({ id: s.id, name: statusName(s, lang) ?? '', isActive: s.is_active }))
      .sort((a, b) => collator.compare(a.name, b.name))
  }, [options, lang])

  function changeStatus(value: string) {
    const picked = statusOptions.find((s) => s.id === value)
    // An inactive status only has inactive machines, so show them in the same step.
    updateParams({ status: value || null, ...(picked && !picked.isActive ? { inactive: '1' } : {}) })
  }

  function setSort(key: SortKey, dir: SortDir) {
    updateParams({ sort: key === 'asset_no' ? null : key, dir: dir === 'desc' ? 'desc' : null })
  }

  // Column header: a new column sorts ascending; the same column again reverses the direction.
  function toggleSort(key: SortKey) {
    setSort(key, params.sort === key && params.dir === 'asc' ? 'desc' : 'asc')
  }

  function goToPage(page: number) {
    updateParams({ page: page > 1 ? String(page) : null }, { keepPage: true })
  }

  function openMachine(id: string) {
    navigate(`/machines/${id}`, { state: { from: location.search } })
  }

  const current = result?.key === requestKey ? result : null
  const loadFailed = current?.status === 'error' || optionsResult?.status === 'error'
  const notSet = <span className="text-gray-400">{t('common.notSet')}</span>

  function text(value: string | null): ReactNode {
    return value ?? notSet
  }

  function code(value: string | null): ReactNode {
    return value ? <LtrValue value={value} /> : notSet
  }

  // The fields Operations asked for, in their order. TCS No is the link to the detail page;
  // codes do not wrap.
  type Column = { label: string; sort?: SortKey; link?: boolean; code?: boolean; cell: (row: MachineListRow) => ReactNode }
  const columns: Column[] = [
    { label: t('machines.fields.azNo'), sort: 'az_no', code: true, cell: (row) => code(row.az_no) },
    {
      label: t('machines.fields.assetNo'),
      sort: 'asset_no',
      link: true,
      code: true,
      cell: (row) => <LtrValue value={row.asset_no} />,
    },
    { label: t('machines.fields.subCategory2'), cell: (row) => text(row.sub_category_2) },
    { label: t('machines.fields.type'), cell: (row) => text(row.asset_type) },
    { label: t('machines.fields.description'), cell: (row) => text(row.description) },
    {
      label: t('machines.fields.customer'),
      sort: 'customer',
      cell: (row) => <CompanyDepartment customer={row.customers} companyCode={row.companies?.short_code} />,
    },
    { label: t('machines.fields.ownershipNote'), cell: (row) => text(row.ownership_note) },
    { label: t('machines.fields.location'), cell: (row) => text(row.locations?.name ?? null) },
    { label: t('machines.fields.site'), cell: (row) => text(row.site) },
    { label: t('machines.fields.chassisNo'), code: true, cell: (row) => code(row.chassis_no) },
    { label: t('machines.fields.plateNo'), sort: 'plate_no', code: true, cell: (row) => code(row.plate_no) },
    { label: t('machines.fields.status'), sort: 'status', cell: (row) => text(statusName(row.status_values, lang)) },
  ]

  const selectClass = 'w-full rounded border border-gray-300 bg-white px-2 py-2 text-start disabled:opacity-60'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pb-12 text-start">
        <Link to="/" className="text-sm text-blue-700 underline">
          {t('common.home')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{t('machines.list.title')}</h1>
          {canEdit && (
            <Link
              to="/machines/new"
              state={{ from: location.search }}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
            >
              {t('machines.list.add')}
            </Link>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-sm text-gray-700">{t('machines.list.search')}</span>
            <input
              type="search"
              dir="auto"
              maxLength={searchMaxLength}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('machines.list.searchHint')}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-start"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">{t('machines.fields.status')}</span>
            <select
              value={params.status ?? ''}
              disabled={!options}
              onChange={(e) => changeStatus(e.target.value)}
              className={selectClass}
            >
              <option value="">{t('machines.list.all')}</option>
              {statusOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">{t('machines.fields.mainCategory')}</span>
            <select
              value={params.category ?? ''}
              disabled={!options}
              onChange={(e) => updateParams({ category: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t('machines.list.all')}</option>
              {options?.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">{t('machines.fields.customer')}</span>
            <select
              value={params.customer ?? ''}
              disabled={!options}
              onChange={(e) => updateParams({ customer: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t('machines.list.all')}</option>
              {options?.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-gray-700">{t('machines.fields.location')}</span>
            <select
              value={params.location ?? ''}
              disabled={!options}
              onChange={(e) => updateParams({ location: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t('machines.list.all')}</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 self-end py-2">
            <input
              type="checkbox"
              checked={params.inactive}
              onChange={(e) => updateParams({ inactive: e.target.checked ? '1' : null })}
              className="h-4 w-4"
            />
            <span className="text-gray-700">{t('machines.list.showInactive')}</span>
          </label>
        </div>

        <div className="mt-6">
          {loadFailed && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-red-200 bg-red-50 p-4">
              <p className="text-red-700">{t('machines.list.error')}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded border border-red-300 bg-white px-3 py-1 text-sm text-red-700"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {!current && !loadFailed && <p className="text-gray-600">{t('app.loading')}</p>}

          {current?.status === 'ready' && current.total === 0 && (
            <p className="text-gray-600">{t('machines.list.empty')}</p>
          )}

          {current?.status === 'ready' && current.total > 0 && (
            <>
              <Pager
                page={params.page}
                shown={current.rows.length}
                total={current.total}
                pageSize={pageSize}
                onPage={goToPage}
              />

              {/* Wide screens: table. If it is wider than the screen, it scrolls sideways in its own box. */}
              <div className="mt-3 hidden overflow-x-auto bg-white shadow md:block">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column.label}
                          scope="col"
                          className="px-2 py-2 text-start align-bottom font-medium"
                          aria-sort={
                            column.sort && params.sort === column.sort
                              ? params.dir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                        >
                          {column.sort ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(column.sort!)}
                              className="inline-flex items-center gap-1 text-start font-medium underline decoration-dotted"
                              title={t('machines.list.sortBy', { column: column.label })}
                            >
                              {column.label}
                              <span aria-hidden="true">
                                {params.sort === column.sort ? (params.dir === 'asc' ? '▲' : '▼') : ''}
                              </span>
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {current.rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openMachine(row.id)}
                        className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                      >
                        {columns.map((column) => (
                          <td
                            key={column.label}
                            className={`px-2 py-2 align-top ${column.code ? 'whitespace-nowrap' : ''}`}
                          >
                            {column.link ? (
                              <Link
                                to={`/machines/${row.id}`}
                                state={{ from: location.search }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-700 underline"
                              >
                                {column.cell(row)}
                              </Link>
                            ) : (
                              column.cell(row)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Narrow screens: one card per machine, same fields */}
              <div className="mt-3 md:hidden">
                <label className="mb-3 block">
                  <span className="mb-1 block text-sm text-gray-700">{t('machines.list.sort')}</span>
                  <select
                    value={`${params.sort}:${params.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split(':')
                      setSort(key as SortKey, dir as SortDir)
                    }}
                    className={selectClass}
                  >
                    {sortKeys.flatMap((key) =>
                      (['asc', 'desc'] as const).map((dir) => (
                        <option key={`${key}:${dir}`} value={`${key}:${dir}`}>
                          {t(`machines.list.sortOption.${dir}`, { column: columns.find((c) => c.sort === key)!.label })}
                        </option>
                      )),
                    )}
                  </select>
                </label>

                <ul className="space-y-3">
                  {current.rows.map((row) => (
                    <li key={row.id}>
                      <Link
                        to={`/machines/${row.id}`}
                        state={{ from: location.search }}
                        className="block rounded bg-white p-4 text-sm shadow hover:bg-gray-50"
                      >
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                          {columns.map((column) => (
                            <div key={column.label} className="contents">
                              <dt className="text-gray-500">{column.label}</dt>
                              <dd className="text-gray-900">{column.cell(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <Pager
                page={params.page}
                shown={current.rows.length}
                total={current.total}
                pageSize={pageSize}
                onPage={goToPage}
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
