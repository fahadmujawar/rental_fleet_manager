// Shapes of the rows the machine pages read. The Supabase client has no generated types,
// so each query result is given one of these types by hand.

export type StatusName = { name_en: string; name_ar: string | null }
export type CustomerRef = { name: string; is_sister_company: boolean }

export type MachineListRow = {
  id: string
  asset_no: string
  az_no: string | null
  sub_category_2: string | null
  asset_type: string | null
  description: string | null
  ownership_note: string | null
  site: string | null
  chassis_no: string | null
  plate_no: string | null
  status_values: StatusName | null
  customers: CustomerRef | null
  locations: { name: string } | null
  companies: { short_code: string } | null
}

export type MachineDetail = {
  id: string
  asset_no: string
  az_no: string | null
  chassis_no: string | null
  serial_no: string | null
  plate_no: string | null
  istimara_serial_no: string | null
  main_category: string | null
  sub_category: string | null
  sub_category_2: string | null
  asset_type: string | null
  description: string | null
  manufacturer: string | null
  model: string | null
  capacity: number | null
  capacity_unit: string | null
  mfg_year: number | null
  site: string | null
  project_name: string | null
  insurance_expiry: string | null
  mvpi_expiry: string | null
  tuv_certificate_no: string | null
  tuv_certificate_expiry: string | null
  operational_card_no: string | null
  operational_card_expiry: string | null
  isthimara_expiry: string | null
  fuel_type: string | null
  fuel_chip: string | null
  gps_installed: boolean | null
  gps_imei: string | null
  gps_date: string | null
  mobilization_date: string | null
  date_received: string | null
  ownership_note: string | null
  status_values: StatusName | null
  customers: CustomerRef | null
  locations: { name: string } | null
  companies: { timezone: string; short_code: string } | null
}

export type LatestCheckin = {
  checkin_date: string
  status_values: StatusName | null
  profiles: { full_name: string } | null
}

export type StatusOption = StatusName & { id: string; is_active: boolean }
export type NamedOption = { id: string; name: string }

export type FilterOptions = {
  statuses: StatusOption[]
  categories: string[]
  customers: NamedOption[]
  locations: NamedOption[]
}

export type SortKey = 'asset_no' | 'az_no' | 'plate_no' | 'customer' | 'status'
export type SortDir = 'asc' | 'desc'

export type MachineListParams = {
  q: string
  status: string | null
  category: string | null
  customer: string | null
  location: string | null
  inactive: boolean
  sort: SortKey
  dir: SortDir
  page: number
}

// Arabic name when the language is Arabic and one is set; English otherwise.
export function statusName(status: StatusName | null, lang: string): string | null {
  if (!status) return null
  return lang === 'ar' && status.name_ar ? status.name_ar : status.name_en
}
