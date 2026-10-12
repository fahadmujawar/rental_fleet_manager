# Add a user (for example the Operations user)

## How users are set up today
There is no trigger on `auth.users`. A new login does not get a profile or a role automatically.
Fahad's profile and his `company_admin` role were added by hand in the SQL Editor, after the login was made in the dashboard.
Use the same steps for every new user.

A login without a profile cannot see any data: `current_company_id()` needs an active profile in an active company.

## Step 1: make the login
1. Open the Supabase dashboard, project **fleet-dev**.
2. Go to **Authentication > Users > Add user > Create new user**.
3. Enter the email and a password. Select **Auto Confirm User**.
4. Click **Create user**.

## Step 2: make the profile and give the role
Open **SQL Editor**. Replace the email, the name and the language (`en` or `ar`) in both statements. Run them one at a time.

```sql
-- 2a. Profile in company TCS. The result must be "INSERT 0 1".
--     "INSERT 0 0" means the email or the company was not found: check the email in Authentication.
insert into public.profiles (id, company_id, full_name, preferred_language)
select u.id, c.id, 'Operations User Name', 'en'
from auth.users u
cross join public.companies c
where lower(u.email) = lower('operations@example.com')
  and c.short_code = 'TCS';

-- 2b. Role Operations manager (permission machines.manage). The result must be "INSERT 0 1".
insert into public.user_roles (company_id, user_id, role_id)
select r.company_id, p.id, r.id
from public.profiles p
join auth.users u   on u.id = p.id
join public.roles r on r.company_id = p.company_id and r.code = 'operations_manager'
where lower(u.email) = lower('operations@example.com');
```

For a test user with **no role** (to check that a normal user cannot edit), run only 2a.

## Step 3: check
Each user with their company and roles:

```sql
select u.email,
       p.full_name,
       p.is_active,
       c.short_code as company,
       coalesce(string_agg(r.code, ', ' order by r.code), '(no role)') as roles
from public.profiles p
join auth.users u        on u.id = p.id
join public.companies c  on c.id = p.company_id
left join public.user_roles ur on ur.user_id = p.id
left join public.roles r       on r.id = ur.role_id
group by u.email, p.full_name, p.is_active, c.short_code
order by u.email;
```

Logins that have no profile yet (they cannot see anything until step 2a is done):

```sql
select u.email, u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```

## Notes
- Do not delete profiles or roles. To stop a user, set `profiles.is_active = false`.
- The user must log out and log in again (or reload the app) after a role change, because the app reads the permission once per visit.
