import { supabase } from '../lib/supabase'
import { buildSearchFilter } from '../lib/search'
import type {
  FilterOptions,
  FormCustomerOption,
  FormOptions,
  FormStatusOption,
  LatestCheckin,
  MachineChange,
  MachineDetail,
  MachineListParams,
  MachineListRow,
  NamedOption,
  SortKey,
  StatusOption,
} from './types'

// Every query uses the user's session, so Row Level Security limits rows to the user's company.

export const pageSize = 50

// Sort columns for each sort key, before TCS No. Empty values come last in both directions.
// Ordering by a related table's column sorts the machines themselves (PostgREST "table(column)").
// Az No: numbers first in number order (az_no_number), then the other values by their text.
const sortColumns: Record<SortKey, string[]> = {
  asset_no: [],
  az_no: ['az_no_number', 'az_no'],
  plate_no: ['plate_no'],
  customer: ['customers(name)'],
  status: ['status_values(sort_order)'],
}

export async function fetchMachinePage(params: MachineListParams, signal: AbortSignal) {
  let query = supabase
    .from('machines')
    .select(
      'id, asset_no, az_no, sub_category_2, asset_type, description, ownership_note, site, ' +
        'chassis_no, plate_no, status_values(name_en, name_ar, sort_order), customers(name, is_sister_company), ' +
        'locations(name), companies(short_code)',
      { count: 'exact' },
    )

  if (!params.inactive) query = query.eq('is_active', true)
  if (params.status) query = query.eq('status_id', params.status)
  if (params.category) query = query.eq('main_category', params.category)
  if (params.customer) query = query.eq('customer_id', params.customer)
  if (params.location) query = query.eq('location_id', params.location)

  const search = buildSearchFilter(params.q)
  if (search) query = query.or(search)

  const ascending = params.dir === 'asc'
  const columns = sortColumns[params.sort]
  for (const column of columns) query = query.order(column, { ascending, nullsFirst: false })
  // TCS No is always the last sort key, so rows with the same value keep a fixed order across pages.
  query = query.order('asset_no', { ascending: columns.length > 0 ? true : ascending })

  const from = (params.page - 1) * pageSize
  const { data, count, error } = await query
    .range(from, from + pageSize - 1)
    .abortSignal(signal)
    .overrideTypes<MachineListRow[], { merge: false }>()
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

type SuggestionColumn = keyof FormOptions['suggestions']

// Category columns are text, not list tables. Read them in chunks until a chunk is empty,
// so the API row limit cannot cut the lists short. Returns the sorted distinct values per column.
async function fetchDistinctValues<C extends SuggestionColumn>(columns: C[]): Promise<Record<C, string[]>> {
  const chunkSize = 1000
  const seen = new Map(columns.map((column) => [column, new Set<string>()]))
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('machines')
      .select(columns.join(', '))
      .order('id')
      .range(from, from + chunkSize - 1)
      .overrideTypes<Record<C, string | null>[], { merge: false }>()
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) {
      for (const column of columns) {
        const value = row[column]
        if (value !== null) seen.get(column)!.add(value)
      }
    }
    from += data.length
  }
  return Object.fromEntries(
    columns.map((column) => [column, [...seen.get(column)!].sort((a, b) => a.localeCompare(b))]),
  ) as Record<C, string[]>
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const [statuses, customers, locations, distinct] = await Promise.all([
    supabase
      .from('status_values')
      .select('id, name_en, name_ar, is_active')
      .overrideTypes<StatusOption[], { merge: false }>(),
    supabase.from('customers').select('id, name').order('name').overrideTypes<NamedOption[], { merge: false }>(),
    supabase.from('locations').select('id, name').order('name').overrideTypes<NamedOption[], { merge: false }>(),
    fetchDistinctValues(['main_category']),
  ])
  if (statuses.error) throw statuses.error
  if (customers.error) throw customers.error
  if (locations.error) throw locations.error
  return {
    statuses: statuses.data ?? [],
    customers: customers.data ?? [],
    locations: locations.data ?? [],
    categories: distinct.main_category,
  }
}

