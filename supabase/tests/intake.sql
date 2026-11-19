-- Run against an isolated test database as postgres. All fixture data rolls back.
begin;
do $$
declare
  athlete uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  request uuid := gen_random_uuid();
  receipt uuid;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (athlete, athlete::text || '@example.invalid',now()),
    (other_user, other_user::text || '@example.invalid',now());
  assert (select count(*)=2 from public.fighter_registrations
    where user_id in (athlete, other_user) and registration_status='account_created');
  assert (select count(*)=2 from public.fighter_registrations
    where first_name is null and payment_option is null);
  update auth.users set email_confirmed_at=null where id=athlete;
  assert (select email_verified=false from public.fighter_registrations where user_id=athlete);
  update auth.users set email_confirmed_at=now() where id=athlete;
  assert (select email_verified=true from public.fighter_registrations where user_id=athlete);
  insert into rb_intake.reviewers values(other_user);
  perform set_config('request.jwt.claim.sub',athlete::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',athlete,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  set local role authenticated;
  assert public.rb_queue_sign_in_alert() is true;
  assert public.rb_queue_sign_in_alert() is true;
  receipt := public.rb_submit_application(request,'Test','Quito','white','gp',true);
  assert receipt = public.rb_submit_application(request,'Test','Quito','white','gp',true);
  assert (select count(*)=1 from public.rb_my_applications() where suggested_realm='White Carbon Combat');
  assert (select (public.rb_my_fighter_portal()#>>'{application,status}')='submitted');
  assert (select (public.rb_my_fighter_portal()#>>'{stats,total}')::int=0);
  assert (select jsonb_array_length(public.rb_my_fighter_portal()->'messages')=1);
  perform public.rb_submit_application_v2(gen_random_uuid(), 'Test', 'Quito', 'blue', 'gp', true,
    'Academy', null, null, '{"first_name":"Ana","last_name":"Test","country":"Ecuador","weight":58,"weight_unit":"kg","height":162,"height_unit":"cm","belt_stripes":2}'::jsonb);
  assert (select count(*)=1 from public.rb_my_profile_v2() where first_name='Ana' and weight=58 and belt_stripes=2);
  assert (select count(*)=1 from public.fighter_registrations
    where user_id=athlete and first_name='Ana' and last_name='Test' and
      realm='Zaphire Trials' and weight=58 and height=162 and
      registration_status='application_submitted' and payment_option is null);
  assert not has_table_privilege('authenticated','public.fighter_registrations','TRUNCATE');
  assert not has_table_privilege('anon','public.fighter_registrations','INSERT');

  begin
    perform public.rb_review_queue();
    raise exception 'Non-reviewer could read the queue';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rb_submit_application(request,'Changed','Quito','blue','lab',true);
    raise exception 'Changed retry was accepted';
  exception when unique_violation then null; end;
  begin
    perform public.rb_submit_application(gen_random_uuid(),'Test','Quito','unknown','gp',true);
    raise exception 'Invalid belt was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.rb_submit_application(gen_random_uuid(),'Test','Quito','white','gp',false);
    raise exception 'Missing consent was accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  assert (select count(*)=0 from public.rb_my_applications());
  assert (select count(*)=1 from public.rb_review_queue() where id=receipt);
  assert (select count(*)=1 from public.rb_review_queue_v2() where profile_snapshot->>'first_name'='Ana');
  assert public.rb_review_application(receipt,'submitted','in_review')='in_review';
  perform set_config('request.jwt.claim.sub',athlete::text,true);
  assert (select status='in_review' from public.rb_my_applications() where id=receipt);
  assert not has_function_privilege('anon','public.rb_my_applications()','execute');
  assert not has_function_privilege('anon','public.rb_my_fighter_portal()','execute');
  assert not has_function_privilege('authenticated','public.rb_claim_athlete_emails(uuid,integer)','execute');
  assert not has_schema_privilege('authenticated','rb_intake','CREATE');
end;
$$;
rollback;
