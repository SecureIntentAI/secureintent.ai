(() => {
 'use strict';
 // The admin pass a password sign-in earns. Kept in this browser (every tab,
 // and across a refresh) for 30 idle minutes and at most 12 hours, mirroring the
 // server, which extends it on each verified request and stays the authority:
 // an expired or revoked pass is refused there whatever this copy says.
 const KEY='si_admin_access';
 const IDLE_MS=30*60_000,MAX_MS=12*60*60_000;
 let memory=null;
 const scope=()=>[window.Clerk?.user?.id,window.Clerk?.session?.id,window.Clerk?.organization?.id].join(':');
 const read=()=>{
  try { const raw=localStorage.getItem(KEY); return raw?JSON.parse(raw):null; } catch { return memory; }
 };
 const write=grant=>{
  memory=grant;
  try { grant?localStorage.setItem(KEY,JSON.stringify(grant)):localStorage.removeItem(KEY); } catch {}
 };
 const clear=()=>write(null);
 const valid=grant=>grant&&typeof grant.token==='string'&&/^[a-f0-9]{64}$/.test(grant.token)&&
  grant.scope===scope()&&grant.expiresAt>Date.now()&&grant.issuedAt+MAX_MS>Date.now();
 const headers=()=>{const grant=read();return valid(grant)?{'X-SI-Admin-Access':grant.token}:{};};
 // A request the server accepted moved its expiry; keep ours in step.
 const touch=()=>{
  const grant=read();
  if(valid(grant))write({...grant,expiresAt:Math.min(Date.now()+IDLE_MS,grant.issuedAt+MAX_MS)});
 };
 async function unlockWithClerk(){
  const startScope=scope(),token=await window.Clerk?.session?.getToken();
  if(!token)throw new Error('Sign in with your registered admin account first.');
  let response;
  try {
   response=await window.SI.fetch(window.SI.config.apiBase+'/v1/business-access/unlock/clerk',{
    method:'POST',headers:{Authorization:'Bearer '+token},
    cache:'no-store',signal:AbortSignal.timeout(20000)
   });
  } catch(cause) {
   // The browser's own wording ("Failed to fetch") says nothing a person can act on.
   const error=new Error(cause?.name==='TimeoutError'
    ?'SecureIntent took too long to answer. Your sign-in is fine — try again in a moment.'
    :"We couldn't reach SecureIntent to confirm your admin access. Check your connection, then try again.");
   error.code='network';
   throw error;
  }
  const data=await response.json().catch(()=>({}));
  if(startScope!==scope())throw new Error('Your account changed. Please sign in again.');
  if(!response.ok){
   const messages={clerk_verification_required:'Sign in again with Clerk to verify this admin session.',password_verification_required:'Use your Clerk password to verify admin access. Other sign-in methods do not meet the admin password requirement.',forbidden:'This account is not the registered workspace administrator.',business_promo_required:'This account does not have an active Business workspace.'};
   const error=new Error(messages[data.error]||'Clerk verification could not be completed. Please retry.');
   error.code=data.error;
   throw error;
  }
  write({token:data.accessToken,expiresAt:data.expiresAt,issuedAt:Date.now(),scope:startScope});
 }
 window.SIAdminAccess={headers,unlockWithClerk,clear,touch};
})();
