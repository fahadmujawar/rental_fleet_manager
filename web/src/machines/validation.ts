import { cleanText } from '../lib/text'
import type { FormOptions, MachineDetail } from './types'

// The rules of the import script (scripts/import_register/import_register.py), so the app and the
// import store values the same way. The database CHECK constraints are the last guard.

export const newOption = '__new__'

// Every form value is the text of its input. Selects: '' means none.
export type MachineFormValues = {
  asset_no: string
  az_no: string
  chassis_no: string
  serial_no: string
  plate_no: string
  istimara_serial_no: string
  main_category: string
  sub_category: string
  sub_category_2: string
  asset_type: string
  description: string
  manufacturer: string
  model: string
  capacity: string
  capacity_unit: string
  mfg_year: string
  status_id: string
  customer: string // '' = no customer (TCS), newOption, or a customer id
  new_customer_name: string
  new_customer_sister: '' | 'yes' | 'no'
  location: string // '' = not set, newOption, or a location id
  new_location_name: string
  site: string
  project_name: string
  insurance_expiry: string
  mvpi_expiry: string
  tuv_certificate_no: string
  tuv_certificate_expiry: string
  operational_card_no: string
  operational_card_expiry: string
  isthimara_expiry: string
  fuel_type: string
  fuel_chip: string
  gps_installed: '' | 'yes' | 'no'
  gps_imei: string
  gps_date: string
  mobilization_date: string
  date_received: string
  ownership_note: string
}

export type FormField = keyof MachineFormValues
export type FieldError = { key: string; values?: Record<string, number> }

// Length limits from the CHECK constraints on machines, customers and locations.
const textLimits: Partial<Record<FormField, number>> = {
  az_no: 50,
  plate_no: 100,
  istimara_serial_no: 100,
  main_category: 100,
  sub_category: 100,
  sub_category_2: 100,
  asset_type: 100,
  description: 300,
  manufacturer: 100,
  model: 100,
  capacity_unit: 100,
  site: 200,
  project_name: 200,
  tuv_certificate_no: 100,
  operational_card_no: 100,
  fuel_type: 100,
  fuel_chip: 100,
  gps_imei: 100,
  ownership_note: 200,
  new_customer_name: 200,
  new_location_name: 200,
}

const dateFields = [
  'insurance_expiry',
  'mvpi_expiry',
  'tuv_certificate_expiry',
  'operational_card_expiry',
  'isthimara_expiry',
  'gps_date',
  'mobilization_date',
  'date_received',
] as const

const suggestionFields = ['main_category', 'sub_category', 'sub_category_2', 'asset_type'] as const

const assetNoPattern = /^[A-Z0-9][A-Z0-9-]{0,29}$/
const identifierPattern = /^[A-Z0-9][A-Z0-9/.-]{0,39}$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const minYear = 1950
const maxCapacity = 9999999999.99 // numeric(12,2)

export const emptyFormValues: MachineFormValues = {
  asset_no: '',
  az_no: '',
  chassis_no: '',
  serial_no: '',
  plate_no: '',
  istimara_serial_no: '',
  main_category: '',
  sub_category: '',
  sub_category_2: '',
  asset_type: '',
  description: '',
  manufacturer: '',
  model: '',
  capacity: '',
  capacity_unit: '',
  mfg_year: '',
  status_id: '',
  customer: '',
  new_customer_name: '',
  new_customer_sister: '',
  location: '',
  new_location_name: '',
  site: '',
  project_name: '',
  insurance_expiry: '',
  mvpi_expiry: '',
  tuv_certificate_no: '',
  tuv_certificate_expiry: '',
  operational_card_no: '',
  operational_card_expiry: '',
  isthimara_expiry: '',
  fuel_type: '',
  fuel_chip: '',
  gps_installed: '',
  gps_imei: '',
  gps_date: '',
  mobilization_date: '',
  date_received: '',
  ownership_note: '',
}

export function formValuesFromMachine(m: MachineDetail): MachineFormValues {
  const text = (value: string | number | null) => (value === null ? '' : String(value))
  return {
    ...emptyFormValues,
    asset_no: m.asset_no,
    az_no: text(m.az_no),
    chassis_no: text(m.chassis_no),
    serial_no: text(m.serial_no),
    plate_no: text(m.plate_no),
    istimara_serial_no: text(m.istimara_serial_no),
    main_category: text(m.main_category),
    sub_category: text(m.sub_category),
    sub_category_2: text(m.sub_category_2),
    asset_type: text(m.asset_type),
    description: text(m.description),
    manufacturer: text(m.manufacturer),
    model: text(m.model),
    capacity: text(m.capacity),
    capacity_unit: text(m.capacity_unit),
    mfg_year: text(m.mfg_year),
    status_id: m.status_id,
    customer: text(m.customer_id),
    location: text(m.location_id),
    site: text(m.site),
    project_name: text(m.project_name),
    insurance_expiry: text(m.insurance_expiry),
    mvpi_expiry: text(m.mvpi_expiry),
    tuv_certificate_no: text(m.tuv_certificate_no),
    tuv_certificate_expiry: text(m.tuv_certificate_expiry),
    operational_card_no: text(m.operational_card_no),
    operational_card_expiry: text(m.operational_card_expiry),
    isthimara_expiry: text(m.isthimara_expiry),
    fuel_type: text(m.fuel_type),
    fuel_chip: text(m.fuel_chip),
    gps_installed: m.gps_installed === null ? '' : m.gps_installed ? 'yes' : 'no',
    gps_imei: text(m.gps_imei),
    gps_date: text(m.gps_date),
    mobilization_date: text(m.mobilization_date),
    date_received: text(m.date_received),
    ownership_note: text(m.ownership_note),
  }
}

