-- Run against an isolated test database as postgres. All fixture data rolls back.
begin;
do $$
declare
  athlete uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  request uuid := gen_random_uuid();
  receipt uuid;
  receipt_ack jsonb;
  ack_email jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (athlete, athlete::text || '@example.invalid',now()),
    (other_user, other_user::text || '@example.invalid',now());
  assert (select count(*)=2 from public.fighter_registrations
    where user_id in (athlete, other_user) and registration_status='account_created');
  -- Custom email transports are paused, but the application trigger still persists alerts.
  assert position('net.http_post' in
      pg_get_functiondef('rb_intake.rb_notify_roster_insert()'::regprocedure))=0;
  assert (select count(*)=2 from public.fighter_registrations
    where first_name is null and payment_option is null);
  update auth.users set email_confirmed_at=null where id=athlete;
  assert (select email_verified=false from public.fighter_registrations where user_id=athlete);
  update auth.users set email_confirmed_at=now() where id=athlete;
  assert (select email_verified=true from public.fighter_registrations where user_id=athlete);
  insert into rb_intake.reviewers values(other_user);
  assert (select preferred_language='es' from rb_intake.athlete_language_preferences where athlete_id=athlete);
  perform set_config('request.jwt.claim.sub',athlete::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',athlete,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  set local role authenticated;
  assert public.rb_queue_sign_in_alert() is true;
  assert public.rb_queue_sign_in_alert() is true;
  assert public.rb_my_language()='es';
  assert public.rb_set_language('en')='en';
  assert public.rb_my_language()='en';
  begin
    perform public.rb_set_language('fr');
    raise exception 'Invalid notification language was accepted';
  exception when invalid_parameter_value then null; end;
  receipt := public.rb_submit_application(request,'Test','Quito','white','gp',true);
  assert receipt = public.rb_submit_application(request,'Test','Quito','white','gp',true);
  assert (select count(*)=1 from public.rb_my_applications() where suggested_realm='White Carbon Combat');
  assert (select (public.rb_my_fighter_portal()#>>'{application,status}')='submitted');
  assert (select (public.rb_my_fighter_portal()#>>'{stats,total}')::int=0);
  assert (select jsonb_array_length(public.rb_my_fighter_portal()->'messages')=1);
  assert (public.rb_my_fighter_portal()->>'preferred_language')='en';
  assert public.rb_my_acknowledgement() is null;
  begin
    perform public.rb_acknowledge_roster(receipt);
    raise exception 'Non-reviewer acknowledged a roster registration';
  exception when insufficient_privilege then null; end;
  perform public.rb_submit_application_v2(gen_random_uuid(), 'Test', 'Quito', 'blue', 'gp', true,
    'Academy', null, null, '{"first_name":"Ana","last_name":"Test","country":"Ecuador","weight":58,"weight_unit":"kg","height":162,"height_unit":"cm","belt_stripes":2}'::jsonb);
  assert (select count(*)=1 from public.rb_my_profile_v2() where first_name='Ana' and weight=58 and belt_stripes=2);
  assert (public.rb_my_fighter_portal()->>'preferred_language')='en';
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
  receipt_ack:=public.rb_acknowledge_roster(receipt);
  assert receipt_ack->>'email_state'='pending';
  assert public.rb_acknowledge_roster(receipt)=receipt_ack;
  assert (select count(*)=1 from public.rb_review_queue_v3()
    where id=receipt and acknowledged_at is not null and ack_email_state='pending');
  ack_email:=public.rb_claim_ack_email(receipt);
  assert ack_email->>'preferred_language'='en';
  assert ack_email->>'email'=athlete::text||'@example.invalid';
  assert ack_email->>'realm'='White Carbon Combat';
  assert public.rb_claim_ack_email(receipt) is null;
  assert public.rb_finish_ack_email(receipt,true,null);
  assert public.rb_claim_ack_email(receipt) is null;
  assert public.rb_review_application(receipt,'submitted','in_review')='in_review';
  -- The second confirmed user joins the roster exactly once, with self-reported history.
  declare
    v_roster_id uuid;
  begin
    v_roster_id := public.rb_register_roster(gen_random_uuid(),'QA Fighter','Quito','blue','gp',true,
      'Test Academy',null,null,
      '{"first_name":"Q","last_name":"Fighter","username":"roster_qa","country":"Ecuador"}'::jsonb,
      '{"competed":8,"won":5,"lost":2,"drawn":1}'::jsonb);
    assert v_roster_id=public.rb_register_roster(gen_random_uuid(),'Different','Quito','white','lab',true,
      null,null,null,'{"first_name":"Different","last_name":"Fighter","country":"Ecuador"}'::jsonb,null);
    assert (select (public.rb_my_fighter_portal()#>>'{prior_record,competed}')::int=8);
    assert (select (public.rb_my_fighter_portal()#>>'{prior_record,won}')::int=5);
    assert (select prior_competed=8 and prior_won=5 and prior_lost=2 and prior_drawn=1
      from public.fighter_registrations where user_id=other_user);
    begin
      perform public.rb_update_roster_prior('{"competed":3,"won":2,"lost":2,"drawn":0}'::jsonb);
      raise exception 'Invalid previous fight record accepted';
    exception when invalid_parameter_value then null; end;
    perform public.rb_update_roster_prior('{"competed":2,"won":2,"lost":0,"drawn":0}'::jsonb);
    assert (select (public.rb_my_fighter_portal()#>>'{prior_record,competed}')::int=2);
    begin
      perform public.rb_set_roster_avatar('someone-else/avatar.webp');
      raise exception 'Unowned avatar accepted';
    exception when insufficient_privilege then null; end;
    assert not has_function_privilege('anon',
      'public.rb_register_roster(uuid,text,text,text,text,boolean,text,text,text,jsonb,jsonb)','execute');
    assert not has_function_privilege('anon','public.rb_set_roster_avatar(text)','execute');
  end;
  perform set_config('request.jwt.claim.sub',athlete::text,true);
  assert (select status='in_review' from public.rb_my_applications() where id=receipt);
  assert public.rb_my_acknowledgement()->>'email_state'='sent';
  assert not has_function_privilege('anon','public.rb_acknowledge_roster(uuid)','execute');
  -- Signup can carry a preference even before the athlete joins the roster.
  declare v_language_user uuid:=gen_random_uuid();
  begin
    reset role;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values(v_language_user,v_language_user::text||'@example.invalid',now(),
        '{"preferred_language":"en"}'::jsonb);
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',v_language_user::text,true);
    assert public.rb_my_language()='en';
    perform set_config('request.jwt.claim.sub',athlete::text,true);
  end;
  assert not has_function_privilege('anon','public.rb_set_language(text)','execute');
  assert not has_function_privilege('anon','public.rb_my_language()','execute');
  assert not has_function_privilege('authenticated','public.rb_notification_language(uuid)','execute');
  assert not has_function_privilege('anon','public.rb_my_applications()','execute');
  assert not has_function_privilege('anon','public.rb_my_fighter_portal()','execute');
  assert not has_function_privilege('authenticated','public.rb_claim_athlete_emails(uuid,integer)','execute');
  assert not has_schema_privilege('authenticated','rb_intake','CREATE');
end;
$$;
rollback;
