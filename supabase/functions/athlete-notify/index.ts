// Operational pause: keep templates for future reactivation, but do not dispatch email.
// Essential Supabase Auth verification and password recovery are unaffected.
const EMAIL_AUTOMATIONS_PAUSED = true;
// RA'AZ BORG: authenticated, account-scoped delivery of queued notification emails.
// No service role or provider key is ever exposed to browser JavaScript.
const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:cors});
const escapeHtml = (value:unknown) => String(value??"")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const site="https://jayjayanton.github.io/raaz-borg/fighter-dashboard.html";
const emailContent=(kind:string,username:string,preferred_language:string)=>{
  const athlete=escapeHtml(username||"atleta");
  const en=preferred_language==="en";
  const accent="#c8f542";
  const isWelcome=kind==="welcome";
  const heading=en
    ? (isWelcome ? "Welcome to the Börg Realm!" : "Successful sign-in")
    : (isWelcome ? "¡Bienvenido al universo Börg!" : "Inicio de sesión confirmado");
  const copy=en
    ? (isWelcome
      ? "<p>Welcome, "+athlete+"! We received your fighter roster registration. The RA’AZ BORG team is reviewing your profile and will contact you by email with the next steps. Your registration does not yet confirm a fight.</p>"
      : "<p>Your RA’AZ BORG fighter account was signed into successfully. If this was not you, please reset your password on the website.</p>")
    : (isWelcome
      ? "<p>¡Bienvenido, "+athlete+"! Hemos recibido tu inscripción al roster de peleadores. El equipo RA’AZ BORG revisará tus datos y te contactará por correo con los siguientes pasos. Tu registro aún no confirma un combate.</p>"
      : "<p>Se inició sesión correctamente en tu cuenta de peleador RA’AZ BORG. Si no fuiste tú, restablece tu contraseña desde el sitio web.</p>");
  const button=en?"My fighter portal":"Mi portal de peleador";
  const html='<html lang="'+(en?"en":"es")+'"><body style="margin:0;background:#101015;color:#fff;font-family:Arial,sans-serif;padding:30px 12px;">'+
    '<main style="max-width:560px;margin:auto;background:#21212b;border:1px solid #56505c;border-top:5px solid '+accent+';padding:30px;">'+
    '<p style="font-size:12px;letter-spacing:.15em;color:'+accent+'">RA’AZ BORG · COMBAT RE-CODED</p>'+
    '<h1 style="font-size:28px;line-height:1.25;">'+escapeHtml(heading)+'</h1>'+
    '<div style="font-size:16px;line-height:1.6;">'+copy+'</div>'+
    '<a href="'+site+'" style="display:inline-block;background:'+accent+';padding:13px 19px;color:#101015;font-weight:bold;text-decoration:none;">'+button+'</a>'+
    '<p style="font-size:12px;color:#d9d2db;margin-top:28px;">RA’AZ BORG · Quito, Ecuador</p></main></body></html>';
  return {
    subject: en
      ? (isWelcome ? "RA’AZ BORG · Welcome to the Börg Realm" : "RA’AZ BORG · Successful sign-in")
      : (isWelcome ? "RA’AZ BORG · Bienvenido al universo Börg" : "RA’AZ BORG · Inicio de sesión confirmado"),
    html
  };
};
async function rpc(url:string,key:string,name:string,payload:unknown) {
  const response=await fetch(url+"/rest/v1/rpc/"+name,{
    method:"POST",
    headers:{"content-type":"application/json","apikey":key,"authorization":"Bearer "+key},
    body:JSON.stringify(payload)
  });
  if(!response.ok()) throw new Error("Backend RPC failed "+response.status+" "+name);
  return response.json();
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  // PAUSED: intentionally bypass all email provider calls. Database/in-app alerts continue.
  if (EMAIL_AUTOMATIONS_PAUSED) return json({paused:true,delivered:0,queued:true,note:"Custom RA'AZ BORG emails are paused. In-app notifications are still active."});
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey=Deno.env.get("RESEND_API_KEY");
  const sender=Deno.env.get("RAAZ_EMAIL_FROM");
  if(!supabaseUrl||!serviceKey)return json({error:"Service not configured"},503);
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer [^ ]+$/i.test(bearer)) return json({error:"Unauthorized"},401);
  // Verify the caller's access token server-side. Never trust an athlete_id from the request body.
  const identity=await fetch(supabaseUrl+"/auth/v1/user",{
    headers:{"apikey":serviceKey,"authorization":bearer}
  });
  if(!identity.ok())return json({error:"Unauthorized"},401);
  const athlete=await identity.json();
  if(!athlete?.id || !athlete?.email_confirmed_at)return json({error:"Confirmed account required"},403);
  if(!resendKey||!sender)return json({configured:false,delivered:0,reason:"Email provider not configured"},503);
  try {
    // Resolve the athlete's saved account preference on the server, never from browser input.
    const preferredLanguage=await rpc(supabaseUrl,serviceKey,"rb_notification_language",{
      p_athlete_id:athlete.id
    });
    const queued=await rpc(supabaseUrl,serviceKey,"rb_claim_athlete_emails",{p_athlete_id:athlete.id,p_limit:5});
    let delivered=0,failed=0;
    for(const msg of Array.isArray(queued)?queued:[]) {
      if(!msg?.id||!msg?.recipient||!["welcome","sign_in"].includes(msg.kind))continue;
      try{
        const {subject,html}=emailContent(msg.kind,msg.username,preferredLanguage);
        const sent=await fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},
          body:JSON.stringify({from:sender,to:[msg.recipient],reply_to:"raazborgstudios@gmail.com",subject,html})
        });
        if(!sent.ok())throw new Error("Provider status "+sent.status);
        await rpc(supabaseUrl,serviceKey,"rb_finish_athlete_email",{p_id:msg.id,p_sent:true,p_error:null});
        delivered++;
      }catch(error){
        failed++;
        await rpc(supabaseUrl,serviceKey,"rb_finish_athlete_email",{
          p_id:msg.id,p_sent:false,p_error:error instanceof Error?error.message:"Provider failure"
        }).catch(()=>{});
      }
    }
    return json({configured:true,delivered,failed});
  } catch {
    return json({error:"Could not process queued notifications"},503);
  }
});
