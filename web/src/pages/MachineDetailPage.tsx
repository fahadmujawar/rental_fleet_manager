import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router-dom'
import { usePermission } from '../auth/usePermission'
import { AppHeader } from '../components/AppHeader'
import { ChangeHistory } from '../components/ChangeHistory'
import { LtrValue } from '../components/LtrValue'
import { CompanyDepartment } from '../components/CompanyDepartment'
import { expiryState, formatDate, formatNumber, todayIn } from '../lib/format'
import { isUuid } from '../lib/uuid'
import { fetchLatestCheckin, fetchMachine } from '../machines/queries'
import { statusName, type LatestCheckin, type MachineDetail } from '../machines/types'

type DetailResult = { key: string } & (
  | { status: 'ready'; machine: MachineDetail; checkin: LatestCheckin | null }
  | { status: 'notFound' }
  | { status: 'error' }
)

type Field = { label: string; value: ReactNode }

export function MachineDetailPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { id } = useParams()
  const location = useLocation()
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${id}|${reloadKey}`
  const [result, setResult] = useState<DetailResult | null>(null)
  const validId = isUuid(id)
  const canEdit = usePermission('machines.manage') === true

  useEffect(() => {
    if (!isUuid(id)) return
    let cancelled = false
    Promise.all([fetchMachine(id), fetchLatestCheckin(id)]).then(
      ([machine, checkin]) => {
        if (cancelled) return
        // No row: the id does not exist, or RLS hides it (another company).
        setResult(machine ? { key: requestKey, status: 'ready', machine, checkin } : { key: requestKey, status: 'notFound' })
      },
      () => {
        if (!cancelled) setResult({ key: requestKey, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, requestKey])

  // Back to the list with the search, filters, sort and page it had.
  const from = (location.state as { from?: unknown } | null)?.from
  const listLink = typeof from === 'string' && from.startsWith('?') ? `/machines${from}` : '/machines'

  const current = !validId ? { status: 'notFound' as const } : result?.key === requestKey ? result : null
  const notSet = <span className="text-gray-400">{t('common.notSet')}</span>

  function body(): ReactNode {
    if (!current) return <p className="text-gray-600">{t('app.loading')}</p>

    if (current.status === 'notFound') {
      return (
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('machines.detail.notFound')}</h1>
          <Link to={listLink} className="mt-4 inline-block text-blue-700 underline">
            {t('machines.detail.backToList')}
          </Link>
        </div>
      )
    }

    if (current.status === 'error') {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{t('machines.detail.error')}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded border border-red-300 bg-white px-3 py-1 text-sm text-red-700"
          >
            {t('common.retry')}
          </button>
        </div>
      )
    }

    const m = current.machine
    const timeZone = m.companies?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const today = todayIn(timeZone)

    const text = (value: string | null): ReactNode => value ?? notSet
    const code = (value: string | null): ReactNode => (value ? <LtrValue value={value} /> : notSet)
    const date = (value: string | null): ReactNode => (value ? formatDate(value, lang) : notSet)

    function expiry(value: string | null): ReactNode {
      if (!value) return notSet
      const state = expiryState(value, today)
      return (
        <>
          {formatDate(value, lang)}
          {state === 'expired' && (
            <span className="ms-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
              {t('machines.detail.expired')}
            </span>
          )}
          {state === 'soon' && (
            <span className="ms-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              {t('machines.detail.expiresSoon')}
            </span>
          )}
        </>
      )
    }

    const capacity =
      m.capacity === null ? notSet : [formatNumber(m.capacity, lang, 2), m.capacity_unit].filter(Boolean).join(' ')

    const gpsInstalled = m.gps_installed === null ? notSet : t(m.gps_installed ? 'common.yes' : 'common.no')

    const sections: { title: string; fields: Field[] }[] = [
      {
        title: t('machines.detail.sections.identification'),
        fields: [
          { label: t('machines.fields.assetNo'), value: code(m.asset_no) },
          { label: t('machines.fields.azNo'), value: code(m.az_no) },
          { label: t('machines.fields.chassisNo'), value: code(m.chassis_no) },
          { label: t('machines.fields.serialNo'), value: code(m.serial_no) },
          { label: t('machines.fields.plateNo'), value: code(m.plate_no) },
          { label: t('machines.fields.istimaraSerialNo'), value: text(m.istimara_serial_no) },
        ],
      },
      {
        title: t('machines.detail.sections.specification'),
        fields: [
          { label: t('machines.fields.mainCategory'), value: text(m.main_category) },
          { label: t('machines.fields.subCategory'), value: text(m.sub_category) },
          { label: t('machines.fields.subCategory2'), value: text(m.sub_category_2) },
          { label: t('machines.fields.type'), value: text(m.asset_type) },
          { label: t('machines.fields.description'), value: text(m.description) },
          { label: t('machines.fields.manufacturer'), value: text(m.manufacturer) },
          { label: t('machines.fields.model'), value: text(m.model) },
          { label: t('machines.fields.capacity'), value: capacity },
          { label: t('machines.fields.mfgYear'), value: m.mfg_year === null ? notSet : String(m.mfg_year) },
        ],
      },
      {
        title: t('machines.detail.sections.assignment'),
        fields: [
          { label: t('machines.fields.status'), value: text(statusName(m.status_values, lang)) },
          {
            label: t('machines.fields.customer'),
            value: <CompanyDepartment customer={m.customers} companyCode={m.companies?.short_code} />,
          },
          { label: t('machines.fields.site'), value: text(m.site) },
          { label: t('machines.fields.location'), value: text(m.locations?.name ?? null) },
          { label: t('machines.fields.projectName'), value: text(m.project_name) },
        ],
      },
      {
        title: t('machines.detail.sections.compliance'),
        fields: [
          { label: t('machines.fields.insuranceExpiry'), value: expiry(m.insurance_expiry) },
          { label: t('machines.fields.mvpiExpiry'), value: expiry(m.mvpi_expiry) },
          { label: t('machines.fields.tuvCertificateNo'), value: text(m.tuv_certificate_no) },
          { label: t('machines.fields.tuvCertificateExpiry'), value: expiry(m.tuv_certificate_expiry) },
          { label: t('machines.fields.operationalCardNo'), value: text(m.operational_card_no) },
          { label: t('machines.fields.operationalCardExpiry'), value: expiry(m.operational_card_expiry) },
          { label: t('machines.fields.isthimaraExpiry'), value: expiry(m.isthimara_expiry) },
        ],
      },
      {
        title: t('machines.detail.sections.other'),
        fields: [
          { label: t('machines.fields.fuelType'), value: text(m.fuel_type) },
          { label: t('machines.fields.fuelChip'), value: text(m.fuel_chip) },
          { label: t('machines.fields.gpsInstalled'), value: gpsInstalled },
          { label: t('machines.fields.gpsImei'), value: text(m.gps_imei) },
          { label: t('machines.fields.gpsDate'), value: date(m.gps_date) },
          { label: t('machines.fields.mobilizationDate'), value: date(m.mobilization_date) },
          { label: t('machines.fields.dateReceived'), value: date(m.date_received) },
          { label: t('machines.fields.ownershipNote'), value: text(m.ownership_note) },
        ],
      },
    ]

    const checkin = current.checkin

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">
            <LtrValue value={m.asset_no} />
          </h1>
          {canEdit && (
            <Link
              to={`/machines/${m.id}/edit`}
              state={location.state}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
            >
              {t('machines.detail.edit')}
            </Link>
          )}
        </div>
        {m.description && <p className="mt-1 text-gray-700">{m.description}</p>}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <Section key={section.title} title={section.title} fields={section.fields} />
          ))}

          <section className="rounded bg-white p-4 shadow">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('machines.detail.sections.latestCheckin')}</h2>
            {checkin ? (
              <FieldList
                fields={[
                  { label: t('machines.fields.status'), value: text(statusName(checkin.status_values, lang)) },
                  { label: t('machines.detail.checkinDate'), value: formatDate(checkin.checkin_date, lang) },
                  { label: t('machines.detail.submittedBy'), value: text(checkin.profiles?.full_name ?? null) },
                ]}
              />
            ) : (
              <p className="text-gray-600">{t('machines.detail.noCheckins')}</p>
            )}
          </section>

          <ChangeHistory machineId={m.id} timeZone={timeZone} />
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-12 text-start">
        <Link to={listLink} className="text-sm text-blue-700 underline">
          {t('common.back')}
        </Link>
        <div className="mt-2">{body()}</div>
      </main>
    </div>
  )
}

function Section({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <section className="rounded bg-white p-4 shadow">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{title}</h2>
      <FieldList fields={fields} />
    </section>
  )
}

function FieldList({ fields }: { fields: Field[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      {fields.map((field) => (
        <div key={field.label} className="contents">
          <dt className="text-gray-500">{field.label}</dt>
          <dd className="mb-1 text-gray-900 sm:mb-0">{field.value}</dd>
        </div>
      ))}
    </dl>
  )
}
