"""Import the TCS machine register from Excel into the machines table.

Default is a dry run: the script reads the database and the Excel files,
prints a summary and writes data/import_report.csv, but writes nothing to
the database. With --apply it writes everything in one transaction.
"""

import argparse
import csv
import datetime
import os
import re
import sys
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

import openpyxl
import psycopg
from dotenv import load_dotenv

# 1. Files and company
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"
MAIN_FILE = DATA_DIR / "Main_Data_17-8-25.xlsx"
MAIN_SHEET = "MAIN DATA "
APRIL_FILE = DATA_DIR / "Main_Data_April_30_2025.xlsx"
APRIL_SHEET = "Main data "
REPORT_FILE = DATA_DIR / "import_report.csv"
COMPANY_CODE = "TCS"

# 2. Excel headers, by machines column (or helper name)
MAIN_HEADERS = {
    "old_asset_no": "Old Asset No",
    "asset_no": "Asset No.",
    "main_category": "Main Category",
    "sub_category": "Sub Category",
    "sub_category_2": "Sub Category 2",
    "asset_type": "Type",
    "description": "Description",
    "manufacturer": "Manufacturer",
    "model": "Model Type",
    "capacity": "Capacity",
    "capacity_unit": "Capacity Unit",
    "company": "Company / Department",
    "location": "Location",
    "site": "Site",
    "mfg_year": "Mfg Year",
    "chassis": "Asset Chassis No.",
    "plate_no": "Registration Plates",
}
APRIL_HEADERS = {"asset_no": "Asset No.", "rent_description": "Rent-Description"}

# 3. Length limits, copied from the CHECK constraints on machines, customers and locations
TEXT_LIMITS = {
    "old_asset_no": 30,
    "main_category": 100,
    "sub_category": 100,
    "sub_category_2": 100,
    "asset_type": 100,
    "description": 300,
    "manufacturer": 100,
    "model": 100,
    "capacity_unit": 100,
    "plate_no": 100,
    "site": 200,
}
NAME_LIMIT = 200

# 4. Value rules
NULL_TOKENS = {"", "NA", "N/A", "#N/A", "-"}
SPACE_OR_CONTROL_RE = re.compile(r"[\s\x00-\x1f\x7f-\x9f]+")
ASSET_NO_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{0,29}$")
IDENTIFIER_RE = re.compile(r"^[A-Z0-9][A-Z0-9/.-]{0,39}$")
SERIAL_PREFIX_RE = re.compile(r"^S\s*[/.]\s*NO[^A-Z0-9]*")
MIN_YEAR = 1950
MAX_YEAR = datetime.date.today().year + 1
MAX_CAPACITY = Decimal("9999999999.99")  # numeric(12,2)

SISTER_COMPANIES = {
    "AZMEEL", "ARKAD", "ARFAD", "DRILLING WORKS", "MAS", "ELECTRICAL SOLUTIONS", "HEXAGON",
    "WITHIN", "GTI COMPANY", "EVISION COMPANY", "HAYAKEL", "SAUDI WIDCON", "AL ARABI",
}
OUTSIDE_CUSTOMERS = {
    "SARAYA ALANDALUS", "AHAK COMPANY", "JADWAL", "ALSHAWAF", "AIC STEEL", "HARBY", "COPASA",
    "AL HAMMASH", "RELY", "UNIFIED SOLUTION", "SHINE", "SYNOPC", "KALPATARU",
}
SITE_STATUS = {
    "SOLD": "sold",
    "STOLEN": "stolen",
    "MISSING": "missing",
    "SCRAP IN YARD": "scrapped",
    "ACCIDENT": "accident_damage",
}
SITE_NO_TEXT = {"WORKSHOP REPAIRING", "STANDBY", "STAND BY", "SATNDBY"}
MAJOR_BREAKDOWN = "MAJOR BREAKDOWN"
INACTIVE_STATUSES = {"sold", "stolen", "missing", "scrapped"}
USED_STATUSES = [
    "on_hire", "idle_yard", "under_repair", "accident_damage", "scrapped", "sold", "stolen", "missing",
]

