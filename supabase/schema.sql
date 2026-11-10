-- Safe to re-run: every statement is idempotent.
-- Before running, replace YOUR_ADMIN_EMAIL@example.com (two places below).

create extension if not exists pgcrypto;

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 100),
  user_id text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table submissions enable row level security;

-- "Automatically expose new tables" is off for this project, so the API roles
-- get no access until granted. GRANTs decide which operations a role may attempt;
-- the RLS policies below then decide which rows those operations may touch.
grant select, insert on submissions to anon, authenticated;
grant delete on submissions to authenticated;

-- Anyone (including anonymous visitors) can submit a word.
-- is_admin may only be true when the admin is the one inserting,
-- otherwise any visitor could tag their word as an admin submission.
drop policy if exists "public can insert submissions" on submissions;
create policy "public can insert submissions"
  on submissions for insert
  to anon, authenticated
  with check (
    char_length(text) between 1 and 100
    and (not is_admin or auth.jwt() ->> 'email' = 'YOUR_ADMIN_EMAIL@example.com')
  );

-- Anyone can read the word cloud
drop policy if exists "public can read submissions" on submissions;
create policy "public can read submissions"
  on submissions for select
  to anon, authenticated
  using (true);

-- Only the logged-in admin can delete — enforced by the database,
-- not just hidden in frontend code
drop policy if exists "admin can delete submissions" on submissions;
create policy "admin can delete submissions"
  on submissions for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'YOUR_ADMIN_EMAIL@example.com');

-- Enable realtime so the cloud updates live without polling
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table submissions;
  end if;
end $$;
