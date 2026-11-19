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
  let signingUp = false;
  let recovering = false;
  let busy = false;
  let message = [];
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
  function say(es, en) {
    message = [es, en];
    $('feedback').textContent = tr(es, en);
  }
  function render() {
    $('account').hidden = !!user;
    $('member').hidden = form.hidden = !user || recovering;
    $('reset-password').hidden = !recovering || !user;
    $('identity').textContent = user?.email || '';
    $('primary-auth').textContent = signingUp ? tr('Crear cuenta','Create account') : tr('Iniciar sesión','Sign in');
    $('switch-auth').textContent = signingUp ? tr('Ya tengo cuenta','I have an account') : tr('Crear una cuenta','Create an account');
    $('password').autocomplete = signingUp ? 'new-password' : 'current-password';
    $('password').minLength = signingUp ? 8 : 1;
    $('feedback').textContent = message.length ? tr(...message) : '';
    drawHistory();
  }
  const statuses = {submitted:['Recibida','Submitted'],in_review:['En revisión','In review'],invited:['Invitación enviada','Invited'],closed:['Cerrada','Closed']};
  function drawHistory() {
    const box = $('receipts');
    box.replaceChildren();
    if (!user || !historyRows) return;
    if (!historyRows.length) box.textContent = tr('Aún no tienes solicitudes.','You have no applications yet.');
    for (const row of historyRows) {
      const entry = document.createElement('article');
      const option = Array.from(interest.options).find(o => o.value === row.interest);
      const title = document.createElement('strong');
      title.textContent = [option?.textContent, row.suggested_realm].filter(Boolean).join(' · ');
      const details = document.createElement('p');
      details.textContent = new Date(row.submitted_at).toLocaleDateString(document.documentElement.lang) + ' · ' + tr(...statuses[row.status]);
      const receipt = document.createElement('small');
      receipt.textContent = tr('Comprobante','Receipt') + ' · ' + row.id;
      entry.append(title, details, receipt);
      box.append(entry);
    }
  }
  async function load(profile) {
    const seq = ++loadNumber;
    const [rows, info] = await Promise.all([client.rpc('rb_my_applications'), profile ? client.rpc('rb_my_profile') : null]);
    if (seq !== loadNumber || !user) return;
    if (rows.error || info?.error) say('No pudimos cargar todos tus datos. Vuelve a actualizar el estado.','Could not load all your details. Try refreshing your status.');
    if (!rows.error) historyRows = rows.data;
    if (info?.data?.[0]) {
      const saved = info.data[0];
      for (const name of ['alias','city','academy','discipline']) {
        if (!form.elements[name].value) form.elements[name].value = saved[name] || '';
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
    catch { say('No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.','Could not complete the request. Check your connection and try again.'); }
    finally { busy = button.disabled = false; }
  }
  $('switch-auth').onclick = () => { signingUp = !signingUp; message = []; render(); $('email').focus(); };
  $('account').onsubmit = event => {
    event.preventDefault();
    action($('primary-auth'), async () => {
      const credentials = {email:$('email').value.trim(), password:$('password').value};
      const result = signingUp
        ? await client.auth.signUp({...credentials, options:{emailRedirectTo:callbackUrl()}})
        : await client.auth.signInWithPassword(credentials);
      if (result.error) {
        if (result.error.status === 429) say('Demasiados intentos. Espera un momento.','Too many attempts. Please wait a moment.');
        else if (signingUp) say('No se pudo crear la cuenta. Comprueba el correo y usa una contraseña de al menos ocho caracteres.','Could not create the account. Check your email address and use a password of at least eight characters.');
        else say('Comprueba tus credenciales y confirma tu correo antes de iniciar sesión.','Check your credentials and confirm your email before signing in.');
      } else if (!result.data.session) {
        signingUp = false;
        render();
        say('Revisa tu correo para confirmar tu cuenta. Luego inicia sesión aquí.','Check your email to confirm your account. Then sign in here.');
      }
    });
  };
  $('recover').onclick = () => {
    if (!$('email').reportValidity()) return;
    action($('recover'), async () => {
      const {error} = await client.auth.resetPasswordForEmail($('email').value.trim(), {redirectTo:callbackUrl()});
      if (error) throw error;
      say('Si la cuenta existe, recibirás un enlace para cambiar la contraseña.','If the account exists, you will receive a password reset link.');
    });
  };
  $('reset-password').onsubmit = event => {
    event.preventDefault();
    action(event.target.querySelector('button'), async () => {
      const field = event.target.querySelector('input');
      const {error} = await client.auth.updateUser({password:field.value});
      if (error) throw error;
      field.value = ''; recovering = false; render();
      say('Contraseña actualizada.','Password updated.');
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
    action($('submit-application'), async () => {
      const owner = user.id;
      const data = new FormData(form);
      const payload = {p_belt:belt.value,p_interest:interest.value,p_contact_consent:form.elements.contact.checked};
      for (const name of ['alias','city','academy','discipline','footage']) {
        payload[name === 'footage' ? 'p_footage_url' : 'p_'+name] = data.get(name).trim() || null;
      }
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).join('.');
      const storage = 'rb-application-retry-'+owner;
      try { requestKey = JSON.parse(sessionStorage.getItem(storage)) || requestKey; } catch {}
      if (requestKey?.fingerprint !== fingerprint) requestKey = {fingerprint,id:crypto.randomUUID()};
      try { sessionStorage.setItem(storage,JSON.stringify(requestKey)); } catch {}
      const {data:id,error} = await client.rpc('rb_submit_application',{...payload,p_request_id:requestKey.id});
      if (user?.id !== owner) return;
      if (error || !id) throw error || new Error('Missing receipt');
      form.elements.contact.checked = false;
      await load(false);
      if (user?.id !== owner) return;
      say('Solicitud recibida. Comprobante '+id,'Application received. Receipt '+id);
      $('feedback').scrollIntoView({block:'center'});
    });
  };
  document.addEventListener('languagechange', render);
  showRealm();
  render();
})();