# 5. SQL for the machine upsert.
# A machine with checkins keeps its current status_id and is_active. The rule is in SQL,
# so it also holds for a checkin made after the dry run.
MACHINE_COLUMNS = [
    "old_asset_no", "main_category", "sub_category", "sub_category_2", "asset_type", "description",
    "manufacturer", "model", "capacity", "capacity_unit", "mfg_year", "chassis_no", "serial_no",
    "plate_no", "status_id", "customer_id", "location_id", "site", "is_active",
]
HAS_CHECKINS_SQL = "exists (select 1 from public.status_checkins c where c.machine_id = m.id)"
KEEP_IF_CHECKINS = {"status_id", "is_active"}
UPSERT_SQL = (
    "insert into public.machines as m (company_id, asset_no, "
    + ", ".join(MACHINE_COLUMNS)
    + ") values (%(company_id)s, %(asset_no)s, "
    + ", ".join(f"%({c})s" for c in MACHINE_COLUMNS)
    + ") on conflict (company_id, asset_no) do update set "
    + ", ".join(
        f"{c} = case when {HAS_CHECKINS_SQL} then m.{c} else excluded.{c} end"
        if c in KEEP_IF_CHECKINS
        else f"{c} = excluded.{c}"
        for c in MACHINE_COLUMNS
    )
)


class ImportStop(Exception):
    """A problem that stops the import before anything is written."""


class Report:
    """Collects the lines for data/import_report.csv."""

    def __init__(self):
        self.lines = []

    def add(self, asset_no, field, original, result, reason):
        self.lines.append({
            "asset_no": asset_no or "",
            "field": field,
            "original_value": "" if original is None else str(original),
            "result": "" if result is None else str(result),
            "reason": reason,
        })

    def reasons(self):
        return Counter(line["reason"] for line in self.lines)


# ---------- Cleaning helpers ----------

def clean_text(value):
    """Trim, collapse spaces and control characters to one space, turn null tokens into None."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, (datetime.datetime, datetime.date)):
        value = value.isoformat()
    text = SPACE_OR_CONTROL_RE.sub(" ", str(value)).strip()
    if text.upper() in NULL_TOKENS:
        return None
    return text


def title_case(text):
    return " ".join(word.capitalize() for word in text.split(" "))


def clean_asset_no(value):
    text = clean_text(value)
    if text is None:
        return None
    return text.upper().replace(".", "-")


def to_decimal(value):
    """Return a finite Decimal, or None if the value is not a number."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = Decimal(str(value))
    else:
        try:
            number = Decimal(value)
        except InvalidOperation:
            return None
    return number if number.is_finite() else None


def parse_year(value):
    """Return (year or None, reason or None)."""
    text = clean_text(value)
    if text is None:
        return None, None
    number = to_decimal(value if isinstance(value, (int, float)) else text)
    if number is None or number != number.to_integral_value():
        return None, "invalid_mfg_year"
    year = int(number)
    if not MIN_YEAR <= year <= MAX_YEAR:
        return None, "mfg_year_out_of_range"
    return year, None


def parse_capacity(value):
    """Return (capacity or None, reason or None)."""
    text = clean_text(value)
    if text is None:
        return None, None
    number = to_decimal(value if isinstance(value, (int, float)) else text)
    if number is None:
        return None, "invalid_capacity"
    number = number.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if number <= 0 or number > MAX_CAPACITY:
        return None, "capacity_out_of_range"
    return number, None


def split_chassis(value):
    """Return (field, value or None, reason or None). field is chassis_no or serial_no."""
    text = clean_text(value)
    if text is None:
        return "chassis_no", None, None
    text = text.upper()
    prefix = SERIAL_PREFIX_RE.match(text)
    if prefix:
        field, rest = "serial_no", text[prefix.end():]
    else:
        field, rest = "chassis_no", text
    rest = rest.replace(" ", "")
    if not rest:
        return field, None, "prefix_only"
    if not IDENTIFIER_RE.match(rest):
        return field, None, f"invalid_{field}"
    return field, rest, None


