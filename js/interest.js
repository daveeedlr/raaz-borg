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
    $('member').hidden = form.hidden = !user || recovering;
    $('reset-password').hidden = !recovering || !user;
    $('identity').textContent = user?.email || '';
    $('primary-auth').textContent = signingUp ? tr('Crear cuenta','Create account') : tr('Iniciar sesión','Sign in');
    $('auth-create').setAttribute('aria-pressed', String(signingUp));
    $('auth-signin').setAttribute('aria-pressed', String(!signingUp));
    $('auth-explainer').textContent = signingUp
      ? tr('Usa un correo al que tengas acceso. Te enviaremos un enlace de confirmación antes de que puedas postularte.',
           'Use an email address you can access. We will send a confirmation link before you can apply.')
      : tr('Ingresa para completar tu postulación o consultar el estado de tus solicitudes.',
           'Sign in to finish an application or check the status of previous applications.');
    $('recover').hidden = signingUp;
    $('password').autocomplete = signingUp ? 'new-password' : 'current-password';
    $('password').minLength = signingUp ? 8 : 1;
    $('feedback').dataset.state = messageKind;
    $('feedback').textContent = message.length ? tr(...message) : '';
    drawHistory();
  }
  const statuses = {submitted:['Postulación recibida','Application received'],in_review:['En revisión','In review'],invited:['Invitación enviada','Invited'],closed:['Cerrada','Closed']};
  function drawHistory() {
    const box = $('receipts');
    box.replaceChildren();
    if (!user || !historyRows) return;
    if (!historyRows.length) box.textContent = tr('Tu cuenta ya existe, pero todavía no has enviado una postulación. Completa los datos de atleta más abajo y pulsa Enviar postulación para registrarla.','Your account already exists, but you have not submitted an athlete application yet. Complete the athlete details below and press Submit application to save one.');
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
    if (rows.error || info?.error) say('No pudimos cargar todos tus datos. Vuelve a actualizar el estado.','Could not load all your details. Try refreshing your status.','error');
    if (!rows.error) historyRows = rows.data;
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
      message = [];
      messageKind = 'info';
      $('password').value = '';
    }
    user = next;
    render();
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
        say('¡Sesión iniciada! Estamos comprobando tus postulaciones.','Signed in! Checking your applications.','success');
        const {data:applications,error:applicationsError} = await client.rpc('rb_my_applications');
        if (!applicationsError && Array.isArray(applications) && applications.length) {
          location.assign(fighterDashboardUrl());
        } else {
          say('¡Bienvenido! Tu sesión está activa. Completa tus datos de atleta y envía la postulación para ingresar a tu portal personal.',
              'Welcome! You are signed in. Complete your athlete details and submit an application to open your personal portal.','success');
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
    if (!user || recovering) return;
    if (!belt.reportValidity() || !interest.reportValidity()) {
      say('Selecciona tu cinturón y el tipo de postulación antes de continuar.','Select your belt and application type before continuing.','error');
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
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).join('.');
      const storage = 'rb-application-retry-'+owner;
      try { requestKey = JSON.parse(sessionStorage.getItem(storage)) || requestKey; } catch {}
      if (requestKey?.fingerprint !== fingerprint) requestKey = {fingerprint,id:crypto.randomUUID()};
      try { sessionStorage.setItem(storage,JSON.stringify(requestKey)); } catch {}
      const {data:id,error} = await client.rpc('rb_submit_application_v2',{...payload,p_request_id:requestKey.id});
      if (user?.id !== owner) return;
      if (error || !id) throw error || new Error('Missing receipt');
      form.elements.contact.checked = false;
      await load(false);
      if (user?.id !== owner) return;
      say(
        '¡Postulación recibida! Abriendo tu portal personal para consultar el estado y el mensaje del equipo.',
        'Application received! Opening your personal portal to view your status and the team message.',
        'success'
      );
      // The welcome notification is created by the database trigger. The portal will
      // attempt email delivery when configured, without claiming premature success.
      location.assign(fighterDashboardUrl(true));
    });
  };
  document.addEventListener('languagechange', render);
  showRealm();
  render();
})();
