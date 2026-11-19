/* RA'AZ BORG – private reviewer interface. Authorization lives in Supabase, never in the browser. */
(() => {
  const $ = id => document.getElementById(id);
  const client = window.supabase.createClient('https://iltuwbawjiwvuqqrkyiz.supabase.co', 'sb_publishable_XkKZZHEZK5IEt0lv1-Kzqw_jV0PU3Nx', {
    auth: { storageKey: 'raaz-athlete-session' }
  });
  const tr = (es,en) => document.documentElement.lang === 'en' ? en : es;
  const statusLabels = {
    submitted:['Registro recibido','Registration received'],
    in_review:['En revisión de roster','Under roster review'],
    invited:['Invitación enviada','Invitation sent'],
    closed:['Registro cerrado','Registration closed']
  };
  const interests = {gp:['Grand Prix','Grand Prix'],lab:['Börg Lab','Börg Lab'],both:['Grand Prix y Börg Lab','Grand Prix and Börg Lab']};
  const transitions = {
    submitted:[['in_review','Marcar en revisión','Mark in review'],['closed','Cerrar registro','Close registration']],
    in_review:[['invited','Marcar invitación enviada','Mark invitation sent'],['closed','Cerrar registro','Close registration']],
    invited:[['closed','Cerrar registro','Close registration']], closed:[]
  };
  let user = null, allowed = false, loading = false, rows = [], refreshNumber = 0;
  let message = [];
  function notify(es,en) { message=[es,en]; $('team-feedback').textContent=tr(es,en); }
  function el(tag,text,cls) {
    const node=document.createElement(tag);
    if(text != null) node.textContent=String(text);
    if(cls) node.className=cls;
    return node;
  }
  function render() {
    $('team-login').hidden=!!user;
    $('team-denied').hidden=!user || allowed || loading;
    $('team-queue').hidden=!user || !allowed;
    $('team-identity').textContent=user?.email||'';
    if(loading) $('team-feedback').textContent=tr('Cargando registros del roster…','Loading roster registrations…');
    else $('team-feedback').textContent=message.length?tr(...message):'';
    renderRows();
  }
  function renderRows() {
    const output=$('team-results');
    output.replaceChildren();
    if(!user||!allowed) return;
    $('team-count').textContent=tr(rows.length+' registros en total',rows.length+' total roster registrations');
    const selected=$('team-filter').value;
    const visible=rows.filter(r=>selected==='all'||r.status===selected);
    if(!visible.length) { output.append(el('p',tr('No hay registros en este estado.','No roster registrations in this status.'))); return; }
    for(const row of visible) {
      const card=el('article',null,'team-review');
      const title=el('h3',row.alias||tr('Atleta sin alias','Unnamed athlete'));
      const meta=el('div',null,'team-meta');
      const receivedDate=new Date(row.submitted_at);
      const date=Number.isNaN(receivedDate.getTime())?'—':receivedDate.toLocaleString(document.documentElement.lang==='en'?'en-US':'es-EC');
      for(const value of [tr(...(statusLabels[row.status]||['Pendiente','Pending'])), tr(...(interests[row.interest]||['Interés no definido','Interest unavailable'])),row.belt||'—',row.suggested_realm||tr('División por definir','Division to be confirmed'),row.city||'—',date]) meta.append(el('span',value));
      const email=el('p',row.contact_email||'');
      const profile=row.profile_snapshot||{};
      const fullName=[profile.first_name,profile.last_name].filter(Boolean).join(' ');
      if(fullName) card.append(el('p',fullName));
      const prior=profile.prior_record||null;
      const details=el('p',[row.academy,row.discipline,profile.country,profile.state_province,
        prior ? tr('Historial anterior declarado: ','Self-reported prior record: ')+
          [prior.competed,prior.won,prior.lost,prior.drawn].join(' / ') : null,
        profile.date_of_birth ? tr('Nacimiento: ','Born: ')+profile.date_of_birth : null,
        profile.weight ? profile.weight+' '+(profile.weight_unit||'') : null,
        profile.height ? profile.height+' '+(profile.height_unit||'') : null,
        profile.belt_stripes != null ? tr('Franjas: ','Stripes: ')+profile.belt_stripes : null
      ].filter(Boolean).join(' · '),'team-note');
      const receipt=el('p',null,'team-ack-state');
      receipt.dataset.state = row.acknowledged_at ? 'confirmed' : 'unconfirmed';
      receipt.textContent = row.acknowledged_at
        ? tr('Recepción confirmada por RA’AZ BORG · ',
             'Receipt confirmed by RA’AZ BORG · ') +
          new Date(row.acknowledged_at).toLocaleDateString(document.documentElement.lang==='en'?'en-US':'es-EC') +
          ' · ' + (row.ack_email_state==='sent'
            ? tr('Correo enviado anteriormente','Email previously sent')
            : tr('Correos automáticos en pausa','Automated emails paused'))
        : tr('Pendiente de confirmación manual al atleta',
             'Awaiting staff confirmation to athlete');
      const actions=el('div',null,'team-actions');
      if (!row.acknowledged_at) {
        const acknowledge=el('button',tr('Confirmar recepción en el portal','Confirm receipt in portal'));
        acknowledge.type='button';
        acknowledge.dataset.action='acknowledge';
        acknowledge.addEventListener('click',()=>acknowledgeRegistration(row,acknowledge));
        actions.append(acknowledge);
      }
      if(row.contact_email) {
        const contact=el('a',tr('Escribir al atleta','Email athlete'));
        contact.href='mailto:'+encodeURIComponent(row.contact_email)+'?subject='+encodeURIComponent('RA’AZ BORG — '+tr('Tu registro al roster','Your roster registration'));
        actions.append(contact);
      }
      if(row.footage_url) {
        try {
          const url=new URL(row.footage_url);
          if(['https:','http:'].includes(url.protocol)) {
            const link=el('a',tr('Ver video/perfil','View footage/profile'));
            link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
            actions.append(link);
          }
        } catch {}
      }
      for(const [next,es,en] of transitions[row.status]||[]) {
        const button=el('button',tr(es,en));
        button.type='button';
        button.dataset.next=next;
        button.addEventListener('click',()=>changeStatus(row, next, button));
        actions.append(button);
      }
      card.append(title,meta,email,details,receipt,actions);
      output.append(card);
    }
  }
  async function loadQueue() {
    if(!user) return;
    const seq=++refreshNumber, owner=user.id;
    loading=true;allowed=false;render();
    try {
      const {data,error}=await client.rpc('rb_review_queue_v3');
      if(seq!==refreshNumber||!user||user.id!==owner) return;
      loading=false;
      if(error) {
        rows=[];allowed=false;
        notify('No se pudo abrir la cola. Comprueba los permisos del revisor y vuelve a intentar.',
               'Cannot open the queue. Check reviewer permissions and try again.');
      } else {
        rows=Array.isArray(data)?data:[];
        allowed=true;message=[];
      }
    } catch {
      if(seq!==refreshNumber||!user||user.id!==owner) return;
      loading=false;allowed=false;
      notify('Error de conexión. Vuelve a intentar.','Connection error. Try again.');
    }
    render();
  }
  async function acknowledgeRegistration(row,button) {
    if(!user||!allowed||row.acknowledged_at)return;
    button.disabled=true;
    try {
      const {data,error}=await client.rpc('rb_acknowledge_roster',{
        p_application_id:row.id
      });
      if(error || !data?.acknowledged_at)throw error||new Error('No acknowledgement saved');
      // In-app acknowledgement only; email automations have been explicitly paused.
      await loadQueue();
      notify('Confirmación guardada en el portal del atleta. Los correos automáticos están en pausa.',
             'Acknowledgement saved in the fighter portal. Automated emails are paused.');
    }catch{
      await loadQueue();
      notify('No pudimos guardar la confirmación. Comprueba tus permisos e inténtalo de nuevo.',
             'Could not save the acknowledgement. Check reviewer permissions and retry.');
    }finally {button.disabled=false;}
  }
  async function changeStatus(row,next,button) {
    if(!user||!allowed) return;
    button.disabled=true;
    try {
      const {error}=await client.rpc('rb_review_application',{
        p_id:row.id,p_expected_status:row.status,p_new_status:next
      });
      if(error) {
        notify('No se actualizó el estado. Actualiza la lista e inténtalo de nuevo.',
               'Status was not updated. Refresh the list and try again.');
        await loadQueue();
        return;
      }
      await loadQueue();
      notify('Estado actualizado. Recuerda contactar al atleta por correo.',
             'Status updated. Remember to email the athlete personally.');
    } catch {
      notify('No se pudo actualizar el estado.','Could not update status.');
    } finally { button.disabled=false; }
  }
  client.auth.onAuthStateChange((event,session)=>{
    const next=session?.user||null;
    const changed=user?.id!==next?.id;
    if(changed){++refreshNumber;rows=[];allowed=false;loading=false;message=[];}
    user=next;
    render();
    if(changed&&user) setTimeout(()=>{if(user)loadQueue();},0);
  });
  $('team-login').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('team-signin');button.disabled=true;
    try {
      const {error}=await client.auth.signInWithPassword({email:$('team-email').value.trim(),password:$('team-password').value});
      if(error)notify('Correo o contraseña incorrectos, o cuenta sin confirmar.','Incorrect credentials or unconfirmed account.');
      $('team-password').value='';
    } catch { notify('No se pudo iniciar sesión.','Could not sign in.'); }
    finally {button.disabled=false;}
  });
  async function signOut(){
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      notify('Sesión cerrada.','Signed out.');
    }catch{notify('No se pudo cerrar la sesión.','Could not sign out.');}
  }
  $('team-signout').onclick=signOut;
  $('team-denied-signout').onclick=signOut;
  $('team-retry').onclick=loadQueue;
  $('team-refresh').onclick=loadQueue;
  $('team-filter').addEventListener('change',renderRows);
  document.addEventListener('languagechange',render);
  render();
})();