/* RA'AZ BORG private fighter portal. All data is scoped by auth.uid() in RPC. */
(() => {
  const $ = id => document.getElementById(id);
  const client = window.supabase.createClient(
    'https://iltuwbawjiwvuqqrkyiz.supabase.co',
    'sb_publishable_XkKZZHEZK5IEt0lv1-Kzqw_jV0PU3Nx',
    { auth: { storageKey:'raaz-athlete-session' } }
  );
  const tr = (es,en) => document.documentElement.lang === 'en' ? en : es;
  let user = null, snapshot = null, loadSeq = 0, initialized = false;

  const statuses = {
    submitted: {
      label:['Postulación pendiente','Application pending'],
      message:['Recibimos tu solicitud. El equipo RA’AZ BORG revisará tu perfil y te contactará directamente con los siguientes pasos. Aún no tienes un combate confirmado.',
               'We received your application. The RA’AZ BORG team will review your profile and contact you directly with the next steps. You do not have a confirmed fight yet.'],
      step:1
    },
    in_review: {
      label:['En revisión','Under review'],
      message:['Tu postulación está siendo revisada. Te contactaremos por correo cuando haya novedades.',
               'Your application is being reviewed. We will email you when there is an update.'],
      step:2
    },
    invited: {
      label:['Invitación enviada','Invitation sent'],
      message:['El equipo registró una invitación. Revisa tu correo para conocer los detalles y confirmar directamente con ellos.',
               'The team has marked an invitation as sent. Check your email for details and confirm directly with them.'],
      step:3
    },
    closed: {
      label:['Postulación cerrada','Application closed'],
      message:['Esta postulación está cerrada. Contacta al equipo si necesitas aclaraciones o deseas postularte nuevamente.',
               'This application is closed. Contact the team with any questions or to submit another application.'],
      step:0
    },
    none: {
      label:['Sin postulación','No application yet'],
      message:['Tu cuenta está lista, pero aún debes enviar una postulación para que el equipo pueda revisarte.',
               'Your account is ready, but you still need to submit an application for the team to review.'],
      step:0
    }
  };
  const interests = {
    gp:['Grand Prix','Grand Prix'],
    lab:['Börg Lab','Börg Lab'],
    both:['Grand Prix y Börg Lab','Grand Prix and Börg Lab']
  };
  const fightLabels = {
    win:['Victoria','Win'], loss:['Derrota','Loss'], draw:['Empate','Draw']
  };

  function visible(view) {
    $('portal-loading').hidden = view !== 'loading';
    $('portal-signin-required').hidden = view !== 'signin';
    $('portal-error').hidden = view !== 'error';
    $('portal-content').hidden = view !== 'content';
  }
  function when(date) {
    if (!date) return '—';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-EC', {
      year:'numeric',month:'short',day:'numeric'
    });
  }
  function put(id,value) { $(id).textContent = value == null || value === '' ? '—' : String(value); }
  function notifyEmailDelivery() {
    // Email delivery is optional until a verified sender/API key are configured server-side.
    // Never claim that an email was sent based on an invocation alone.
    if (client.functions?.invoke) {
      Promise.resolve(client.functions.invoke('athlete-notify', {body:{}})).catch(() => {});
    }
  }
  function renderStatus(application, realm) {
    const status = application?.status in statuses ? application.status : 'none';
    const state = statuses[status];
    const pill = $('application-status');
    pill.dataset.state = status;
    pill.textContent = tr(...state.label);
    $('status-description').textContent = tr(...state.message);
    const step = state.step;
    for (const [id,stage] of [['step-submitted',1],['step-review',2],['step-invited',3]]) {
      $(id).classList.toggle('done',step>stage);
      $(id).classList.toggle('current',step===stage);
    }
    put('application-realm',application?.realm||realm);
    put('application-date',when(application?.submitted_at));
    put('application-interest',application?.interest in interests ? tr(...interests[application.interest]) : null);
    put('application-receipt',application?.id ? application.id.slice(0,8).toUpperCase() : null);
  }
  function renderMessage(messages,application) {
    const first=(Array.isArray(messages)?messages:[]).find(m=>m?.kind==='welcome');
    $('welcome-message').hidden = !first;
    $('message-empty').hidden = !!first;
    put('welcome-date',when(first?.created_at));
    if (!first) return;
    const fighter = snapshot?.username || tr('atleta','fighter');
    $('welcome-copy').textContent = tr(
      '¡Bienvenido al universo Börg, '+fighter+'! Recibimos tu postulación. El equipo de RA’AZ BORG está revisando tu perfil y se pondrá en contacto contigo por correo con información sobre los próximos pasos. Tu postulación está pendiente y todavía no representa una confirmación de combate.',
      'Welcome to the Börg Realm, '+fighter+'! We received your application. The RA’AZ BORG team is reviewing your profile and will contact you by email with information about the next steps. Your application is pending and does not yet confirm a fight.'
    );
  }
  function renderRecord(stats) {
    const total=Math.max(0,Number(stats?.total)||0);
    const wins=Math.max(0,Number(stats?.wins)||0);
    const losses=Math.max(0,Number(stats?.losses)||0);
    const draws=Math.max(0,Number(stats?.draws)||0);
    put('totalFights',total?total:'—');
    put('fightWins',total?wins:'—');
    put('fightLosses',total?losses:'—');
    put('fightDraws',total?draws:'—');
    const donut=$('fightDonut');
    if (!total) {
      donut.style.background='conic-gradient(var(--portal-empty) 0% 100%)';
      put('winPercentage','—');
      donut.setAttribute('aria-label',tr('No hay combates registrados','No fights recorded'));
      $('record-caption').textContent=tr(
        'Aún no tienes combates registrados. El gráfico se mantiene gris hasta contar con resultados reales.',
        'No fights recorded yet. The chart stays grey until there are actual results.'
      );
      return;
    }
    const winPct=100*wins/total, lossPct=100*losses/total;
    const endLoss=winPct+lossPct;
    donut.style.background =
      'conic-gradient(var(--portal-win) 0% '+winPct+'%, '+
      'var(--portal-loss) '+winPct+'% '+endLoss+'%, '+
      'var(--portal-draw) '+endLoss+'% 100%)';
    put('winPercentage',Math.round(winPct)+'%');
    donut.setAttribute('aria-label',tr(
      total+' combates: '+wins+' victorias, '+losses+' derrotas, '+draws+' empates',
      total+' fights: '+wins+' wins, '+losses+' losses, '+draws+' draws'
    ));
    $('record-caption').textContent=tr(
      'Distribución de resultados registrados en tu cuenta.',
      'Distribution of results recorded for your account.'
    );
  }
  function renderFights(fights) {
    const list=$('fightList');
    list.replaceChildren();
    const rows=Array.isArray(fights)?fights:[];
    $('emptyFightMessage').hidden=rows.length>0;
    for (const fight of rows) {
      const row=document.createElement('div');
      row.className='portal-fight-row';
      const details=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=fight.opponent||tr('Rival sin registrar','Opponent unavailable');
      const more=document.createElement('small');
      more.textContent=[when(fight.date),fight.method].filter(x=>x&&x!=='—').join(' · ');
      details.append(name,more);
      const result=document.createElement('strong');
      result.className='portal-fight-result '+(fight.result||'');
      result.textContent=tr(...(fightLabels[fight.result]||['—','—']));
      row.append(details,result);
      list.append(row);
    }
  }
  function render() {
    if (!snapshot || !user) return;
    const p=snapshot;
    const display=p.username||p.name||tr('Atleta','Fighter');
    put('fighterDisplayName',display);
    put('fighterName',p.name);
    put('fighterUsername',p.username?'@'+p.username:null);
    put('fighterRealm',p.realm);
    put('fighterCountry',p.country);
    put('fighterGym',p.gym);
    put('fighterRank',p.belt);
    put('fighterWeight',p.weight ? p.weight+' '+(p.weight_unit||'') : null);
    const letters=display.trim().split(/\s+/).map(s=>s.charAt(0)).slice(0,2).join('');
    put('fighter-avatar',(letters||'RB').toUpperCase());
    $('portal-submitted-confirmation').hidden = new URLSearchParams(location.search).get('submitted') !== '1';
    renderStatus(p.application,p.realm);
    renderMessage(p.messages,p.application);
    renderRecord(p.stats);
    renderFights(p.recent_fights);
    visible('content');
  }
  async function load() {
    if (!user) { visible('signin'); return; }
    const seq=++loadSeq, owner=user.id;
    visible('loading');
    try {
      const {data,error}=await client.rpc('rb_my_fighter_portal');
      if (seq!==loadSeq || !user || user.id!==owner) return;
      if(error || !data) { visible('error'); return; }
      snapshot=data;
      render();
      notifyEmailDelivery();
    } catch {
      if (seq===loadSeq) visible('error');
    }
  }
  function onSession(session) {
    const next=session?.user||null;
    const changed=!initialized || next?.id!==user?.id;
    initialized=true;
    user=next;
    if(!next){snapshot=null;++loadSeq;visible('signin');return;}
    if(changed)load();
  }
  $('portal-refresh').onclick=load;
  $('portal-logout').onclick=async()=>{
    try { await client.auth.signOut({scope:'local'}); }
    finally {location.assign('competir.html?lang='+document.documentElement.lang);}
  };
  document.addEventListener('languagechange',render);
  client.auth.onAuthStateChange((event,session)=>onSession(session));
  client.auth.getSession().then(({data})=>onSession(data?.session)).catch(()=>visible('signin'));
})();
