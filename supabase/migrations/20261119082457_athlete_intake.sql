-- Athlete intake is separate from legacy fighter registrations, public profiles and GP brackets.
begin;

create schema rb_intake;
revoke all on schema rb_intake from public, anon, authenticated;

create table rb_intake.belts (
  code text primary key,
  realm text
);

insert into rb_intake.belts (code, realm) values
  ('white', 'White Carbon Combat'),
  ('blue', 'Zaphire Trials'),
  ('purple', 'Violet Combat Royale'),
  ('brown', 'Oxide Overdrive'),
  ('black-0', null),
  ('black-1', 'Praetoreans Interface'),
  ('black-2', 'Nexus Noir'),
  ('black-3', 'Eclipse Syndicate'),
  ('black-4-plus', null),
  ('other', null),
  ('unranked', null);

create table rb_intake.profiles (
  athlete_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null check (length(btrim(alias)) between 1 and 80),
  city text not null check (length(btrim(city)) between 1 and 80),
  academy text check (length(academy) between 1 and 100),
  discipline text check (length(discipline) between 1 and 100),
  belt text not null references rb_intake.belts(code),
  updated_at timestamptz not null default now()
);

create table rb_intake.reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table rb_intake.applications (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references rb_intake.profiles(athlete_id) on delete cascade,
  request_id uuid not null,
  interest text not null check (interest in ('gp', 'lab', 'both')),
  belt text not null references rb_intake.belts(code),
  suggested_realm text,
  footage_url text check (
    length(footage_url) <= 320 and footage_url ~* '^https?://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  -- Preserve the contact and profile details as submitted, even after a later application.
  details jsonb not null,
  contact_email text not null,
  consented_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','in_review','invited','closed')),
  unique (athlete_id, request_id)
);
create index applications_status_order on rb_intake.applications (status, submitted_at, id);
create index applications_athlete_order on rb_intake.applications (athlete_id, submitted_at desc, id);

create table rb_intake.reviews (
  id bigint generated always as identity primary key,
  application_id uuid not null references rb_intake.applications(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  from_status text not null,
  to_status text not null,
  reviewed_at timestamptz not null default now()
);
create index reviews_by_application on rb_intake.reviews (application_id, id);

-- No direct client access. The authenticated RPCs below are the entire intake API.
alter table rb_intake.belts enable row level security;
alter table rb_intake.profiles enable row level security;
alter table rb_intake.reviewers enable row level security;
alter table rb_intake.applications enable row level security;
alter table rb_intake.reviews enable row level security;
revoke all on all tables in schema rb_intake from public, anon, authenticated;
revoke all on all sequences in schema rb_intake from public, anon, authenticated;

create function rb_intake.rb_submit_application(
  p_request_id uuid, p_alias text, p_city text, p_belt text, p_interest text,
  p_contact_consent boolean, p_academy text default null, p_discipline text default null,
  p_footage_url text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  verified_email text;
  realm text;
  details jsonb;
  prior rb_intake.applications%rowtype;
  receipt uuid;
begin
  select u.email into verified_email from auth.users u
    where u.id = owner_id and u.email_confirmed_at is not null and u.email <> '';
  if verified_email is null then
    raise exception 'A verified email account is required' using errcode = '42501';
  end if;
  if p_contact_consent is not true or p_request_id is null then
    raise exception 'Consent and request ID are required' using errcode = '22023';
  end if;

  select b.realm into realm from rb_intake.belts b where b.code = p_belt;
  if not found or p_interest is null or p_interest not in ('gp', 'lab', 'both') then
    raise exception 'Invalid belt or interest' using errcode = '22023';
  end if;

  p_alias := nullif(btrim(p_alias), '');
  p_city := nullif(btrim(p_city), '');
  p_academy := nullif(btrim(p_academy), '');
  p_discipline := nullif(btrim(p_discipline), '');
  p_footage_url := nullif(btrim(p_footage_url), '');
  details := jsonb_build_object('alias', p_alias, 'city', p_city, 'academy', p_academy, 'discipline', p_discipline);

  -- Serialize submissions for one account before comparing or updating its profile.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select a.* into prior from rb_intake.applications a
    where a.athlete_id = owner_id and a.request_id = p_request_id;
  if found then
    if prior.details <> details or prior.belt <> p_belt or prior.interest <> p_interest
       or prior.footage_url is distinct from p_footage_url then
      raise exception 'Request ID already belongs to a different submission' using errcode = '23505';
    end if;
    return prior.id;
  end if;

  insert into rb_intake.profiles (athlete_id, alias, city, academy, discipline, belt)
    values (owner_id, p_alias, p_city, p_academy, p_discipline, p_belt)
    on conflict (athlete_id) do update set alias = excluded.alias, city = excluded.city,
      academy = excluded.academy, discipline = excluded.discipline, belt = excluded.belt, updated_at = now();

  insert into rb_intake.applications (athlete_id, request_id, interest, belt, suggested_realm,
      footage_url, details, contact_email)
    values (owner_id, p_request_id, p_interest, p_belt, realm, p_footage_url, details, verified_email)
    returning id into receipt;
  return receipt;
end;
$$;

create function rb_intake.rb_my_profile()
returns table (alias text, city text, academy text, discipline text, belt text)
language sql stable security definer set search_path = '' as $$
  select p.alias, p.city, p.academy, p.discipline, p.belt
    from rb_intake.profiles p where p.athlete_id = (select auth.uid());
$$;

create function rb_intake.rb_my_applications()
returns table (id uuid, submitted_at timestamptz, interest text, belt text, suggested_realm text, status text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.submitted_at, a.interest, a.belt, a.suggested_realm, a.status
    from rb_intake.applications a where a.athlete_id = (select auth.uid())
    order by a.submitted_at desc, a.id;
$$;

create function rb_intake.require_reviewer() returns void
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from rb_intake.reviewers r where r.user_id = auth.uid()) then
    raise exception 'Reviewer access required' using errcode = '42501';
  end if;
end;
$$;

create function rb_intake.rb_review_queue()
returns table (id uuid, submitted_at timestamptz, status text, interest text, belt text,
  suggested_realm text, alias text, contact_email text, city text, academy text, discipline text, footage_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform rb_intake.require_reviewer();
  return query select a.id, a.submitted_at, a.status, a.interest, a.belt, a.suggested_realm,
    a.details->>'alias', a.contact_email, a.details->>'city', a.details->>'academy',
    a.details->>'discipline', a.footage_url
    from rb_intake.applications a order by a.submitted_at, a.id;
end;
$$;

create function rb_intake.rb_review_application(p_id uuid, p_expected_status text, p_new_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  current_status text;
begin
  perform rb_intake.require_reviewer();
  select a.status into strict current_status from rb_intake.applications a where a.id = p_id for update;
  if current_status = p_new_status then return current_status; end if;
  if current_status is distinct from p_expected_status then
    raise exception 'Application changed, refresh the queue' using errcode = '40001';
  end if;
  if not coalesce((current_status = 'submitted' and p_new_status in ('in_review', 'closed'))
    or (current_status = 'in_review' and p_new_status in ('invited', 'closed'))
    or (current_status = 'invited' and p_new_status = 'closed'), false) then
    raise exception 'Invalid status transition' using errcode = '22023';
  end if;
  update rb_intake.applications set status = p_new_status where id = p_id;
  insert into rb_intake.reviews (application_id, reviewer_id, from_status, to_status)
    values (p_id, auth.uid(), current_status, p_new_status);
  return p_new_status;
end;
$$;

create function public.rb_submit_application(
  p_request_id uuid, p_alias text, p_city text, p_belt text, p_interest text,
  p_contact_consent boolean, p_academy text default null, p_discipline text default null,
  p_footage_url text default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select * from rb_intake.rb_submit_application(p_request_id, p_alias, p_city, p_belt, p_interest, p_contact_consent, p_academy, p_discipline, p_footage_url);
$$;
revoke all on function rb_intake.rb_submit_application(uuid,text,text,text,text,boolean,text,text,text) from public, anon, authenticated, service_role;
grant execute on function rb_intake.rb_submit_application(uuid,text,text,text,text,boolean,text,text,text) to authenticated;

create function public.rb_my_profile() returns table (alias text, city text, academy text, discipline text, belt text)
language sql stable security invoker set search_path = '' as $$
  select * from rb_intake.rb_my_profile();
$$;
revoke all on function rb_intake.rb_my_profile() from public, anon, authenticated, service_role;
grant execute on function rb_intake.rb_my_profile() to authenticated;

create function public.rb_my_applications() returns table (id uuid, submitted_at timestamptz, interest text, belt text, suggested_realm text, status text)
language sql stable security invoker set search_path = '' as $$
  select * from rb_intake.rb_my_applications();
$$;
revoke all on function rb_intake.rb_my_applications() from public, anon, authenticated, service_role;
grant execute on function rb_intake.rb_my_applications() to authenticated;

create function public.rb_review_queue() returns table (id uuid, submitted_at timestamptz, status text, interest text, belt text,
  suggested_realm text, alias text, contact_email text, city text, academy text, discipline text, footage_url text)
language sql stable security invoker set search_path = '' as $$
  select * from rb_intake.rb_review_queue();
$$;
revoke all on function rb_intake.rb_review_queue() from public, anon, authenticated, service_role;
grant execute on function rb_intake.rb_review_queue() to authenticated;

create function public.rb_review_application(p_id uuid, p_expected_status text, p_new_status text) returns text
language sql security invoker set search_path = '' as $$
  select * from rb_intake.rb_review_application(p_id, p_expected_status, p_new_status);
$$;
revoke all on function rb_intake.rb_review_application(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function rb_intake.rb_review_application(uuid,text,text) to authenticated;

grant usage on schema rb_intake to authenticated;
revoke all on function rb_intake.require_reviewer() from public, anon, authenticated;
revoke all on function
  public.rb_submit_application(uuid,text,text,text,text,boolean,text,text,text),
  public.rb_my_profile(), public.rb_my_applications(), public.rb_review_queue(),
  public.rb_review_application(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function
  public.rb_submit_application(uuid,text,text,text,text,boolean,text,text,text),
  public.rb_my_profile(), public.rb_my_applications(), public.rb_review_queue(),
  public.rb_review_application(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
