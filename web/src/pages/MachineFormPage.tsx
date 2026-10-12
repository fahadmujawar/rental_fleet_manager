import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { usePermission } from '../auth/usePermission'
import { AppHeader } from '../components/AppHeader'
import { LtrValue } from '../components/LtrValue'
import { isUuid } from '../lib/uuid'
import { fetchFormOptions, fetchMachine, saveMachine, type SaveErrorCode } from '../machines/queries'
import { statusName, type FormOptions, type MachineDetail } from '../machines/types'
import {
  emptyFormValues,
  formValuesFromMachine,
  newOption,
  validateMachineForm,
  type FieldError,
  type FormField,
  type MachineFormValues,
} from '../machines/validation'

// Where Cancel and "back" go: the detail page when editing, else the list (with its query string).
function backTarget(id: string | undefined, state: unknown): string {
  if (id) return `/machines/${id}`
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('?') ? `/machines${from}` : '/machines'
}

// /machines/new and /machines/:id/edit. RLS decides every write; this only hides the form.
export function MachineFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const location = useLocation()
  const canEdit = usePermission('machines.manage')

  let body: ReactNode
  if (canEdit === null) {
    body = <p className="text-gray-600">{t('app.loading')}</p>
  } else if (!canEdit) {
    body = (
      <div>
        <p className="text-gray-900">{t('machines.form.noPermission')}</p>
        <Link to={backTarget(id, location.state)} className="mt-4 inline-block text-blue-700 underline">
          {t('common.back')}
        </Link>
      </div>
    )
  } else if (id !== undefined && !isUuid(id)) {
    body = <NotFound />
  } else {
    body = <MachineFormLoader key={id ?? 'new'} machineId={id ?? null} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-12 text-start">{body}</main>
    </div>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">{t('machines.detail.notFound')}</h1>
      <Link to="/machines" className="mt-4 inline-block text-blue-700 underline">
        {t('machines.detail.backToList')}
      </Link>
    </div>
  )
}

type LoadResult = { key: number } & (
  | { status: 'ready'; options: FormOptions; machine: MachineDetail | null }
  | { status: 'notFound' }
  | { status: 'error' }
)

