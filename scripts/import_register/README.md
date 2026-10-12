# Register import

Imports the TCS machine register (`data/Total_Assets.xlsx`, sheet "Sheet1", from Operations) into
`machines`, and creates the customers and locations it needs. Columns are found by header name
(trimmed, case ignored), not by position.

## Setup (once)

```powershell
cd D:\rental_fleet_manager\scripts\import_register
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Make `scripts/import_register/.env` with one line (git ignores this file):

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres
```

Get the URL from Supabase: Connect > Session pooler. The script never prints it.

## Dry run (default, writes nothing to the database)

```powershell
.\.venv\Scripts\python.exe import_register.py
```

The script prints a summary and writes `data/import_report.csv`. Each report line has the
asset_no, the field, the original value, the result and the reason. Rows with `rejected` in the
result column are not imported. The summary ends with an expected counts check; each difference
is printed as a `MISMATCH` line.

## Apply

```powershell
.\.venv\Scripts\python.exe import_register.py --apply
```

All writes are in one transaction. If one write fails, nothing is saved.
If any expected count does not match, `--apply` stops before it writes. Use `--apply --force`
to write anyway. You can run the script again: machines are matched on asset_no (TCS No) and updated.

## Rules to know
- Status comes from TCS No, Rent-Description, Site and Status, first matching rule wins
  (see `status_for`). A row that matches no rule is rejected (reason `no_status_rule`).
  A machine's is_active follows the is_active flag of its status.
- TCS machines in the database that are not in the file are deleted. Then customers and locations
  that no machine uses are deleted. A machine with status checkins blocks the import.
- Company / Department: TCS means no customer. Other names are kept as typed, matched ignoring case.
  is_sister_company is the majority of the machines' Rent-Description (Sister Companies or Azmeel =
  sister, Customers = customer). Azmeel Contracting Company is always a sister company.
- OwnerShip goes to ownership_note in title case. It is information only: TCS owns every machine.
- Only real Excel dates are read. Other values become empty (reason `invalid_date`).
- A machine that already has status checkins keeps its status (reason `has_checkins`).
- A chassis, serial or Az No used by more than one machine is removed from all of them
  (reason `duplicate_chassis_no`, `duplicate_serial_no` or `duplicate_az_no`). Enter the correct one in the app.
- An asset number used on more than one row rejects all of those rows (reason `duplicate_asset_no`).
- Columns that are not in the register (old asset no, engine number, colour, Isthimara expiry,
  warranty expiry) are not changed.
