(() => {
  const $ = id => document.getElementById(id);
  const client = window.supabase.createClient('https://iltuwbawjiwvuqqrkyiz.supabase.co', 'sb_publishable_XkKZZHEZK5IEt0lv1-Kzqw_jV0PU3Nx', {
    auth: { storageKey: 'raaz-athlete-session' }
  });
  const form = $('application');
  const belt = $('belt');
  const interest = $('interest');
  const tr = (es, en) => document.documentElement.lang === 'en' ? en : es;
  let user = null;
  let signingUp = true;
  let recovering = false;
  let busy = false;
  let message = [];
  let messageKind = 'info';
  let historyRows = null;
  let checkingRoster = false;
  let loadNumber = 0;
  let requestKey = null;
  const initial = new URL(location.href);

  for (const field of [belt, interest]) {
    const selected = initial.searchParams.get(field.name);
    if (Array.from(field.options).some(option => option.value === selected)) field.value = selected;
    field.addEventListener('change', () => {
      const url = new URL(location.href);
      if (field.value) url.searchParams.set(field.name, field.value);
      else url.searchParams.delete(field.name);
      history.replaceState(null, '', url);
      showRealm();
    });
  }
  function showRealm() {
    const realm = belt.selectedOptions[0]?.dataset.realm;
    $('belt-realm').textContent = realm || '';
    $('belt-assigned').hidden = !realm;
    $('belt-review').hidden = !belt.value || !!realm;
  }
  function say(es, en, kind = 'info') {
    message = [es, en];
    messageKind = kind;
    const feedback = $('feedback');
    feedback.dataset.state = kind;
    feedback.textContent = tr(es, en);
    if (kind === 'error' || kind === 'success') {
      feedback.scrollIntoView({block:'center', behavior:'smooth'});
    }
  }
  function fighterDashboardUrl(submitted = false) {
    const url = new URL('fighter-dashboard.html', location.href);
    url.searchParams.set('lang', document.documentElement.lang);
    if (submitted) url.searchParams.set('submitted', '1');
    return url.href;
  }
  function render() {
    $('account').hidden = !!user;
    $('member').hidden = !user || recovering || checkingRoster;
    form.hidden = !user || recovering || checkingRoster || historyRows === null || historyRows.length > 0;
    $('athlete-interest').hidden = !!user && (checkingRoster || (Array.isArray(historyRows) && historyRows.length > 0));
    $('reset-password').hidden = !recovering || !user;
    $('identity').textContent = user?.email || '';
    $('primary-auth').textContent = signingUp ? tr('Crear cuenta','Create account') : tr('Iniciar sesión','Sign in');
    $('auth-create').setAttribute('aria-pressed', String(signingUp));
    $('auth-signin').setAttribute('aria-pressed', String(!signingUp));
    $('auth-explainer').textContent = signingUp
      ? tr('Usa un correo al que tengas acceso. Confírmalo para completar tu inscripción al roster una sola vez.',
           'Use an email address you can access. Confirm it to complete your one-time roster registration.')
      : tr('Ingresa para terminar tu inscripción al roster o abrir tu portal de peleador.',
           'Sign in to finish joining the roster or open your fighter portal.');
    $('recover').hidden = signingUp;
    $('password').autocomplete = signingUp ? 'new-password' : 'current-password';
    $('password').minLength = signingUp ? 8 : 1;
    $('feedback').dataset.state = messageKind;
    $('feedback').textContent = message.length ? tr(...message) : '';
    drawHistory();
  }
  const statuses = {submitted:['Registro recibido','Registration received'],in_review:['Roster en revisión','Roster under review'],invited:['Invitación enviada','Invitation sent'],closed:['Registro cerrado','Registration closed']};
  function drawHistory() {
    const box = $('receipts');
    box.replaceChildren();
    if (!user || !historyRows) return;
    if (!historyRows.length) box.textContent = tr('Tu cuenta está activa. Completa los datos del roster una sola vez y entrarás a tu portal de peleador.','Your account is active. Complete the one-time roster details to open your fighter portal.');
    for (const row of historyRows) {
      const entry = document.createElement('article');
      const option = Array.from(interest.options).find(o => o.value === row.interest);
      const title = document.createElement('strong');
      title.textContent = [option?.textContent, row.suggested_realm].filter(Boolean).join(' · ');
      const details = document.createElement('p');
      details.textContent = new Date(row.submitted_at).toLocaleDateString(document.documentElement.lang) + ' · ' + tr(...(statuses[row.status] || ['Estado pendiente de confirmar','Status pending confirmation']));
      const receipt = document.createElement('small');
      receipt.textContent = tr('Comprobante','Receipt') + ' · ' + row.id;
      entry.append(title, details, receipt);
      box.append(entry);
    }
  }
  async function load(profile) {
    const seq = ++loadNumber;
    const [rows, info] = await Promise.all([client.rpc('rb_my_applications'), profile ? client.rpc('rb_my_profile_v2') : null]);
    if (seq !== loadNumber || !user) return;
    if (rows.error) {
      checkingRoster = false;
      historyRows = null;
      say('No pudimos comprobar tu registro. Actualiza el estado antes de continuar.','Could not verify your roster registration. Refresh your status before continuing.','error');
      render();
      return;
    }
    historyRows = Array.isArray(rows.data) ? rows.data : [];
    if (historyRows.length) {
      checkingRoster = false;
      // Existing roster members must never see the new-registration form again.
      location.replace(fighterDashboardUrl());
      return;
    }
    if (info?.error) say('No pudimos cargar todo tu perfil.','Could not load all profile details.','error');
    if (info?.data?.[0]) {
      const saved = info.data[0];
      for (const name of ['alias','city','academy','discipline','first_name','last_name','date_of_birth','weight','height','belt_stripes','country','state_province','username']) {
        if (name === 'country' ? Boolean(saved[name]) : !form.elements[name].value) form.elements[name].value = saved[name] || '';
      }
      for (const unit of ['weight_unit','height_unit']) {
        if (saved[unit]) form.elements[unit].value = saved[unit];
      }
      if (!belt.value && !initial.searchParams.has('belt')) belt.value = saved.belt;
      showRealm();
    }
    checkingRoster = false;
    render();
    drawHistory();
  }
  client.auth.onAuthStateChange((event, session) => {
    const next = session?.user || null;
    const changed = user?.id !== next?.id;
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    if (!next) recovering = false;
    if (changed) {
      ++loadNumber;
      const choices = [belt.value, interest.value];
      form.reset();
      [belt.value, interest.value] = choices;
      showRealm();
      historyRows = requestKey = null;
      checkingRoster = !!next;
      message = [];
      messageKind = 'info';
      $('password').value = '';
    }
    user = next;
    render();
    // SIGNED_IN may precede resolution of signInWithPassword().
    // Queue once per actual Auth session; the database rejects duplicate session alerts.
    if (event === 'SIGNED_IN' && next) {
      setTimeout(() => {
        if (user?.id === next.id) client.rpc('rb_queue_sign_in_alert').catch(() => {});
      }, 0);
    }
    if (changed && user) setTimeout(() => { if (user) load(true); }, 0);
  });
  function callbackUrl() {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('lang', document.documentElement.lang);
    if (belt.value) url.searchParams.set('belt', belt.value);
    if (interest.value) url.searchParams.set('interest', interest.value);
    return url.href;
  }
  async function action(button, run) {
    if (busy) return;
    busy = button.disabled = true;
    try { await run(); }
    catch { say('No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.','Could not complete the request. Check your connection and try again.','error'); }
    finally { busy = button.disabled = false; }
  }
  function chooseAuthMode(signUp) {
    if (signingUp === signUp) return;
    signingUp = signUp;
    message = [];
    messageKind = 'info';
    $('password').value = '';
    render();
    $('email').focus();
  }
  $('auth-create').onclick = () => chooseAuthMode(true);
  $('auth-signin').onclick = () => chooseAuthMode(false);
  $('account').onsubmit = event => {
    event.preventDefault();
    action($('primary-auth'), async () => {
      const credentials = {email:$('email').value.trim(), password:$('password').value};
      const result = signingUp
        ? await client.auth.signUp({...credentials, options:{emailRedirectTo:callbackUrl()}})
        : await client.auth.signInWithPassword(credentials);
      if (result.error) {
        if (result.error.status === 429) say('Demasiados intentos. Espera un momento.','Too many attempts. Please wait a moment.','error');
        else if (signingUp) say('No se pudo completar el registro. Verifica los datos; si ya registraste ese correo, pulsa Ya tengo cuenta o recupera tu contraseña.','Could not complete registration. Check your details; if you already registered this email, choose I have an account or recover your password.','error');
        else say('No pudimos iniciar sesión. Revisa correo y contraseña o pulsa ¿Olvidaste tu contraseña? para recuperar el acceso.','Could not sign in. Check your email and password or select Forgot your password? to recover access.','error');
      } else if (!result.data.session) {
        signingUp = false;
        render();
        say('Si es una cuenta nueva, revisa el correo para confirmar tu dirección. Si ese correo ya estaba registrado, inicia sesión o recupera tu contraseña.','If this is a new account, check your email for a confirmation link. If you already registered this address, sign in or use password recovery.','success');
      } else if (!signingUp && result.data?.session) {
        // One security notification per genuine Auth session, queued on the server.
        // An email is only delivered when a verified email provider is configured.
        await client.rpc('rb_queue_sign_in_alert').catch(() => {});
        say('¡Sesión iniciada! Verificando tu inscripción al roster.','Signed in! Checking your roster registration.','success');
        const {data:applications,error:applicationsError} = await client.rpc('rb_my_applications');
        if (!applicationsError && Array.isArray(applications) && applications.length) {
          location.replace(fighterDashboardUrl());
        } else {
          say('¡Bienvenido! Completa tu inscripción al roster una sola vez para abrir tu portal personal.',
              'Welcome! Complete your one-time roster registration to open your personal portal.','success');
        }
      }
    });
  };
  $('recover').onclick = () => {
    if (!$('email').reportValidity()) return;
    action($('recover'), async () => {
      const {error} = await client.auth.resetPasswordForEmail($('email').value.trim(), {redirectTo:callbackUrl()});
      if (error) throw error;
      say('Si la cuenta existe, recibirás un enlace para cambiar la contraseña.','If the account exists, you will receive a password reset link.','success');
    });
  };
  $('reset-password').onsubmit = event => {
    event.preventDefault();
    action(event.target.querySelector('button'), async () => {
      const field = event.target.querySelector('input');
      const {error} = await client.auth.updateUser({password:field.value});
      if (error) throw error;
      field.value = ''; recovering = false; render();
      say('Contraseña actualizada.','Password updated.','success');
    });
  };
  $('logout').onclick = () => action($('logout'), async () => {
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) throw error;
  });
  $('refresh').onclick = () => action($('refresh'), () => load(true));
  form.onsubmit = event => {
    event.preventDefault();
    if (!user || recovering || checkingRoster || historyRows === null || historyRows.length > 0) return;
    if (!belt.reportValidity() || !interest.reportValidity()) {
      say('Selecciona tu cinturón y cómo deseas participar antes de continuar.','Choose your belt and how you want to participate before continuing.','error');
      return;
    }
    action($('submit-application'), async () => {
      const owner = user.id;
      const data = new FormData(form);
      const payload = {p_belt:belt.value,p_interest:interest.value,p_contact_consent:form.elements.contact.checked};
      for (const name of ['alias','city','academy','discipline','footage']) {
        payload[name === 'footage' ? 'p_footage_url' : 'p_'+name] = data.get(name).trim() || null;
      }
      const profile = {};
      for (const name of ['first_name','last_name','date_of_birth','country','state_province','username','belt_stripes','weight','height']) {
        profile[name] = String(data.get(name) || '').trim() || null;
      }
      profile.weight_unit = profile.weight ? data.get('weight_unit') : null;
      profile.height_unit = profile.height ? data.get('height_unit') : null;
      for (const name of ['first_name','last_name','country']) {
        if (!profile[name]) {
          say('Completa tu nombre, apellido y país para continuar.','Enter your first name, last name and country to continue.','error');
          form.elements[name].focus();
          return;
        }
      }
      payload.p_profile = profile;
      const priorNames = ['prior_competed','prior_won','prior_lost','prior_drawn'];
      const priorValues = priorNames.map(name => form.elements[name].value.trim());
      $('prior-validation').hidden = true;
      if (priorValues.some(v => v !== '')) {
        if (priorValues.some(v => v === '') ||
            priorValues.some(v => !/^\d{1,4}$/.test(v) || Number(v) > 5000) ||
            Number(priorValues[1]) + Number(priorValues[2]) + Number(priorValues[3]) > Number(priorValues[0])) {
          const warning = $('prior-validation');
          warning.hidden = false;
          warning.textContent = tr(
            'Completa los cuatro valores (usa 0 si corresponde) y asegúrate de que ganados + perdidos + empates no superen los combates disputados.',
            'Complete all four totals (use 0 when appropriate). Wins + losses + draws cannot exceed fights competed.'
          );
          warning.scrollIntoView({block:'center'});
          return;
        }
        payload.p_prior = {
          competed:Number(priorValues[0]),won:Number(priorValues[1]),
          lost:Number(priorValues[2]),drawn:Number(priorValues[3])
        };
      } else payload.p_prior = null;
      const photo = form.elements.roster_photo.files?.[0] || null;
      if (photo) {
        try { window.RaazAvatar.validate(photo); }
        catch {
          say('La foto debe ser JPG, PNG o WebP y pesar menos de 2 MB.',
              'Photo must be JPG, PNG or WebP and smaller than 2 MB.','error');
          return;
        }
      }
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).join('.');
      const storage = 'rb-application-retry-'+owner;
      try { requestKey = JSON.parse(sessionStorage.getItem(storage)) || requestKey; } catch {}
      if (requestKey?.fingerprint !== fingerprint) requestKey = {fingerprint,id:crypto.randomUUID()};
      try { sessionStorage.setItem(storage,JSON.stringify(requestKey)); } catch {}
      const {data:id,error} = await client.rpc('rb_register_roster',{...payload,p_request_id:requestKey.id});
      if (user?.id !== owner) return;
      if (error || !id) throw error || new Error('Missing receipt');
      form.elements.contact.checked = false;
      checkingRoster = false;
      historyRows = [{id}];
      let photoFailed = false;
      if (photo && user?.id === owner) {
        say('Registro guardado. Guardando tu foto privada…','Roster saved. Uploading your private photo…','success');
        try { await window.RaazAvatar.upload(client,user,photo); }
        catch { photoFailed = true; }
      }
      if (user?.id !== owner) return;
      say(
        '¡Registro al roster completado! Abriendo tu portal personal.',
        'Roster registration complete! Opening your personal fighter portal.',
        'success'
      );
      const target = new URL(fighterDashboardUrl(true));
      if (photoFailed) target.searchParams.set('photo','retry');
      location.replace(target.href);
    });
  };
  document.addEventListener('languagechange', render);
  showRealm();
  render();
})();
