import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("login offers only sign-in, no public account creation; UI remains separate from inventory",()=>{
 for(const path of ["index.html","data/app.html"]){
   const html=read(path);
   assert.match(html,/id="gcLoginView"/);
   assert.match(html,/id="authEmail"/);
   assert.match(html,/id="authPassword"/);
   assert.match(html,/id="authTogglePassword"/);
   assert.match(html,/id="authLoginButton"/);
   assert.match(html,/id="gcAccountView"/);
   assert.match(html,/id="familyCredentialsText"/);
   assert.match(html,/id="copyFamilyCredentials"/);
   assert.match(html,/rel="stylesheet" href="\.\/data\/login\.css"/);
   assert.doesNotMatch(html,/id="authSignUp"/);
 }
});
test("client never registers visitors and only signed-in administrators create family accounts",()=>{
 const s=read("data/cloud.js");
 assert.match(s,/auth\.signInWithPassword/);
 assert.doesNotMatch(s,/auth\.signUp\(/);
 assert.match(s,/user\.app_metadata\?\.gc_admin===true/);
 assert.match(s,/state\.client\.functions\.invoke\("gc-family-access"/);
 assert.match(s,/action:"create"/);
 assert.match(s,/action:"reset"/);
 assert.match(s,/state\.viewer/);
 assert.match(s,/hideCredentials\(\)/);
 assert.match(s,/revealCredentials\(result\)/);
 assert.match(s,/authTogglePassword/);
});
test("privileged edge function checks a trusted admin claim before creating users",()=>{
 const edge=read("supabase/functions/gc-family-access/index.ts");
 assert.match(edge,/auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(edge,/user\.app_metadata\?\.gc_admin!==true/);
 assert.match(edge,/user\.email_confirmed_at/);
 assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(edge,/admin\.auth\.admin\.createUser/);
 assert.match(edge,/email_confirm:true/);
 assert.match(edge,/inventory_viewers/);
 assert.match(edge,/admin\.auth\.admin\.deleteUser/);
 assert.match(edge,/admin\.auth\.admin\.updateUserById/);
 assert.match(edge,/crypto\.getRandomValues/);
 assert.doesNotMatch(read("data/cloud.js"),/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});
test("only a scoped invitation can permit password reset of a managed family account",()=>{
 const edge=read("supabase/functions/gc-family-access/index.ts");
 assert.match(edge,/action==="reset"/);
 assert.match(edge,/eq\("owner_id",user\.id\)/);
 assert.match(edge,/const alreadyManaged=target\.app_metadata\?\.gc_owner_id===user\.id/);
 assert.match(edge,/const oldInvitation=!target\.email_confirmed_at/);
 assert.match(edge,/NOT_YOUR_MEMBER/);
 assert.match(edge,/NOT_A_MANAGED_USER/);
});
test("PWA offline shell includes new login UI",()=>{
 const sw=read("data/sw.js"),css=read("data/login.css");
 assert.match(sw,/gc-origen-pwa-v4/);
 assert.match(sw,/\/data\/login\.css/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.gc-access-brand/);
 assert.match(css,/\.gc-auth-input-wrap:focus-within/);
});