export async function fetchFormOptions(): Promise<FormOptions> {
  const [statuses, customers, locations, company, suggestions] = await Promise.all([
    supabase
      .from('status_values')
      .select('id, name_en, name_ar, is_active, sort_order')
      .order('sort_order')
      .overrideTypes<FormStatusOption[], { merge: false }>(),
    supabase
      .from('customers')
      .select('id, name, is_sister_company')
      .order('name')
      .overrideTypes<FormCustomerOption[], { merge: false }>(),
    supabase.from('locations').select('id, name').order('name').overrideTypes<NamedOption[], { merge: false }>(),
    // RLS shows only the user's own company.
    supabase.from('companies').select('short_code').maybeSingle().overrideTypes<{ short_code: string } | null, { merge: false }>(),
    fetchDistinctValues(['main_category', 'sub_category', 'sub_category_2', 'asset_type']),
  ])
  if (statuses.error) throw statuses.error
  if (customers.error) throw customers.error
  if (locations.error) throw locations.error
  if (company.error) throw company.error
  return {
    statuses: statuses.data ?? [],
    customers: customers.data ?? [],
    locations: locations.data ?? [],
    suggestions,
    companyCode: company.data?.short_code ?? '',
  }
}

export async function fetchMachine(id: string): Promise<MachineDetail | null> {
  const { data, error } = await supabase
    .from('machines')
    .select(
      'id, asset_no, az_no, chassis_no, serial_no, plate_no, istimara_serial_no, ' +
        'main_category, sub_category, sub_category_2, asset_type, description, manufacturer, model, ' +
        'capacity, capacity_unit, mfg_year, site, project_name, ' +
        'insurance_expiry, mvpi_expiry, tuv_certificate_no, tuv_certificate_expiry, ' +
        'operational_card_no, operational_card_expiry, isthimara_expiry, ' +
        'fuel_type, fuel_chip, gps_installed, gps_imei, gps_date, mobilization_date, date_received, ownership_note, ' +
        'status_id, customer_id, location_id, updated_at, ' +
        'status_values(name_en, name_ar), customers(name, is_sister_company), locations(name), ' +
        'companies(timezone, short_code)',
    )
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<MachineDetail | null, { merge: false }>()
  if (error) throw error
  return data
}

export async function fetchLatestCheckin(machineId: string): Promise<LatestCheckin | null> {
  const { data, error } = await supabase
    .from('status_checkins')
    .select('checkin_date, status_values(name_en, name_ar), profiles(full_name)')
    .eq('machine_id', machineId)
    .order('checkin_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<LatestCheckin | null, { merge: false }>()
  if (error) throw error
  return data
}

export const changesPageSize = 20

export async function fetchMachineChanges(machineId: string, page: number) {
  const from = (page - 1) * changesPageSize
  const { data, count, error } = await supabase
    .from('machine_changes')
    .select('id, changed_at, action, field, old_value, new_value, profiles(full_name)', { count: 'exact' })
    .eq('machine_id', machineId)
    .order('changed_at', { ascending: false })
    .order('field')
    .range(from, from + changesPageSize - 1)
    .overrideTypes<MachineChange[], { merge: false }>()
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// Error codes that save_machine raises; anything else is shown as a general error.
const saveErrorCodes = [
  'not_allowed',
  'machine_changed',
  'machine_not_found',
  'duplicate_asset_no',
  'duplicate_az_no',
  'duplicate_chassis_no',
  'duplicate_serial_no',
  'duplicate_value',
  'customer_name_required',
  'sister_company_required',
  'location_name_required',
  'invalid_status',
  'invalid_value',
] as const
export type SaveErrorCode = (typeof saveErrorCodes)[number] | 'generic'

export async function saveMachine(
  payload: Record<string, unknown>,
  expectedUpdatedAt: string | null,
): Promise<{ ok: true; id: string } | { ok: false; code: SaveErrorCode }> {
  const { data, error } = await supabase.rpc('save_machine', {
    p_machine: payload,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (error) {
    const code = saveErrorCodes.find((c) => c === error.message)
    return { ok: false, code: code ?? 'generic' }
  }
  return { ok: true, id: data as string }
}