// Loads the option lists and the machine. Reload (after "changed by someone else") loads both again
// and replaces the typed values.
function MachineFormLoader({ machineId }: { machineId: string | null }) {
  const { t } = useTranslation()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchFormOptions(), machineId ? fetchMachine(machineId) : Promise.resolve(null)]).then(
      ([options, machine]) => {
        if (cancelled) return
        if (machineId && !machine) setResult({ key: reloadKey, status: 'notFound' })
        else setResult({ key: reloadKey, status: 'ready', options, machine })
      },
      () => {
        if (!cancelled) setResult({ key: reloadKey, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [machineId, reloadKey])

  const current = result?.key === reloadKey ? result : null
  if (!current) return <p className="text-gray-600">{t('app.loading')}</p>
  if (current.status === 'notFound') return <NotFound />
  if (current.status === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-red-200 bg-red-50 p-4">
        <p className="text-red-700">{t('machines.form.loadError')}</p>
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
  return (
    <MachineForm
      key={reloadKey}
      options={current.options}
      machine={current.machine}
      onReload={() => setReloadKey((k) => k + 1)}
    />
  )
}

// Server error codes shown under a field; the others are shown next to the Save button.
const fieldErrorCodes: Partial<Record<SaveErrorCode, [FormField, string]>> = {
  duplicate_asset_no: ['asset_no', 'duplicateAssetNo'],
  duplicate_az_no: ['az_no', 'duplicateAzNo'],
  duplicate_chassis_no: ['chassis_no', 'duplicateChassisNo'],
  duplicate_serial_no: ['serial_no', 'duplicateSerialNo'],
  customer_name_required: ['new_customer_name', 'required'],
  sister_company_required: ['new_customer_sister', 'chooseOne'],
  location_name_required: ['new_location_name', 'required'],
}

const inputClass = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-start'

function FieldBox(props: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm text-gray-700">
          {props.label}
          {props.required && <span aria-hidden="true"> *</span>}
        </span>
        {props.children}
      </label>
      {props.error && <p className="mt-1 text-sm text-red-700">{props.error}</p>}
    </div>
  )
}

function MachineForm(props: { options: FormOptions; machine: MachineDetail | null; onReload: () => void }) {
  const { options, machine, onReload } = props
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const navigate = useNavigate()
  const location = useLocation()
  const machineId = machine?.id ?? null
  const initial = useMemo(() => (machine ? formValuesFromMachine(machine) : emptyFormValues), [machine])
  const [values, setValues] = useState<MachineFormValues>(initial)
  const [touched, setTouched] = useState<ReadonlySet<FormField>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Partial<Record<FormField, FieldError>>>({})
  const [saveError, setSaveError] = useState<SaveErrorCode | null>(null)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef(false)

  const validation = useMemo(() => validateMachineForm(values, options, machineId), [values, options, machineId])
  const dirty = (Object.keys(values) as FormField[]).some((field) => values[field] !== initial[field])

  // Ask before leaving with unsaved changes: links and Back in the app, and closing or reloading the tab.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(t('machines.form.leaveConfirm'))) blocker.proceed()
    else blocker.reset()
  }, [blocker, t])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function setValue<F extends FormField>(field: F, value: MachineFormValues[F]) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setServerErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous))
  }

  function touch(field: FormField) {
    setTouched((previous) => (previous.has(field) ? previous : new Set(previous).add(field)))
  }

  function errorFor(field: FormField): FieldError | undefined {
    return serverErrors[field] ?? (submitted || touched.has(field) ? validation.errors[field] : undefined)
  }

  // Leaving the active statuses takes the machine out of the daily checkin: ask first.
  function changeStatus(statusId: string) {
    const next = options.statuses.find((s) => s.id === statusId)
    const saved = options.statuses.find((s) => s.id === initial.status_id)
    if (next && !next.is_active && saved?.is_active && !window.confirm(t('machines.form.inactiveConfirm'))) return
    setValue('status_id', statusId)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (!validation.payload || saving) return

    setSaving(true)
    const result = await saveMachine(validation.payload, machine?.updated_at ?? null)
    setSaving(false)

    if (result.ok) {
      savedRef.current = true
      navigate(`/machines/${result.id}`, { replace: true, state: location.state })
      return
    }
    const fieldError = fieldErrorCodes[result.code]
    if (fieldError) setServerErrors((previous) => ({ ...previous, [fieldError[0]]: { key: fieldError[1] } }))
    else setSaveError(result.code)
  }

  const hasErrors =
    Object.values(serverErrors).some(Boolean) || (submitted && Object.keys(validation.errors).length > 0)

  // ---------- Field helpers (plain functions, so inputs keep focus between renders) ----------

  function errorText(field: FormField): string | undefined {
    const error = errorFor(field)
    return error && t(`machines.form.errors.${error.key}`, error.values)
  }

  function textInput(field: FormField, opts: { ltr?: boolean; required?: boolean; list?: string; inputMode?: 'numeric' | 'decimal'; type?: 'date' } = {}) {
    return (
      <input
        type={opts.type ?? 'text'}
        dir={opts.ltr || opts.type === 'date' ? 'ltr' : undefined}
        list={opts.list}
        inputMode={opts.inputMode}
        required={opts.required}
        aria-invalid={errorFor(field) ? true : undefined}
        value={values[field]}
        onChange={(e) => setValue(field, e.target.value as MachineFormValues[typeof field])}
        onBlur={() => touch(field)}
        className={inputClass}
      />
    )
  }

  function field(name: FormField, labelKey: string, opts: Parameters<typeof textInput>[1] = {}) {
    return (
      <FieldBox key={name} error={errorText(name)} label={t(`machines.fields.${labelKey}`)} required={opts.required}>
        {textInput(name, opts)}
      </FieldBox>
    )
  }

  function suggestField(name: 'main_category' | 'sub_category' | 'sub_category_2' | 'asset_type', labelKey: string, required = false) {
    const listId = `suggest-${name}`
    return (
      <FieldBox key={name} error={errorText(name)} label={t(`machines.fields.${labelKey}`)} required={required}>
        {textInput(name, { list: listId, required })}
        <datalist id={listId}>
          {options.suggestions[name].map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </FieldBox>
    )
  }

  function yesNo(name: 'new_customer_sister' | 'gps_installed', withNotSet: boolean) {
    return (
      <select
        value={values[name]}
        onChange={(e) => setValue(name, e.target.value as 'yes' | 'no' | '')}
        onBlur={() => touch(name)}
        className={inputClass}
      >
        <option value="">{withNotSet ? t('common.notSet') : t('machines.form.choose')}</option>
        <option value="yes">{t('common.yes')}</option>
        <option value="no">{t('common.no')}</option>
      </select>
    )
  }

  const sections: { title: string; fields: ReactNode[] }[] = [
    {
      title: t('machines.detail.sections.identification'),
      fields: [
        field('asset_no', 'assetNo', { ltr: true, required: true }),
        field('az_no', 'azNo', { ltr: true }),
        field('chassis_no', 'chassisNo', { ltr: true }),
        field('serial_no', 'serialNo', { ltr: true }),
        field('plate_no', 'plateNo', { ltr: true }),
        field('istimara_serial_no', 'istimaraSerialNo'),
      ],
    },
    {
      title: t('machines.detail.sections.specification'),
      fields: [
        suggestField('main_category', 'mainCategory', true),
        suggestField('sub_category', 'subCategory'),
        suggestField('sub_category_2', 'subCategory2'),
        suggestField('asset_type', 'type'),
        field('description', 'description', { required: true }),
        field('manufacturer', 'manufacturer'),
        field('model', 'model'),
        field('capacity', 'capacity', { ltr: true, inputMode: 'decimal' }),
        field('capacity_unit', 'capacityUnit'),
        field('mfg_year', 'mfgYear', { ltr: true, inputMode: 'numeric' }),
      ],
    },
    {
      title: t('machines.detail.sections.assignment'),
      fields: [
        <FieldBox key="status_id" error={errorText('status_id')} label={t('machines.fields.status')} required>
          <select
            required
            value={values.status_id}
            onChange={(e) => changeStatus(e.target.value)}
            onBlur={() => touch('status_id')}
            className={inputClass}
          >
            <option value="">{t('machines.form.choose')}</option>
            {options.statuses.map((s) => {
              const name = statusName(s, lang) ?? ''
              return (
                <option key={s.id} value={s.id}>
                  {s.is_active ? name : t('machines.form.inactiveStatus', { name })}
                </option>
              )
            })}
          </select>
        </FieldBox>,
        <div key="customer" className="space-y-3">
          <FieldBox error={errorText('customer')} label={t('machines.fields.customer')}>
            <select value={values.customer} onChange={(e) => setValue('customer', e.target.value)} className={inputClass}>
              <option value="">{t('machines.form.noCustomer', { code: options.companyCode })}</option>
              {options.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.is_sister_company ? t('machines.form.sisterOption', { name: c.name }) : c.name}
                </option>
              ))}
              <option value={newOption}>{t('machines.form.addNew')}</option>
            </select>
          </FieldBox>
          {values.customer === newOption && (
            <>
              <FieldBox error={errorText('new_customer_name')} label={t('machines.form.newCustomerName')} required>
                {textInput('new_customer_name', { required: true })}
              </FieldBox>
              <FieldBox error={errorText('new_customer_sister')} label={t('common.sisterCompany')} required>
                {yesNo('new_customer_sister', false)}
              </FieldBox>
            </>
          )}
        </div>,
        field('site', 'site'),
        <div key="location" className="space-y-3">
          <FieldBox error={errorText('location')} label={t('machines.fields.location')}>
            <select value={values.location} onChange={(e) => setValue('location', e.target.value)} className={inputClass}>
              <option value="">{t('common.notSet')}</option>
              {options.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={newOption}>{t('machines.form.addNew')}</option>
            </select>
          </FieldBox>
          {values.location === newOption && (
            <FieldBox error={errorText('new_location_name')} label={t('machines.form.newLocationName')} required>
              {textInput('new_location_name', { required: true })}
            </FieldBox>
          )}
        </div>,
        field('project_name', 'projectName'),
      ],
    },
    {
      title: t('machines.detail.sections.compliance'),
      fields: [
        field('insurance_expiry', 'insuranceExpiry', { type: 'date' }),
        field('mvpi_expiry', 'mvpiExpiry', { type: 'date' }),
        field('tuv_certificate_no', 'tuvCertificateNo'),
        field('tuv_certificate_expiry', 'tuvCertificateExpiry', { type: 'date' }),
        field('operational_card_no', 'operationalCardNo'),
        field('operational_card_expiry', 'operationalCardExpiry', { type: 'date' }),
        field('isthimara_expiry', 'isthimaraExpiry', { type: 'date' }),
      ],
    },
    {
      title: t('machines.detail.sections.other'),
      fields: [
        field('fuel_type', 'fuelType'),
        field('fuel_chip', 'fuelChip'),
        <FieldBox key="gps_installed" error={errorText('gps_installed')} label={t('machines.fields.gpsInstalled')}>
          {yesNo('gps_installed', true)}
        </FieldBox>,
        field('gps_imei', 'gpsImei', { ltr: true }),
        field('gps_date', 'gpsDate', { type: 'date' }),
        field('mobilization_date', 'mobilizationDate', { type: 'date' }),
        field('date_received', 'dateReceived', { type: 'date' }),
        field('ownership_note', 'ownershipNote'),
      ],
    },
  ]

  return (
    <form onSubmit={save} noValidate>
      <h1 className="text-2xl font-semibold text-gray-900">
        {machine ? (
          <>
            {t('machines.form.editTitle')} <LtrValue value={machine.asset_no} />
          </>
        ) : (
          t('machines.form.newTitle')
        )}
      </h1>
      <p className="mt-1 text-sm text-gray-600">{t('machines.form.requiredNote')}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <fieldset key={section.title} className="space-y-3 rounded bg-white p-4 shadow">
            <legend className="float-start mb-1 w-full text-lg font-semibold text-gray-900">{section.title}</legend>
            {section.fields}
          </fieldset>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {hasErrors && (
          <p role="alert" className="text-red-700">
            {t('machines.form.fixErrors')}
          </p>
        )}
        {saveError === 'machine_changed' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 p-4">
            <p className="text-amber-900">{t('machines.form.changedBySomeoneElse')}</p>
            <button
              type="button"
              onClick={onReload}
              className="rounded border border-amber-400 bg-white px-3 py-1 text-sm text-amber-900"
            >
              {t('machines.form.reload')}
            </button>
          </div>
        )}
        {saveError && saveError !== 'machine_changed' && (
          <p role="alert" className="text-red-700">
            {t(`machines.form.saveErrors.${saveError}`)}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? t('machines.form.saving') : t('machines.form.save')}
          </button>
          <button
            type="button"
            onClick={() => navigate(backTarget(machineId ?? undefined, location.state), { state: location.state })}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700"
          >
            {t('machines.form.cancel')}
          </button>
        </div>
      </div>
    </form>
  )
}
