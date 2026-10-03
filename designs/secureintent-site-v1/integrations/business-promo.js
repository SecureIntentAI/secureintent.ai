(async () => {
  'use strict';
  const SI=window.SI, $=id=>document.getElementById(id);
  const key='si_business_invitation';
  let token='',busy=false,valid=false;
  const errors={invitation_unavailable:'This invitation expired or was revoked. Ask SecureIntent for a new invitation.',invitation_email_mismatch:'Sign in with the verified business email address named in this invitation.',invitation_used:'This invitation is already assigned to another account.',activation_in_progress:'Activation is already in progress. Wait a moment and try again.',organization_already_claimed:'This account already owns a Business organization. Contact SecureIntent for help.',activation_unavailable:'Organization activation is temporarily unavailable. Your invitation is preserved; please retry.',forbidden:'This account is not the administrator of the invited organization.'};
  errors.organization_domain_claimed='An organisation already uses this work email domain. Contact SecureIntent for help.';
  try {
    token=new URLSearchParams(location.hash.slice(1)).get('invite') || sessionStorage.getItem(key) || '';
    if (/^[a-f0-9]{64}$/.test(token)) sessionStorage.setItem(key,token);
    history.replaceState(null,'',location.pathname+location.search);
  } catch { /* In-memory redemption still works when storage is unavailable. */ }
  async function post(path,body,authenticated=false) {
    const headers={'content-type':'application/json'};
    if(authenticated){const jwt=await window.Clerk.session?.getToken({template:SI.config.jwtTemplate});if(!jwt)throw Error('Sign in to continue.');headers.Authorization=`Bearer ${jwt}`;}
    const response=await SI.fetch(SI.config.apiBase+path,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(errors[data.error] || 'The request could not be completed. Please try again.');
    return data;
  }
  let mounted='';
  function render(){
    if(busy)return;
    const user=window.Clerk.user;
    $('business-activate').hidden=!user || !valid;
    $('business-signout').hidden=!user;
    $('business-account').textContent=user ? `Signed in as ${user.primaryEmailAddress?.emailAddress || 'your account'}` : '';
    if(user){if(mounted==='signup')window.Clerk.unmountSignUp?.($('business-auth'));if(mounted==='signin')window.Clerk.unmountSignIn?.($('business-auth'));mounted='';return;}
    // A Business invitation is normally the administrator's first contact
    // with SecureIntent, so account creation is the primary path. Existing
    // users can still choose the explicit sign-in link.
    const mode=new URLSearchParams(location.search).get('mode')==='signin'?'signin':'signup';
    if(mounted===mode)return;
    mounted=mode;
    const common={forceRedirectUrl:SI.page('business_promo.html'),signInForceRedirectUrl:SI.page('business_promo.html'),signUpForceRedirectUrl:SI.page('business_promo.html')};
    if(mode==='signup')window.Clerk.mountSignUp($('business-auth'),{...common,signInUrl:SI.page('business_promo.html?mode=signin')});
    else window.Clerk.mountSignIn($('business-auth'),{...common,signUpUrl:SI.page('business_promo.html?mode=signup')});
  }
  $('business-signout').addEventListener('click',()=>window.Clerk.signOut({redirectUrl:SI.page('business_promo.html')}));
  $('business-activate').addEventListener('click',async()=>{
    if(busy)return;busy=true;$('business-activate').disabled=true;$('business-signout').disabled=true;
    $('business-message').textContent='Activating your organization…';
    try {
      const result=await post('/v1/business-promo/redeem',{token},true);
      if (!result.orgId.startsWith('org_si_')) await window.Clerk.setActive({organization:result.orgId});
      try{sessionStorage.removeItem(key);}catch{}
      valid=false;$('business-activate').hidden=true;$('business-open').hidden=false;
      $('business-message').textContent='Your Business workspace is ready: 1 admin seat and 149 user seats.';
      location.assign(SI.page('team.html'));
    } catch(error){$('business-message').textContent=error.message;}
    finally{busy=false;$('business-activate').disabled=false;$('business-signout').disabled=false;}
  });
  try {
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('Open the Business invitation link provided by SecureIntent.');
    await SI.ready({auth:true});
    const offer=await post('/v1/business-promo/inspect',{token});valid=true;
    $('business-description').textContent=`${offer.companyName} · Invitation for ${offer.emailHint}`;
    await window.Clerk.load();window.Clerk.addListener(render);render();
  } catch(error){$('business-description').textContent=error.message;}
})();