# ---------- Reading ----------

def open_sheet(path, sheet_name):
    if not path.exists():
        raise ImportStop(f"File not found: {path}")
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet_name not in workbook.sheetnames:
        raise ImportStop(f"Sheet {sheet_name!r} not found in {path.name}")
    return workbook[sheet_name]


def read_rows(path, sheet_name, headers):
    """Yield (excel_row_number, {name: value}) for each non-empty row. Columns are found by header."""
    sheet = open_sheet(path, sheet_name)
    rows = sheet.iter_rows(values_only=True)
    header_row = next(rows, None) or ()
    positions = {}
    for index, cell in enumerate(header_row):
        key = (clean_text(cell) or "").lower()
        positions.setdefault(key, index)
    missing = [h for h in headers.values() if h.lower() not in positions]
    if missing:
        raise ImportStop(f"{path.name}: header(s) not found: {', '.join(missing)}")
    columns = {name: positions[header.lower()] for name, header in headers.items()}
    for number, row in enumerate(rows, start=2):
        if all(clean_text(cell) is None for cell in row):
            continue
        yield number, {name: (row[i] if i < len(row) else None) for name, i in columns.items()}


def read_april():
    """Return {asset_no: set of upper case Rent-Description values}."""
    descriptions = {}
    for _, row in read_rows(APRIL_FILE, APRIL_SHEET, APRIL_HEADERS):
        asset_no = clean_asset_no(row["asset_no"])
        if asset_no is None:
            continue
        text = clean_text(row["rent_description"])
        descriptions.setdefault(asset_no, set()).add(text.upper() if text else None)
    return descriptions


def load_db_state(cur):
    cur.execute("select id, is_active from public.companies where short_code = %s", (COMPANY_CODE,))
    company = cur.fetchone()
    if company is None:
        raise ImportStop(f"Company {COMPANY_CODE} not found")
    if not company[1]:
        raise ImportStop(f"Company {COMPANY_CODE} is inactive")
    company_id = company[0]

    cur.execute("select code, id, is_active from public.status_values where company_id = %s", (company_id,))
    statuses = {code: (status_id, active) for code, status_id, active in cur.fetchall()}
    unusable = [code for code in USED_STATUSES if code not in statuses or not statuses[code][1]]
    if unusable:
        raise ImportStop(f"Status values missing or inactive for {COMPANY_CODE}: {', '.join(unusable)}")

    cur.execute(
        "select id, name, is_sister_company, is_active from public.customers where company_id = %s",
        (company_id,),
    )
    customers = {
        name.lower(): {"id": cid, "name": name, "is_sister": sister, "is_active": active}
        for cid, name, sister, active in cur.fetchall()
    }

    cur.execute("select id, name, is_active from public.locations where company_id = %s", (company_id,))
    locations = {
        name.lower(): {"id": lid, "name": name, "is_active": active}
        for lid, name, active in cur.fetchall()
    }

    cur.execute(
        "select m.asset_no, m.chassis_no, m.serial_no, s.code, m.is_active, "
        f"{HAS_CHECKINS_SQL} "
        "from public.machines m join public.status_values s on s.id = m.status_id "
        "where m.company_id = %s",
        (company_id,),
    )
    machines = {
        asset_no: {
            "chassis_no": chassis, "serial_no": serial,
            "status": code, "is_active": active, "has_checkins": has_checkins,
        }
        for asset_no, chassis, serial, code, active, has_checkins in cur.fetchall()
    }

    return {
        "company_id": company_id,
        "status_ids": {code: value[0] for code, value in statuses.items()},
        "customers": customers,
        "locations": locations,
        "machines": machines,
    }


# ---------- Planning ----------

def limit_text(value, field, asset_no, report):
    text = clean_text(value)
    if text is not None and len(text) > TEXT_LIMITS[field]:
        report.add(asset_no, field, text, None, "too_long")
        return None
    return text


