// Operational pause: keep templates for future reactivation, but do not dispatch email.
// Essential Supabase Auth verification and password recovery are unaffected.
const EMAIL_AUTOMATIONS_PAUSED = true;
// RA'AZ BORG reviewer-triggered registration acknowledgement mail.
// Only authorized reviewers can trigger it. A registration is not a scheduled fight.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE="https://jayjayanton.github.io/raaz-borg/fighter-dashboard.html";
const headers={
  "Access-Control-Allow-Origin":"https://jayjayanton.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const respond=(data:Record<string,unknown>,status=200)=>
  new Response(JSON.stringify(data),{status,headers});
const escapeHtml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]??c));
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_ANON_KEY")||
  "sb_publishable_XkKZZHEZK5IEt0lv1-Kzqw_jV0PU3Nx";
async function rpc(name:string,args:Record<string,unknown>,token:string) {
  const response=await fetch(url+"/rest/v1/rpc/"+name,{
    method:"POST",
    headers:{"apikey":key,"authorization":"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify(args)
  });
  if(!response.ok())throw new Error("Protected RPC failed "+response.status+" "+name);
  return response.json();
}
function emailTemplate(data:{alias?:string,realm?:string,belt?:string,preferred_language?:string}) {
  const en=data.preferred_language==="en";
  const who=escapeHtml(data.alias|| (en?"fighter":"atleta"));
  const realm=escapeHtml(data.realm|| (en?"division to be confirmed":"división por definir"));
  const belt=escapeHtml(data.belt||"—");
  const heading=en?"Fighter registration received":"Registro de peleador recibido";
  const greeting=en?"Hello ":"Hola ";
  const explanation=en
    ? "The RA’AZ BORG team confirms that your fighter roster registration has been received and reviewed. Your registered division is "
    : "El equipo de RA’AZ BORG confirma que recibió y revisó tu inscripción al roster. Tu categoría registrada es ";
  const label=en?" (belt: ":" (cinturón: ";
  const nextSteps=en
    ? " We will keep you informed about the next steps. <strong>If a fight is scheduled, we will notify you of your opponent, date and location.</strong> No fight is confirmed at this stage."
    : " Te mantendremos informado sobre los siguientes pasos. <strong>Si se programa un combate, te notificaremos el rival, la fecha y el lugar.</strong> Por ahora no tienes un combate confirmado.";
  const button=en?"My fighter portal":"Mi portal de peleador";
  const html=[
    '<!doctype html><html lang="',en?"en":"es",'"><head><meta charset="utf-8"></head><body style="background:#111017;margin:0;padding:30px 14px;font:16px Arial,sans-serif;color:#fff">',
    '<main style="max-width:580px;margin:auto;padding:30px;background:#24212c;border-top:5px solid #c8f542">',
    '<p style="color:#c8f542;font-size:12px;letter-spacing:.14em">RA’AZ BORG · COMBAT RE-CODED</p>',
    '<h1 style="font-size:27px;line-height:1.2">',escapeHtml(heading),'</h1>',
    '<p>',greeting,who,',</p><p>',explanation,'<strong>',realm,'</strong>',label,belt,').',
    nextSteps,'</p>',
    '<a href="',SITE,'" style="display:inline-block;padding:13px 20px;background:#c8f542;color:#111;text-decoration:none;font-weight:bold">',
    button,'</a>',
    '<p style="font-size:12px;color:#d8d3db;margin-top:25px">RA’AZ BORG · Quito, Ecuador</p>',
    '</main></body></html>'
  ].join("");
  return {
    subject:en?"RA’AZ BORG · Fighter registration acknowledged":"RA’AZ BORG · Registro de peleador recibido",
    html
  };
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return respond({error:"Method not allowed"},405);
  // PAUSED: intentionally bypass all email provider calls. Database/in-app alerts continue.
  if (EMAIL_AUTOMATIONS_PAUSED) return respond({paused:true,delivered:0,queued:true,note:"Custom RA'AZ BORG emails are paused. In-app notifications are still active."});
  if(!url)return respond({error:"Backend not configured"},503);
  const match=(req.headers.get("authorization")||"").match(/^Bearer (.+)$/i);
  if(!match)return respond({error:"Authentication required"},401);
  const token=match[1];
  let body:{application_id?:unknown};
  try{body=await req.json();}catch{return respond({error:"Invalid JSON"},400);}
  const id=body?.application_id;
  if(typeof id!=="string"||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return respond({error:"Valid registration ID required"},400);
  try{
    const allowed=await rpc("rb_staff_can_view_avatar",{},token);
    if(allowed!==true)return respond({error:"Reviewer access required"},403);
  }catch{return respond({error:"Reviewer authorization failed"},403);}
  const provider=Deno.env.get("RESEND_API_KEY");
  const sender=Deno.env.get("RAAZ_EMAIL_FROM");
  if(!provider||!sender)return respond({sent:false,queued:true,configured:false,
    message:"Receipt saved in fighter portal. Sender not configured."});
  let email:{email?:string,alias?:string,realm?:string,belt?:string,preferred_language?:string}|null=null;
  try{email=await rpc("rb_claim_ack_email",{p_application_id:id},token);}
  catch{return respond({error:"Could not claim registration email"},403);}
  if(!email)return respond({sent:false,claimed:false,
    message:"Nothing pending: email was sent or is being processed."});
  try{
    const {subject,html}=emailTemplate(email);
    const result=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "Authorization":"Bearer "+provider,
        "Content-Type":"application/json",
        "Idempotency-Key":"rb-roster-received-"+id
      },
      body:JSON.stringify({
        from:sender,to:[email.email],reply_to:"raazborgstudios@gmail.com",
        subject,html
      })
    });
    if(!result.ok())throw new Error("Provider status "+result.status);
    const committed=await rpc("rb_finish_ack_email",
      {p_application_id:id,p_sent:true,p_error:null},token);
    if(committed!==true)throw new Error("Could not finalize delivery");
    return respond({sent:true,queued:false,configured:true});
  }catch(err){
    await rpc("rb_finish_ack_email",
      {p_application_id:id,p_sent:false,
       p_error:err instanceof Error?err.message:"Email failure"},token
    ).catch(()=>{});
    return respond({sent:false,queued:true,configured:true,
      error:"Email not delivered; dashboard acknowledgement is saved."},502);
  }
});