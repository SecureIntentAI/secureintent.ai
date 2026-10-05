(() => {
 'use strict';
 let grant=null;
 const scope=()=>[window.Clerk?.user?.id,window.Clerk?.session?.id,window.Clerk?.organization?.id].join(':');
 const clear=()=>{grant=null;};
 const headers=()=>grant&&grant.scope===scope()&&grant.expiresAt>Date.now()?{'X-SI-Admin-Access':grant.token}:{};
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
  grant={token:data.accessToken,expiresAt:data.expiresAt,scope:startScope};
 }
 // Deliberately kept in page memory: opening the console again requires a new Clerk sign-in.
 window.SIAdminAccess={headers,unlockWithClerk,clear};
 window.addEventListener('pagehide',clear);
})();