def clean_name(value, field, asset_no, report):
    """Title case name for a customer or location, or None."""
    text = clean_text(value)
    if text is None:
        return None
    if len(text) > NAME_LIMIT:
        report.add(asset_no, field, text, None, "too_long")
        return None
    return title_case(text)


def clean_machine(row, asset_no, april, report):
    machine = {"asset_no": asset_no}
    for field in TEXT_LIMITS:
        if field != "site":
            machine[field] = limit_text(row[field], field, asset_no, report)

    machine["capacity"], reason = parse_capacity(row["capacity"])
    if reason:
        report.add(asset_no, "capacity", row["capacity"], None, reason)

    machine["mfg_year"], reason = parse_year(row["mfg_year"])
    if reason:
        report.add(asset_no, "mfg_year", row["mfg_year"], None, reason)

    machine["chassis_no"] = machine["serial_no"] = None
    field, value, reason = split_chassis(row["chassis"])
    machine[field] = value
    if reason:
        report.add(asset_no, field, row["chassis"], None, reason)
    elif field == "serial_no":
        report.add(asset_no, "serial_no", row["chassis"], value, "moved_to_serial_no")

    # Customer: everything except TCS
    company = clean_text(row["company"])
    customer = None
    if company is not None and company.upper() != COMPANY_CODE:
        customer = clean_name(company, "customer", asset_no, report)
    machine["customer_key"] = customer.lower() if customer else None
    machine["customer_name"] = customer

    location = clean_name(row["location"], "location", asset_no, report)
    machine["location_key"] = location.lower() if location else None
    machine["location_name"] = location

    # Site: a condition gives a status, a workshop or standby value gives nothing, others are site text
    site = clean_text(row["site"])
    site_upper = site.upper() if site else None
    status = SITE_STATUS.get(site_upper)
    if status:
        report.add(asset_no, "site", site, status, "site_to_status")
        site = None
    elif site_upper in SITE_NO_TEXT:
        site = None
    elif site is not None and len(site) > TEXT_LIMITS["site"]:
        report.add(asset_no, "site", site, None, "too_long")
        site = None
    machine["site"] = site

    if status is None:
        descriptions = april.get(asset_no, set())
        if customer:
            status = "on_hire"
        elif descriptions == {MAJOR_BREAKDOWN}:
            status = "under_repair"
        else:
            status = "idle_yard"
            if MAJOR_BREAKDOWN in descriptions:
                shown = "; ".join(sorted(d or "(blank)" for d in descriptions))
                report.add(asset_no, "status", shown, status, "april_conflict")
    machine["status"] = status
    machine["is_active"] = status not in INACTIVE_STATUSES
    return machine


def null_duplicates(machines, field, existing, report):
    """Set a chassis_no or serial_no to None on every machine that shares it.
    existing holds values used by machines in the database that are not in this file."""
    counts = Counter(m[field] for m in machines if m[field] is not None)
    for machine in machines:
        value = machine[field]
        if value is not None and (counts[value] > 1 or value in existing):
            report.add(machine["asset_no"], field, value, None, f"duplicate_{field}")
            machine[field] = None


