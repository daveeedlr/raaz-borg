-- Applied to Supabase project iltuwbawjiwvuqqrkyiz.
-- Staff acknowledges an athlete roster registration, separate from assigning a bout.
-- Receipt acknowledgement is account-scoped, idempotent, and email is never claimed as sent prematurely.
create table rb_intake.roster_acknowledgements (
  application_id uuid primary key references rb_intake.applications(id) on delete cascade,
  reviewer_id uuid not null references rb_intake.reviewers(user_id),
  acknowledged_at timestamptz not null default now(),
  email_state text not null default 'pending'
    check (email_state in ('pending','processing','sent','failed')),
  email_attempts integer not null default 0 check(email_attempts>=0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text
);
alter table rb_intake.roster_acknowledgements enable row level security;
revoke all on table rb_intake.roster_acknowledgements from PUBLIC, anon, authenticated;
create index roster_acknowledgements_reviewer_idx
  on rb_intake.roster_acknowledgements(reviewer_id,acknowledged_at desc);
create index roster_acknowledgements_pending_idx
  on rb_intake.roster_acknowledgements(email_state,acknowledged_at);

create function rb_intake.rb_acknowledge_roster(p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare v_ack record;
begin
  perform rb_intake.require_reviewer();
  if p_application_id is null or not exists (
    select 1 from rb_intake.applications a where a.id=p_application_id
  ) then
    raise exception 'Roster registration not found' using errcode='22023';
  end if;
  insert into rb_intake.roster_acknowledgements(application_id,reviewer_id)
  values(p_application_id,auth.uid())
  on conflict(application_id) do nothing;
  select k.application_id,k.acknowledged_at,k.email_state,k.sent_at
    into v_ack from rb_intake.roster_acknowledgements k
    where k.application_id=p_application_id;
  return jsonb_build_object(
    'application_id',v_ack.application_id,
    'acknowledged_at',v_ack.acknowledged_at,
    'email_state',v_ack.email_state,
    'sent_at',v_ack.sent_at
  );
end;
$fn$;
create function public.rb_acknowledge_roster(p_application_id uuid)
returns jsonb language sql security invoker set search_path='' as $fn$
  select rb_intake.rb_acknowledge_roster(p_application_id);
$fn$;

create function rb_intake.rb_review_queue_v3()
returns table (
  id uuid,submitted_at timestamptz,status text,interest text,belt text,
  suggested_realm text,alias text,contact_email text,city text,
  academy text,discipline text,footage_url text,profile_snapshot jsonb,
  acknowledged_at timestamptz,ack_email_state text
) language plpgsql stable security definer set search_path='' as $fn$
begin
  perform rb_intake.require_reviewer();
  return query select q.*,k.acknowledged_at,k.email_state
    from rb_intake.rb_review_queue_v2() q
    left join rb_intake.roster_acknowledgements k on k.application_id=q.id
    order by q.submitted_at desc,q.id desc;
end;
$fn$;
create function public.rb_review_queue_v3()
returns table (
  id uuid,submitted_at timestamptz,status text,interest text,belt text,
  suggested_realm text,alias text,contact_email text,city text,
  academy text,discipline text,footage_url text,profile_snapshot jsonb,
  acknowledged_at timestamptz,ack_email_state text
) language sql stable security invoker set search_path='' as $fn$
  select * from rb_intake.rb_review_queue_v3();
$fn$;

-- Each logged-in athlete sees only the acknowledgement for their own latest registration.
-- No reviewer metadata or another athlete's acknowledgement is exposed.
create function rb_intake.rb_my_acknowledgement()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_owner uuid:=auth.uid();v_json jsonb;
begin
  if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select jsonb_build_object('acknowledged_at',k.acknowledged_at,
           'email_state',k.email_state)
    into v_json
    from rb_intake.roster_acknowledgements k
    join rb_intake.applications a on a.id=k.application_id
    where a.athlete_id=v_owner
    order by k.acknowledged_at desc limit 1;
  return v_json;
end;
$fn$;
create function public.rb_my_acknowledgement()
returns jsonb language sql stable security invoker set search_path='' as $fn$
  select rb_intake.rb_my_acknowledgement();
$fn$;

-- The client cannot choose the recipient. The verified athlete's Auth email is fetched by SQL.
-- Concurrent button presses cannot double-claim the email.
create function rb_intake.rb_claim_ack_email(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_row record;v_details jsonb;
begin
  perform rb_intake.require_reviewer();
  if p_application_id is null then raise exception 'Registration required' using errcode='22023'; end if;
  with candidate as (
    select k.application_id
    from rb_intake.roster_acknowledgements k
    where k.application_id=p_application_id and k.email_attempts < 3
      and (k.email_state='pending' or
           (k.email_state='processing' and k.claimed_at < now()-interval '10 minutes'))
    for update skip locked
  )
  update rb_intake.roster_acknowledgements k
    set email_state='processing',email_attempts=k.email_attempts+1,claimed_at=now()
    from candidate c where k.application_id=c.application_id
    returning k.application_id into v_row;
  if not found then return null; end if;
  select jsonb_build_object(
    'application_id',a.id,
    'email',u.email,
    'alias',coalesce(nullif(p.alias,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),'atleta'),
    'first_name',p.first_name,
    'realm',a.suggested_realm,
    'belt',a.belt,
    'interest',a.interest
  ) into v_details
  from rb_intake.applications a
  join auth.users u on u.id=a.athlete_id and u.email_confirmed_at is not null
  left join rb_intake.profiles p on p.athlete_id=a.athlete_id
  where a.id=v_row.application_id and u.email is not null;
  if v_details is null then
    update rb_intake.roster_acknowledgements
      set email_state='failed',last_error='Confirmed email unavailable',claimed_at=null
      where application_id=p_application_id;
    return null;
  end if;
  return v_details;
end;
$fn$;
create function public.rb_claim_ack_email(p_application_id uuid)
returns jsonb language sql security invoker set search_path='' as $fn$
  select rb_intake.rb_claim_ack_email(p_application_id);
$fn$;

create function rb_intake.rb_finish_ack_email(
  p_application_id uuid,p_sent boolean,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_count integer;
begin
  perform rb_intake.require_reviewer();
  update rb_intake.roster_acknowledgements k
    set email_state=case when p_sent then 'sent'
         when k.email_attempts>=3 then 'failed' else 'pending' end,
        sent_at=case when p_sent then now() else null end,
        claimed_at=null,
        last_error=case when p_sent then null
          else left(coalesce(p_error,'Delivery failed'),180) end
    where k.application_id=p_application_id and k.email_state='processing';
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$fn$;
create function public.rb_finish_ack_email(
  p_application_id uuid,p_sent boolean,p_error text default null
) returns boolean language sql security invoker set search_path='' as $fn$
  select rb_intake.rb_finish_ack_email(p_application_id,p_sent,p_error);
$fn$;

revoke all on function
  rb_intake.rb_acknowledge_roster(uuid),public.rb_acknowledge_roster(uuid),
  rb_intake.rb_review_queue_v3(),public.rb_review_queue_v3(),
  rb_intake.rb_my_acknowledgement(),public.rb_my_acknowledgement(),
  rb_intake.rb_claim_ack_email(uuid),public.rb_claim_ack_email(uuid),
  rb_intake.rb_finish_ack_email(uuid,boolean,text),
  public.rb_finish_ack_email(uuid,boolean,text)
from PUBLIC,anon,authenticated,service_role;
grant execute on function
  rb_intake.rb_acknowledge_roster(uuid),public.rb_acknowledge_roster(uuid),
  rb_intake.rb_review_queue_v3(),public.rb_review_queue_v3(),
  rb_intake.rb_my_acknowledgement(),public.rb_my_acknowledgement(),
  rb_intake.rb_claim_ack_email(uuid),public.rb_claim_ack_email(uuid),
  rb_intake.rb_finish_ack_email(uuid,boolean,text),public.rb_finish_ack_email(uuid,boolean,text)
to authenticated;
notify pgrst,'reload schema';
