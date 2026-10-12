import { supabase } from '../lib/supabase'
import { buildSearchFilter } from '../lib/search'
import type {
  FilterOptions,
  LatestCheckin,
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

// Main category is a text column, not a list table. Read it in chunks until a chunk is empty,
// so the API row limit cannot cut the list short.
async function fetchCategories(): Promise<string[]> {
  const chunkSize = 1000
  const seen = new Set<string>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('machines')
      .select('main_category')
      .not('main_category', 'is', null)
      .order('id')
      .range(from, from + chunkSize - 1)
      .overrideTypes<{ main_category: string }[], { merge: false }>()
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) seen.add(row.main_category)
    from += data.length
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const [statuses, customers, locations, categories] = await Promise.all([
    supabase
      .from('status_values')
      .select('id, name_en, name_ar, is_active')
      .overrideTypes<StatusOption[], { merge: false }>(),
    supabase.from('customers').select('id, name').order('name').overrideTypes<NamedOption[], { merge: false }>(),
    supabase.from('locations').select('id, name').order('name').overrideTypes<NamedOption[], { merge: false }>(),
    fetchCategories(),
  ])
  if (statuses.error) throw statuses.error
  if (customers.error) throw customers.error
  if (locations.error) throw locations.error
  return {
    statuses: statuses.data ?? [],
    customers: customers.data ?? [],
    locations: locations.data ?? [],
    categories,
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
