-- Keep the canonical unique index and remove no-longer-used browser-write policies.
create unique index if not exists fighter_registrations_user_id_unique
  on public.fighter_registrations (user_id);
drop index if exists public.fighter_registrations_user_unique;
drop policy if exists "Fighters can update their own profile" on public.fighter_registrations;
drop policy if exists "Users can create their own registration" on public.fighter_registrations;
drop policy if exists "Users can read their own registration" on public.fighter_registrations;
-- The RLS policy "Fighters can view their own profile" remains active for authenticated SELECT.
