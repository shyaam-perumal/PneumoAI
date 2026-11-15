-- One profile row per Supabase Auth user. Age is captured by the existing
-- mandatory signup field; it is profile data and is not used by the AI model.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) > 0),
  age smallint not null check (age between 1 and 120),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, delete on table public.profiles to authenticated;
-- Do not grant UPDATE on id. The trigger below also protects the key from
-- updates made through other roles or future privilege changes.
grant update (display_name, age) on table public.profiles to authenticated;

drop policy if exists "PneumoAI users can read their own profile" on public.profiles;
create policy "PneumoAI users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "PneumoAI users can create their own profile" on public.profiles;
create policy "PneumoAI users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "PneumoAI users can update their own profile" on public.profiles;
create policy "PneumoAI users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "PneumoAI users can delete their own profile" on public.profiles;
create policy "PneumoAI users can delete their own profile"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

create or replace function public.prevent_pneumoai_profile_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile IDs cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_pneumoai_profile_id_change() from public, anon, authenticated;

drop trigger if exists pneumoai_profile_id_immutable on public.profiles;
create trigger pneumoai_profile_id_immutable
  before update of id on public.profiles
  for each row execute function public.prevent_pneumoai_profile_id_change();

create or replace function public.handle_new_pneumoai_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_age_text text;
  profile_age smallint;
begin
  profile_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  profile_age_text := nullif(btrim(new.raw_user_meta_data ->> 'age'), '');

  if profile_name is null then
    raise exception 'A profile name is required.';
  end if;
  -- Signup sends age as a JSON number; ->> reads it as text. Validate before
  -- casting so malformed metadata produces a clear error rather than a cast error.
  if profile_age_text is null or profile_age_text !~ '^[0-9]{1,3}$' then
    raise exception 'A valid age between 1 and 120 is required.';
  end if;
  profile_age := profile_age_text::smallint;
  if profile_age is null or profile_age < 1 or profile_age > 120 then
    raise exception 'A valid age between 1 and 120 is required.';
  end if;

  insert into public.profiles (id, display_name, age)
  values (new.id, profile_name, profile_age);

  return new;
end;
$$;

revoke all on function public.handle_new_pneumoai_user() from public, anon, authenticated;

drop trigger if exists pneumoai_create_profile_after_signup on auth.users;
create trigger pneumoai_create_profile_after_signup
  after insert on auth.users
  for each row execute function public.handle_new_pneumoai_user();