// Returns an error per field, or the save_machine payload when there is none.
export function validateMachineForm(
  values: MachineFormValues,
  options: FormOptions,
  machineId: string | null,
): { errors: Partial<Record<FormField, FieldError>>; payload: Record<string, unknown> | null } {
  const errors: Partial<Record<FormField, FieldError>> = {}
  const payload: Record<string, unknown> = {}

  function text(field: FormField): string | null {
    const value = cleanText(values[field])
    const limit = textLimits[field]
    if (value !== null && limit !== undefined && value.length > limit) {
      errors[field] = { key: 'tooLong', values: { max: limit } }
    }
    return value
  }

  function required(field: FormField, value: string | null) {
    if (value === null && !errors[field]) errors[field] = { key: 'required' }
  }

  // TCS No: upper case, dots become hyphens.
  const assetNo = cleanText(values.asset_no)?.toUpperCase().replace(/\./g, '-') ?? null
  required('asset_no', assetNo)
  if (assetNo !== null && !assetNoPattern.test(assetNo)) errors.asset_no = { key: 'invalidAssetNo' }
  payload.asset_no = assetNo

  // Chassis and serial: upper case, no spaces.
  for (const field of ['chassis_no', 'serial_no'] as const) {
    const value = cleanText(values[field])?.toUpperCase().replace(/ /g, '') ?? null
    if (value !== null && !identifierPattern.test(value)) errors[field] = { key: 'invalidIdentifier' }
    payload[field] = value
  }

  for (const field of [
    'az_no',
    'plate_no',
    'istimara_serial_no',
    'description',
    'manufacturer',
    'model',
    'capacity_unit',
    'site',
    'project_name',
    'tuv_certificate_no',
    'operational_card_no',
    'fuel_type',
    'fuel_chip',
    'gps_imei',
    'ownership_note',
  ] as const) {
    payload[field] = text(field)
  }
  required('description', payload.description as string | null)

  // Category fields: an existing value that differs only in case keeps its stored spelling.
  for (const field of suggestionFields) {
    const value = text(field)
    const existing = value === null ? undefined : options.suggestions[field].find((s) => s.toLowerCase() === value.toLowerCase())
    payload[field] = existing ?? value
  }
  required('main_category', payload.main_category as string | null)

  const capacityText = cleanText(values.capacity)
  if (capacityText === null) {
    payload.capacity = null
  } else {
    const capacity = Number(capacityText)
    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > maxCapacity) errors.capacity = { key: 'invalidCapacity' }
    payload.capacity = capacity
  }

  const yearText = cleanText(values.mfg_year)
  const maxYear = new Date().getFullYear() + 1
  if (yearText === null) {
    payload.mfg_year = null
  } else {
    const year = Number(yearText)
    if (!/^\d+$/.test(yearText) || year < minYear || year > maxYear) {
      errors.mfg_year = { key: 'invalidYear', values: { min: minYear, max: maxYear } }
    }
    payload.mfg_year = year
  }

  for (const field of dateFields) {
    const value = values[field] || null
    if (value !== null && !isoDatePattern.test(value)) errors[field] = { key: 'invalidDate' }
    payload[field] = value
  }

  payload.gps_installed = values.gps_installed === '' ? null : values.gps_installed === 'yes'

  required('status_id', values.status_id || null)
  payload.status_id = values.status_id || null

  if (values.customer === newOption) {
    const name = text('new_customer_name')
    required('new_customer_name', name)
    if (values.new_customer_sister === '') errors.new_customer_sister = { key: 'chooseOne' }
    payload.new_customer = { name, is_sister_company: values.new_customer_sister === 'yes' }
    payload.customer_id = null
  } else {
    payload.customer_id = values.customer || null
  }

  if (values.location === newOption) {
    const name = text('new_location_name')
    required('new_location_name', name)
    payload.new_location = { name }
    payload.location_id = null
  } else {
    payload.location_id = values.location || null
  }

  if (machineId) payload.id = machineId

  return { errors, payload: Object.keys(errors).length === 0 ? payload : null }
}