def build_plan(april, state, report):
    stats = Counter()
    raw_rows = []
    for number, row in read_rows(MAIN_FILE, MAIN_SHEET, MAIN_HEADERS):
        stats["rows_read"] += 1
        raw_rows.append((number, row, clean_asset_no(row["asset_no"])))

    # Reject blank, invalid and duplicate asset numbers
    asset_counts = Counter(a for _, _, a in raw_rows if a is not None)
    accepted = []
    for number, row, asset_no in raw_rows:
        original = clean_text(row["asset_no"])
        if asset_no is None:
            report.add(f"(row {number})", "asset_no", row["asset_no"], "rejected", "blank_asset_no")
        elif not ASSET_NO_RE.match(asset_no):
            report.add(f"(row {number})", "asset_no", row["asset_no"], "rejected", "invalid_asset_no")
        elif asset_counts[asset_no] > 1:
            report.add(asset_no, "asset_no", f"{original} (row {number})", "rejected", "duplicate_asset_no")
        else:
            if original != asset_no:
                report.add(asset_no, "asset_no", original, asset_no, "asset_no_normalised")
            accepted.append((row, asset_no))
            continue
        stats["rows_rejected"] += 1

    machines = [clean_machine(row, asset_no, april, report) for row, asset_no in accepted]

    in_file = {m["asset_no"] for m in machines}
    for field in ("chassis_no", "serial_no"):
        existing = {
            m[field] for a, m in state["machines"].items() if a not in in_file and m[field] is not None
        }
        null_duplicates(machines, field, existing, report)

    # Machines with checkins keep their current status and is_active
    for machine in machines:
        current = state["machines"].get(machine["asset_no"])
        if current and current["has_checkins"]:
            if (machine["status"], machine["is_active"]) != (current["status"], current["is_active"]):
                report.add(machine["asset_no"], "status", machine["status"], current["status"], "has_checkins")
            stats["kept_for_checkins"] += 1
            machine["status"] = current["status"]
            machine["is_active"] = current["is_active"]

    # Customers and locations to create, sister flags to update
    new_customers, flag_updates, new_locations = {}, {}, {}
    for machine in machines:
        key, name = machine["customer_key"], machine["customer_name"]
        if key:
            is_sister = name.upper() in SISTER_COMPANIES
            current = state["customers"].get(key)
            if current is None:
                new_customers.setdefault(key, {"name": name, "is_sister": is_sister})
            else:
                if current["is_sister"] != is_sister and key not in flag_updates:
                    flag_updates[key] = is_sister
                    report.add("", "customer.is_sister_company", f"{current['name']}: {current['is_sister']}",
                               is_sister, "sister_flag_changed")
                if not current["is_active"]:
                    report.add(machine["asset_no"], "customer", current["name"], current["name"],
                               "inactive_customer")
        key, name = machine["location_key"], machine["location_name"]
        if key:
            current = state["locations"].get(key)
            if current is None:
                new_locations.setdefault(key, name)
            elif not current["is_active"]:
                report.add(machine["asset_no"], "location", current["name"], current["name"], "inactive_location")

    all_customer_names = {m["customer_name"] for m in machines if m["customer_name"]}
    review = sorted(
        n for n in all_customer_names if n.upper() not in SISTER_COMPANIES | OUTSIDE_CUSTOMERS
    )

    stats["to_insert"] = sum(1 for m in machines if m["asset_no"] not in state["machines"])
    stats["to_update"] = len(machines) - stats["to_insert"]
    return {
        "machines": machines,
        "new_customers": new_customers,
        "flag_updates": flag_updates,
        "new_locations": new_locations,
        "review": review,
        "stats": stats,
    }


# ---------- Output ----------

