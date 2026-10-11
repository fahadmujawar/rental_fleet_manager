# Register import

Imports the TCS machine register (`data/Main_Data_17-8-25.xlsx`, sheet "MAIN DATA ") into
`machines`, and creates the customers and locations it needs. The starting status for yard machines
comes from the Rent-Description column of `data/Main_Data_April_30_2025.xlsx`.

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
asset_no, the field, the original value, the result and the reason. Rows with reason
`rejected` in the result column are not imported.

## Apply

```powershell
.\.venv\Scripts\python.exe import_register.py --apply
```

All writes are in one transaction. If one write fails, nothing is saved.
You can run the script again: machines are matched on asset_no and updated.

## Rules to know
- A machine that already has status checkins keeps its status and active flag (reason `has_checkins`).
- A chassis or serial number used by more than one machine is removed from all of them
  (reason `duplicate_chassis_no` or `duplicate_serial_no`). Enter the correct one in the app.
- An asset number used on more than one row rejects all of those rows (reason `duplicate_asset_no`).
- Columns that are not in the register (engine number, colour, expiry dates) are not changed.
