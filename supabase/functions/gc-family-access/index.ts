/**
 * GC GRAPHICS — Create/reset a managed family login.
 * Privileged code runs only in Supabase Edge Functions; no service key in the browser.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const origin = "https://gc-graphics-inventory.onrender.com";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status, headers: {...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}
function password() {
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result="";
  const modulus=256-(256%alphabet.length);
  while(result.length<22){
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
    for(const value of bytes)if(value<modulus && result.length<22)result+=alphabet[value%alphabet.length];
  }
  return result;
}
function validEmail(email: unknown): email is string {
  return typeof email==="string"&&email.length<=254&&email.length>=5&&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json(405,{error:"METHOD_NOT_ALLOWED"});
  const requestOrigin=request.headers.get("origin");
  if(requestOrigin && requestOrigin!==origin)return json(403,{error:"INVALID_ORIGIN"});
  const bearer=request.headers.get("authorization")||"";
  if(!bearer.startsWith("Bearer "))return json(401,{error:"LOGIN_REQUIRED"});
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url=Deno.env.get("SUPABASE_URL");
  if(!key||!url)return json(503,{error:"SERVER_NOT_CONFIGURED"});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(bearer.slice(7));
  if(authError||!user)return json(401,{error:"INVALID_SESSION"});
  if(user.app_metadata?.gc_admin!==true||!user.email_confirmed_at)
    return json(403,{error:"ADMIN_ONLY"});
  let body: Record<string, unknown>;
  try{body=await request.json();}catch{return json(400,{error:"INVALID_JSON"});}
  const action=body.action;
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if(!validEmail(email)||email===user.email?.toLowerCase())
    return json(400,{error:"INVALID_EMAIL"});
  const role=body.role;
  if(action==="create"){
    if(role!=="viewer"&&role!=="buyer")return json(400,{error:"INVALID_ROLE"});
    const secret=password();
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,password:secret,email_confirm:true,
      app_metadata:{gc_managed:true,gc_owner_id:user.id}
    });
    if(createError||!created.user){
      // We never return a password if Auth did not confirm the creation.
      return json(createError?.status===422?409:400,{error:"USER_CREATION_FAILED",detail:createError?.message?.slice(0,180)||"No se creó el usuario."});
    }
    const {error:inviteError}=await admin.from("inventory_viewers").upsert({
      owner_id:user.id,viewer_email:email,role,label:"Familia"
    },{onConflict:"owner_id,viewer_email"});
    if(inviteError){
      // Avoid leaving a new account without an invitation if the second write fails.
      await admin.auth.admin.deleteUser(created.user.id);
      return json(500,{error:"INVITATION_FAILED"});
    }
    return json(200,{ok:true,email,role,password:secret,loginUrl:origin+"/data/app.html"});
  }
  if(action==="reset"){
    // The owner must still have a live invitation; do not reset unrelated accounts.
    const {data:invite,error:invError}=await admin.from("inventory_viewers")
      .select("viewer_email").eq("owner_id",user.id).eq("viewer_email",email).maybeSingle();
    if(invError||!invite)return json(403,{error:"NOT_YOUR_MEMBER"});
    let target: {id:string;email?:string;app_metadata?:Record<string,unknown>;email_confirmed_at?:string|null}|null=null;
    for(let page=1;page<=10&&!target;page++){
      const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});
      if(error)return json(503,{error:"ACCOUNT_LOOKUP_FAILED"});
      target=(data.users||[]).find(u=>u.email?.toLowerCase()===email)??null;
      if((data.users||[]).length<100)break;
    }
    if(!target)return json(403,{error:"NOT_A_MANAGED_USER"});
    const alreadyManaged=target.app_metadata?.gc_owner_id===user.id;
    // Migrate ONLY an existing unverified family invitation. Never take over
    // a verified independent account or any other administrator's account.
    const oldInvitation=!target.email_confirmed_at &&
      !target.app_metadata?.gc_owner_id &&
      target.app_metadata?.gc_admin!==true;
    if(!alreadyManaged&&!oldInvitation)return json(403,{error:"NOT_A_MANAGED_USER"});
    const secret=password();
    const {error:resetError}=await admin.auth.admin.updateUserById(target.id,{
      password:secret,email_confirm:true,
      app_metadata:{...target.app_metadata,gc_managed:true,gc_owner_id:user.id}
    });
    if(resetError)return json(503,{error:"PASSWORD_RESET_FAILED"});
    return json(200,{ok:true,email,password:secret,loginUrl:origin+"/data/app.html"});
  }
  return json(400,{error:"UNKNOWN_ACTION"});
});