def write_report(report):
    try:
        with open(REPORT_FILE, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(
                handle, fieldnames=["asset_no", "field", "original_value", "result", "reason"]
            )
            writer.writeheader()
            writer.writerows(report.lines)
    except PermissionError:
        raise ImportStop(f"Cannot write {REPORT_FILE}. Close it in Excel and try again.")


def print_summary(plan, report):
    stats = plan["stats"]
    machines = plan["machines"]
    print("=== Register import summary ===")
    print(f"Rows read:                   {stats['rows_read']}")
    print(f"Rows rejected:               {stats['rows_rejected']}")
    print(f"Machines to insert:          {stats['to_insert']}")
    print(f"Machines to update:          {stats['to_update']}")
    print(f"Kept status (has checkins):  {stats['kept_for_checkins']}")
    print(f"Customers to create:         {len(plan['new_customers'])}")
    for c in sorted(plan["new_customers"].values(), key=lambda c: c["name"]):
        print(f"    {c['name']}{'  (sister company)' if c['is_sister'] else ''}")
    print(f"Customer flags to update:    {len(plan['flag_updates'])}")
    print(f"Locations to create:         {len(plan['new_locations'])}")
    for name in sorted(plan["new_locations"].values()):
        print(f"    {name}")
    print("Machines per status:")
    status_counts = Counter(m["status"] for m in machines)
    for code in USED_STATUSES + sorted(set(status_counts) - set(USED_STATUSES)):
        print(f"    {code:<18} {status_counts[code]}")
    print(f"Inactive machines:           {sum(1 for m in machines if not m['is_active'])}")
    print("Reported cleanups by reason:")
    for reason, count in sorted(report.reasons().items()):
        print(f"    {reason:<26} {count}")
    print("Customers to review (not in the sister or outside list):")
    for name in plan["review"] or ["(none)"]:
        print(f"    {name}")
    print(f"Report written to: {REPORT_FILE}")


# ---------- Writing ----------

def apply_plan(cur, plan, state):
    company_id = state["company_id"]

    location_ids = {key: loc["id"] for key, loc in state["locations"].items()}
    for key, name in plan["new_locations"].items():
        cur.execute(
            "insert into public.locations (company_id, name) values (%s, %s) returning id",
            (company_id, name),
        )
        location_ids[key] = cur.fetchone()[0]

    customer_ids = {key: c["id"] for key, c in state["customers"].items()}
    for key, c in plan["new_customers"].items():
        cur.execute(
            "insert into public.customers (company_id, name, is_sister_company) "
            "values (%s, %s, %s) returning id",
            (company_id, c["name"], c["is_sister"]),
        )
        customer_ids[key] = cur.fetchone()[0]

    for key, is_sister in plan["flag_updates"].items():
        cur.execute(
            "update public.customers set is_sister_company = %s where id = %s",
            (is_sister, customer_ids[key]),
        )

    # Clear chassis_no and serial_no first, so that two machines can swap a value
    # without a unique constraint error in the middle of the upsert.
    existing = [m["asset_no"] for m in plan["machines"] if m["asset_no"] in state["machines"]]
    if existing:
        cur.execute(
            "update public.machines set chassis_no = null, serial_no = null "
            "where company_id = %s and asset_no = any(%s)",
            (company_id, existing),
        )

    params = []
    for m in plan["machines"]:
        row = {c: m.get(c) for c in MACHINE_COLUMNS}
        row["company_id"] = company_id
        row["asset_no"] = m["asset_no"]
        row["status_id"] = state["status_ids"][m["status"]]
        row["customer_id"] = customer_ids[m["customer_key"]] if m["customer_key"] else None
        row["location_id"] = location_ids[m["location_key"]] if m["location_key"] else None
        params.append(row)
    cur.executemany(UPSERT_SQL, params)


# ---------- Main ----------

def safe_message(error, url):
    """Error text with the connection string removed."""
    return str(error).replace(url, "[DATABASE_URL]").strip()


def main():
    parser = argparse.ArgumentParser(description="Import the TCS machine register.")
    parser.add_argument("--apply", action="store_true", help="write to the database (default: dry run)")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    load_dotenv(SCRIPT_DIR / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Stopped: DATABASE_URL is not set in scripts/import_register/.env")
        return 1

    try:
        april = read_april()
        # prepare_threshold=None: no prepared statements, so the Supabase transaction pooler also works
        with psycopg.connect(url, connect_timeout=15, prepare_threshold=None) as conn:
            conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
            conn.read_only = not args.apply
            try:
                with conn.cursor() as cur:
                    state = load_db_state(cur)
                    report = Report()
                    plan = build_plan(april, state, report)
                    write_report(report)
                    print_summary(plan, report)
                    if args.apply:
                        apply_plan(cur, plan, state)
                if args.apply:
                    conn.commit()
                else:
                    conn.rollback()
            except BaseException:
                conn.rollback()
                raise
    except ImportStop as error:
        print(f"Stopped: {error}")
        return 1
    except psycopg.Error as error:
        print(f"Database error ({type(error).__name__}), nothing was written: {safe_message(error, url)}")
        return 1

    if args.apply:
        print(f"APPLIED: {len(plan['machines'])} machines written in one transaction.")
    else:
        print("DRY RUN: nothing was written. Run again with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
