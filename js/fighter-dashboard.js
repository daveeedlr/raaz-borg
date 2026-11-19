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
  let photoSeq = 0, priorEditing = false, uploadingPhoto = false;
  const languagePreference = window.RaazAthleteLanguage.connect(client, () => user, (lang, saved) => {
    if (snapshot) {
      snapshot.preferred_language = lang;
      render();
    }
    if ($('emailLanguageSaving')) {
      $('emailLanguageSaving').textContent = saved ? '' :
        (document.documentElement.lang === 'en' ? ' · Saving…' : ' · Guardando…');
    }
  });

  const statuses = {
    submitted: {
      label:['Registro pendiente de revisión','Roster registration pending review'],
      message:['Ya perteneces al registro de peleadores. El equipo RA’AZ BORG revisará tus datos para considerar tu incorporación al roster activo. Aún no tienes un combate confirmado.',
               'Your one-time fighter registration has been saved. The RA’AZ BORG team will review your details for the active roster. You do not have a confirmed fight yet.'],
      step:1
    },
    in_review: {
      label:['Registro en revisión','Registration under review'],
      message:['Tu registro está siendo revisado. Te contactaremos por correo cuando haya novedades.',
               'Your roster registration is being reviewed. We will email you when there is an update.'],
      step:2
    },
    invited: {
      label:['Invitación enviada','Invitation sent'],
      message:['El equipo registró una invitación. Revisa tu correo para conocer los detalles y confirmar directamente con ellos.',
               'The team has marked an invitation as sent. Check your email for details and confirm directly with them.'],
      step:3
    },
    closed: {
      label:['Registro cerrado','Registration closed'],
      message:['La revisión de tu registro está cerrada. Tu perfil personal sigue disponible. Contacta al equipo si necesitas aclaraciones.',
               'The review of this roster registration is closed. Your personal portal remains available; contact the team with questions.'],
      step:0
    },
    none: {
      label:['Registro incompleto','Registration incomplete'],
      message:['Tu cuenta está activa. Debes completar tu inscripción al roster una sola vez.',
               'Your account is active. Complete the one-time roster registration to join the review process.'],
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
      '¡Bienvenido al universo Börg, '+fighter+'! Recibimos tu inscripción al roster de peleadores. El equipo de RA’AZ BORG revisará tus datos y se pondrá en contacto contigo con los próximos pasos. Tu registro está pendiente y todavía no confirma un combate.',
      'Welcome to the Börg Realm, '+fighter+'! Your one-time fighter roster registration was received. The RA’AZ BORG team will review your details and contact you about the next steps. Your registration is pending and does not yet confirm a fight.'
    );
  }
  function renderAcknowledgement(ack) {
    const confirmed=!!ack?.acknowledged_at;
    $('acknowledgement-message').hidden=!confirmed;
    $('roster-acknowledged-status').hidden=!confirmed;
    if(!confirmed) return;
    put('acknowledgement-date',when(ack.acknowledged_at));
    $('message-empty').hidden=true;
    $('acknowledgement-copy').textContent=tr(
      'El equipo de RA’AZ BORG confirma que ha recibido y revisado tu inscripción al roster. Te mantendremos informado sobre los siguientes pasos. Si se programa un combate para ti, te notificaremos el nombre de tu rival, la fecha y el lugar. Por ahora no tienes un combate confirmado.',
      'The RA’AZ BORG team confirms that your roster registration has been received and reviewed. We will keep you informed of the next steps. If a fight is scheduled for you, we will notify you of your opponent, the date and the location. No fight is confirmed yet.'
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
        'Todavía no se han registrado resultados individuales de combates aquí. El gráfico permanece gris; tu historial previo declarado aparece en Identidad del atleta.',
        'No fight-by-fight results have been recorded here yet. The donut stays grey; your self-reported previous record appears under Athlete Identity.'
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
  function renderPrior(prior) {
    for (const [id,key] of [['priorCompeted','competed'],['priorWon','won'],['priorLost','lost'],['priorDrawn','drawn']]) {
      put(id,prior && prior[key] != null ? prior[key] : null);
    }
    if (!priorEditing) {
      for (const [id,key] of [['edit-prior-competed','competed'],['edit-prior-won','won'],
                               ['edit-prior-lost','lost'],['edit-prior-drawn','drawn']]) {
        $(id).value=prior && prior[key]!=null ? String(prior[key]) : '';
      }
    }
  }
  function parsePriorForm() {
    const keys=[['competed','edit-prior-competed'],['won','edit-prior-won'],
                ['lost','edit-prior-lost'],['drawn','edit-prior-drawn']];
    const values=keys.map(([,id])=>$(id).value.trim());
    if(values.every(v=>v==='')) return null;
    if(values.some(v=>!/^[0-9]{1,4}$/.test(v) || Number(v)>5000)) throw Error('Invalid totals');
    const record=Object.fromEntries(keys.map(([key],i)=>[key,Number(values[i])]));
    if(record.won+record.lost+record.drawn>record.competed)throw Error('Outcomes exceed total');
    return record;
  }
  function feedback(id,es,en){$(id).textContent=tr(es,en);}
  async function renderAvatar(path){
    const seq=++photoSeq, owner=user?.id;
    $('fighter-photo').hidden=true;
    $('fighter-avatar').hidden=false;
    $('portal-photo-remove').hidden=!path;
    if(!path)return;
    try{
      const url=await window.RaazAvatar.display(client,path);
      if(seq!==photoSeq || !user || user.id!==owner || snapshot?.avatar_path!==path)return;
      const image=$('fighter-photo');
      image.onload=()=>{if(seq===photoSeq){image.hidden=false;$('fighter-avatar').hidden=true;}};
      image.onerror=()=>{image.hidden=true;$('fighter-avatar').hidden=false;};
      image.src=url;
    }catch{
      if(seq===photoSeq)feedback('portal-photo-feedback',
        'No pudimos cargar la foto. Actualiza el estado o intenta subirla de nuevo.',
        'Could not load the photo. Refresh or upload a new image.');
    }
  }
  async function savePhoto() {
    if(uploadingPhoto || !user || !snapshot?.application)return;
    const file=$('portal-photo-input').files?.[0];
    if(!file) {
      feedback('portal-photo-feedback','Selecciona primero una foto.','Choose a photo first.');
      return;
    }
    try{ window.RaazAvatar.validate(file); }
    catch {
      feedback('portal-photo-feedback','Usa JPG, PNG o WebP de menos de 2 MB.','Use JPG, PNG or WebP under 2 MB.');
      return;
    }
    uploadingPhoto=true;
    $('portal-photo-save').disabled=true;
    feedback('portal-photo-feedback','Guardando tu foto privada…','Saving your private photo…');
    const owner=user.id,original=snapshot.avatar_path;
    try{
      const path=await window.RaazAvatar.upload(client,user,file,original);
      if(!user || user.id!==owner)return;
      snapshot.avatar_path=path;
      $('portal-photo-input').value='';
      feedback('portal-photo-feedback','Foto guardada de forma privada. No se publicará automáticamente.',
        'Photo saved privately. It will not be published automatically.');
      renderAvatar(path);
    }catch{
      feedback('portal-photo-feedback','No se pudo guardar la foto. Inténtalo de nuevo.',
        'Could not save your photo. Try again.');
    }finally{uploadingPhoto=false;$('portal-photo-save').disabled=false;}
  }
  function render() {
    if (!snapshot || !user) return;
    const p=snapshot;
    const display=p.username||p.name||tr('Atleta','Fighter');
    put('fighterDisplayName',display);
    put('fighterName',p.name);
    put('fighterUsername',p.username?'@'+p.username:null);
    put('emailLanguageValue',p.preferred_language==='en'
      ? tr('Inglés','English') : tr('Español','Spanish'));
    put('fighterFirstName',p.first_name);
    put('fighterLastName',p.last_name);
    put('fighterAlias',p.alias);
    put('fighterBirthDate',p.date_of_birth ? p.date_of_birth : null);
    put('fighterRealm',p.realm);
    put('fighterCountry',p.country);
    put('fighterProvince',p.state_province);
    put('fighterCity',p.city);
    put('fighterDiscipline',p.discipline);
    put('fighterGym',p.gym);
    put('fighterRank',p.belt);
    put('fighterStripes',p.belt_stripes != null ? p.belt_stripes : null);
    put('fighterWeight',p.weight ? p.weight+' '+(p.weight_unit||'') : null);
    put('fighterHeight',p.height ? p.height+' '+(p.height_unit||'') : null);
    const letters=display.trim().split(/\s+/).map(s=>s.charAt(0)).slice(0,2).join('');
    put('fighter-avatar',(letters||'RB').toUpperCase());
    renderAvatar(p.avatar_path);
    renderPrior(p.prior_record);
    if (new URLSearchParams(location.search).get('photo')==='retry') {
      feedback('portal-photo-feedback',
        'Tu registro se guardó, pero la foto no pudo subirse. Puedes intentarlo aquí.',
        'Your roster registration was saved, but the photo did not upload. Retry here.');
    }
    $('portal-submitted-confirmation').hidden = new URLSearchParams(location.search).get('submitted') !== '1';
    renderStatus(p.application,p.realm);
    renderMessage(p.messages,p.application);
    renderAcknowledgement(p.acknowledgement);
    renderRecord(p.stats);
    renderFights(p.recent_fights);
    visible('content');
  }
  async function load() {
    if (!user) { visible('signin'); return; }
    const seq=++loadSeq, owner=user.id;
    visible('loading');
    try {
      const [main,ack] = await Promise.all([
        client.rpc('rb_my_fighter_portal'),
        client.rpc('rb_my_acknowledgement')
      ]);
      if (seq!==loadSeq || !user || user.id!==owner) return;
      const {data,error}=main;
      if(error || !data) { visible('error'); return; }
      if(!data.application) {
        // An authenticated account without a roster registration must finish
        // its first-time registration before entering the fighter portal.
        location.replace('competir.html?lang='+document.documentElement.lang);
        return;
      }
      snapshot={...data,acknowledgement:ack.error ? null : (ack.data || null)};
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
    if(!next){snapshot=null;++loadSeq;++photoSeq;visible('signin');return;}
    if(changed) {
      void languagePreference.restore();
      void load();
    }
  }
  $('portal-refresh').onclick=load;
  $('portal-photo-save').onclick=savePhoto;
  $('portal-photo-remove').onclick=async()=>{
    if(!user || !snapshot || uploadingPhoto || !snapshot.avatar_path)return;
    const old=snapshot.avatar_path;
    $('portal-photo-remove').disabled=true;
    try {
      await window.RaazAvatar.remove(client,user,old);
      snapshot.avatar_path=null;
      $('fighter-photo').removeAttribute('src');
      renderAvatar(null);
      feedback('portal-photo-feedback','Foto eliminada del perfil privado.','Private photo removed.');
    }catch {
      feedback('portal-photo-feedback','No se pudo eliminar la foto.','Could not remove the photo.');
    }finally{$('portal-photo-remove').disabled=false;}
  };
  $('portal-prior-edit-toggle').onclick=()=>{
    priorEditing=!priorEditing;
    $('portal-prior-form').hidden=!priorEditing;
    if(priorEditing) {
      const record=snapshot?.prior_record || null;
      for(const [id,key] of [['edit-prior-competed','competed'],['edit-prior-won','won'],
                             ['edit-prior-lost','lost'],['edit-prior-drawn','drawn']]) {
        $(id).value=record && record[key]!=null ? String(record[key]) : '';
      }
      $('edit-prior-competed').focus();
    } else {
      feedback('portal-prior-feedback','','');
    }
  };
  $('portal-prior-form').onsubmit=async e=>{
    e.preventDefault();
    if(!user || !snapshot?.application)return;
    let prior;
    try{prior=parsePriorForm();}
    catch{
      feedback('portal-prior-feedback',
        'Completa los cuatro números o deja todos vacíos. Los resultados no pueden superar los combates.',
        'Enter all four numbers or leave all blank. Results cannot exceed fights competed.');
      return;
    }
    $('portal-prior-save').disabled=true;
    feedback('portal-prior-feedback','Guardando…','Saving…');
    try {
      const owner=user.id;
      const {data,error}=await client.rpc('rb_update_roster_prior',{p_prior:prior});
      if(error)throw error;
      if(!user || owner!==user.id)return;
      snapshot.prior_record=data ?? null;
      priorEditing=false;
      $('portal-prior-form').hidden=true;
      renderPrior(snapshot.prior_record);
    }catch {
      feedback('portal-prior-feedback','No pudimos guardar el historial anterior.','Could not save the previous record.');
    }finally{$('portal-prior-save').disabled=false;}
  };
  $('portal-logout').onclick=async()=>{
    try { await client.auth.signOut({scope:'local'}); }
    finally {location.assign('competir.html?lang='+document.documentElement.lang);}
  };
  document.addEventListener('languagechange',render);
  client.auth.onAuthStateChange((event,session)=>onSession(session));
  client.auth.getSession().then(({data})=>onSession(data?.session)).catch(()=>visible('signin'));
})();
