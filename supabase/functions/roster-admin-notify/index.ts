// Operational pause: keep templates for future reactivation, but do not dispatch email.
// Essential Supabase Auth verification and password recovery are unaffected.
const EMAIL_AUTOMATIONS_PAUSED = true;
// RA'AZ BORG staff registration alerts.
// Either invoked with a one-time, unguessable DB webhook event token, or by a
// verified, explicitly authorized reviewer to retry pending delivery.
// verify_jwt=false is intentional for the database webhook path; authentication
// and reviewer authorization are implemented below before any delivery occurs.
const ORIGIN="https://jayjayanton.github.io";
const SITE=ORIGIN+"/raaz-borg/equipo.html";
const API="https://api.resend.com/emails";
const cors={
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:cors});
const clean=(v:unknown)=>String(v??"")
  .replace(/[\r\n\t]/g," ").trim().slice(0,160);
const esc=(v:unknown)=>clean(v)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const label=(code:string)=>({
  gp:"Grand Prix",lab:"Börg Lab",both:"Grand Prix y Börg Lab"
}[code]||clean(code)||"Por definir");
async function rpc(base:string,apiKey:string,jwt:string,name:string,data:Record<string,unknown>) {
  const r=await fetch(base+"/rest/v1/rpc/"+name,{
    method:"POST",headers:{"Content-Type":"application/json","apikey":apiKey,
      "Authorization":"Bearer "+jwt},body:JSON.stringify(data)
  });
  if(!r.ok()) throw Error("RPC "+name+" "+r.status);
  return await r.json();
}
function emailContent(d:Record<string,unknown>){
  const realm=clean(d.realm)||"División por definir";
  const alias=clean(d.alias)||"Atleta";
  const href=SITE+"?registro="+encodeURIComponent(String(d.application_id));
  const rows:Array<[string,unknown]>=[
    ["Alias / Fighter",alias],
    ["Nombre / Name",d.full_name],
    ["Categoría / Realm",realm],
    ["Cinturón / Belt",d.belt],
    ["Interés / Interest",label(String(d.interest||""))],
    ["Ciudad / City",d.city],
    ["Academia / Gym",d.academy],
    ["Disciplina / Discipline",d.discipline],
    ["Peso / Weight",d.weight==null?"—":clean(d.weight)+" "+clean(d.weight_unit)],
    ["Estatura / Height",d.height==null?"—":clean(d.height)+" "+clean(d.height_unit)],
    ["Franjas / Stripes",d.belt_stripes],
    ["Anterior / Previous record",d.prior_competed==null?"No declarado / Unreported":
      [d.prior_competed,d.prior_won,d.prior_lost,d.prior_drawn].map(x=>clean(x)).join(" / ")+
      " (competed / won / lost / drawn; self-reported)"]
  ];
  const specs=rows.map(([k,v])=>'<tr><th style="padding:9px;border-bottom:1px solid #363743;color:#c8f542;text-align:left;">'+
    esc(k)+'</th><td style="padding:9px;border-bottom:1px solid #363743;color:#fff;">'+esc(v||"—")+'</td></tr>').join("");
  const subject="RA’AZ BORG · Nuevo registro: "+alias+" | "+realm;
  const html='<!doctype html><html><body style="background:#111116;margin:0;padding:24px 12px;font:15px Arial,sans-serif;">'+
    '<main style="max-width:640px;margin:auto;background:#23232e;border-top:5px solid #c8f542;padding:25px;">'+
    '<p style="letter-spacing:.13em;color:#c8f542;font-size:12px;">RA’AZ BORG · NOTIFICACIÓN DEL ROSTER</p>'+
    '<h1 style="color:#fff;font-size:25px;">Nuevo registro de peleador / New fighter registration</h1>'+
    '<p style="color:#f5eff7;line-height:1.6;">Se registró un atleta en el roster. Consulta su categoría y datos en el panel privado. / An athlete joined the roster registration queue.</p>'+
    '<table style="border-collapse:collapse;width:100%;">'+specs+'</table>'+
    '<p style="margin:27px 0;"><a href="'+href+'" style="background:#c8f542;color:#111;padding:14px 18px;text-decoration:none;font-weight:bold;">Ver registro y revisar / Review registration</a></p>'+
    '<p style="color:#b8b3bc;font-size:12px;line-height:1.5;">Los datos de historial previo son declarados por el atleta. La aprobación y programación de combates se gestionan por separado. / Previous fight totals are self-reported; roster approval and bouts are separate.</p>'+
    '</main></body></html>';
  return {subject,html};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  // PAUSED: intentionally bypass all email provider calls. Database/in-app alerts continue.
  if (EMAIL_AUTOMATIONS_PAUSED) return json({paused:true,delivered:0,queued:true,note:"Custom RA'AZ BORG emails are paused. In-app notifications are still active."});
  const base=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const provider=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("RAAZ_EMAIL_FROM")||"";
  const recipient=Deno.env.get("RAAZ_ADMIN_NOTIFY_TO")||"raazborgstudios@gmail.com";
  const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||
    "sb_publishable_XkKZZHEZK5IEt0lv1-Kzqw_jV0PU3Nx";
  if(!base||!service)return json({error:"Backend not configured"},503);
  let body:Record<string,unknown>={};
  try {body=await req.json();if(!body||Array.isArray(body)||typeof body!=="object")throw Error("Not an object");}
  catch {return json({error:"Invalid request"},400);}
  const token=typeof body.event_token==="string"?body.event_token:"";
  let selected:Array<{p_token:string|null,p_alert_id:string|null}>=[];
  if(uuid.test(token)){
    // Capability is never exposed to reviewers or browsers; the private claim RPC
    // checks it and consumes the associated event at most once concurrently.
    selected=[{p_token:token,p_alert_id:null}];
  }else if(body.action==="flush"){
    const auth=req.headers.get("authorization")||"";
    if(!/^Bearer \S+$/i.test(auth))return json({error:"Sign-in required"},401);
    const me=await fetch(base+"/auth/v1/user",{headers:{
      "apikey":publicKey,"authorization":auth
    }});
    if(!me.ok())return json({error:"Invalid session"},401);
    const identity=await me.json();
    if(!identity?.id||!identity?.email_confirmed_at)return json({error:"Confirmed account required"},403);
    try {
      const authorized=await rpc(base,publicKey,auth.replace(/^Bearer /i,""),
        "rb_staff_can_view_avatar",{});
      if(authorized!==true)return json({error:"Reviewer access required"},403);
      const inbox=await rpc(base,publicKey,auth.replace(/^Bearer /i,""),
        "rb_reviewer_inbox",{p_limit:100});
      selected=(Array.isArray(inbox)?inbox:[])
        .filter((x:any)=>x?.delivery_state==="pending"&&uuid.test(x?.alert_id||""))
        .slice(0,8).map((x:any)=>({p_token:null,p_alert_id:x.alert_id}));
    }catch{
      return json({error:"Reviewer access could not be verified"},403);
    }
  }else return json({error:"Unknown alert"},400);

  if(!provider||!from)return json({
    configured:false,delivered:0,
    note:"Configure RESEND_API_KEY and RAAZ_EMAIL_FROM in Supabase Edge Function Secrets"
  },503);
  let delivered=0,failed=0;
  for(const selector of selected){
    let item:Record<string,unknown>|null=null;
    try{
      item=await rpc(base,service,service,"rb_claim_roster_alert_email",selector);
      if(!item?.id)continue;
      const mail=emailContent(item);
      const response=await fetch(API,{method:"POST",headers:{
        "Authorization":"Bearer "+provider,"Content-Type":"application/json"
      },body:JSON.stringify({from,to:[recipient],reply_to:"raazborgstudios@gmail.com",
        subject:mail.subject,html:mail.html})});
      if(!response.ok())throw Error("Email provider status "+response.status);
      await rpc(base,service,service,"rb_finish_roster_alert_email",{
        p_id:item.id,p_success:true,p_error:null
      });
      delivered++;
    }catch(e){
      failed++;
      if(item?.id)await rpc(base,service,service,"rb_finish_roster_alert_email",{
        p_id:item.id,p_success:false,
        p_error:e instanceof Error?e.message:"Email delivery failed"
      }).catch(()=>{});
    }
  }
  return json({configured:true,delivered,failed});
});