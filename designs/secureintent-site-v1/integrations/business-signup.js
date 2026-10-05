(() => {
 'use strict';
 const SI=window.SI,$=id=>document.getElementById(id);
 const campaignToken=new URLSearchParams(location.hash.slice(1)).get('campaign')||'';
 let email='',companyName='',claimToken='',newUser=false,busy=false,retryUntil=0;
 const messages={campaign_unavailable:'This Business invitation is missing, expired, or disabled. Request an active promo link from SecureIntent.',campaign_full_or_claimed:'This campaign has reached its allowance, or your account already has an activation in progress. Contact SecureIntent.',invalid_details:'Enter your organisation name and a valid work email.',invalid:'That code did not match. Check it and try again.',expired:'Verification expired. Request a new code.',locked:'Too many attempts. Request a new code.',too_soon:'Please wait 30 seconds before requesting another code.',too_many:'Too many requests. Please try again later.',in_progress:'Another request is in progress. Please wait and retry.',weak_password:'Choose a stronger password. Your email verification is preserved.',account_details_required:'Enter your name and a password with at least eight characters.',account_verification_required:'Sign in to your existing SecureIntent account and verify this email, then retry.',organization_already_claimed:'This account already owns a Business workspace. Sign in to the Business console.',activation_in_progress:'Workspace activation is already in progress. Please retry shortly.',forbidden:'This workspace is unavailable. Contact SecureIntent.',invitation_unavailable:'This activation has been revoked or expired. Contact SecureIntent.',recipient_denied:'This email is not enabled for the staging environment.',send_failed:'We couldn’t send your code. Wait for the countdown, then retry. If this continues, contact SecureIntent support.',organization_plan_unavailable:'SecureIntent is configuring the capacity for your Business workspace. Your invitation is reserved. Please contact SecureIntent support; requesting another code will not resolve this.',activation_unavailable:'Activation could not be confirmed. Retry activation; an existing workspace will be reused.'};
 messages.organization_domain_claimed='An organisation already uses this work email domain. Ask its administrator for an invitation or contact SecureIntent.';
 messages.organization_domain_suspended="Your organisation's previous SecureIntent workspace is suspended. Contact SecureIntent at info@secureintent.ai to restore or remove it.";
 messages.already_member='This email already belongs to a SecureIntent Business workspace. Ask that workspace\'s administrator, or contact SecureIntent.';
 function message(text,error=false){$('business-status').textContent=text;$('business-status').setAttribute('role',error?'alert':'status');}
 function screen(name){for(const key of ['start','code','account','done','closed','existing','registered'])$('business-'+key).hidden=key!==name;}
 function updateSendButtons(){
  const remaining=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
  const start=$('business-email-form').querySelector('button[type="submit"]'),resend=$('business-resend');
  start.disabled=busy||remaining>0;resend.disabled=busy||remaining>0;
  start.textContent=remaining?'Try again in '+remaining+'s':'Email me a code →';
  resend.textContent=remaining?'Resend in '+remaining+'s':'Resend code';
 }
 function setBusy(value){busy=value;document.querySelectorAll('[data-business-signup] button').forEach(b=>b.disabled=value);updateSendButtons();}
 setInterval(updateSendButtons,1000);
 async function request(path,body){
  await SI.ready();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45_000);
  try {
   const response=await SI.fetch(SI.config.apiBase+'/v1/business-signup'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify({...body,campaignToken}):undefined,cache:'no-store',signal:controller.signal});
   const data=await response.json().catch(()=>({}));
   if(path==='/start' && Number.isFinite(data.retryAfter) && data.retryAfter>0){retryUntil=Date.now()+Math.min(data.retryAfter,3600)*1000;updateSendButtons();}
   if(!response.ok)throw Object.assign(new Error(messages[data.error]||'The request could not be completed. Please retry.'),{code:data.error,data});
   return data;
  }finally{clearTimeout(timeout);}
 }
 function existingWorkspace(result){
  claimToken='';$('business-password').value='';
  $('business-existing-email').textContent=result.email||email;
  try{sessionStorage.setItem('si_business_open_org',result.orgId);}catch{}
  $('business-existing-console').href=SI.page('team.html?reauth=1#/overview');
  screen('existing');message('');
 }
 function registered(error){
  // The same card as the admin invitation page: who holds the domain, and what to do.
  const d=error.data?.domain||{},suspended=error.code==='organization_domain_suspended',dom=email.split('@')[1]||'';
  const h=$('business-registered-title'),accent=document.createElement('span');accent.className='accent';
  accent.textContent=suspended?'is suspended.':'already registered.';
  h.replaceChildren(document.createTextNode(suspended?"Your organisation's workspace":'Your organisation is'),document.createElement('br'),accent);
  $('business-registered-eyebrow').textContent=suspended?'Workspace suspended':'Already registered';
  $('business-registered-text').textContent=suspended
   ?`${d.companyName||'A previous workspace'}${dom?` for @${dom}`:''} is suspended. Contact SecureIntent to restore or remove it.`
   :`${d.companyName||'Your organisation'} already uses SecureIntent Business${dom?` for @${dom}`:''}. Ask your workspace administrator${d.adminHint?` (${d.adminHint})`:''} to invite you as a member.`;
  message('');screen('registered');
 }
 function failed(error){if(error.code==='organization_domain_claimed'||error.code==='organization_domain_suspended'){registered(error);return;}if(error.code==='organization_already_claimed'&&error.data?.orgId){existingWorkspace(error.data);return;}if(['promo_closed','campaign_unavailable'].includes(error.code))screen('closed');message(error.name==='AbortError'?'The request timed out. Retry to check or complete your activation.':error.message,true);}
 async function send(resend=false){
  if(busy||Date.now()<retryUntil||(!resend&&!$('business-email-form').reportValidity()))return;
  if(!resend){email=$('business-email').value.trim().toLowerCase();companyName=$('business-company').value.trim();}
  setBusy(true);message('Sending your verification code…');
  try{await request('/start',{email,companyName});claimToken='';$('business-code-email').textContent=email;$('business-code-input').value='';screen('code');$('business-code-input').focus();message('Check your inbox. The code expires in 10 minutes.');}
  catch(error){failed(error);}finally{setBusy(false);}
 }
 $('business-email-form').addEventListener('submit',event=>{event.preventDefault();void send();});
 $('business-resend').addEventListener('click',()=>void send(true));
 function restart(){if(busy)return;claimToken='';$('business-password').value='';$('business-code-input').value='';screen('start');message('');}
 $('business-back').addEventListener('click',restart);$('business-restart').addEventListener('click',restart);
 $('business-code-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!event.currentTarget.reportValidity())return;
  setBusy(true);message('Verifying your email…');
  try{
   const result=await request('/verify',{email,code:$('business-code-input').value.trim()});
   if(result.existingWorkspace){existingWorkspace(result);return;}
   claimToken=result.claimToken;newUser=result.newUser;
   $('business-new-fields').hidden=!newUser;
   for(const id of ['business-first','business-last','business-password']){$(id).required=newUser;$(id).disabled=!newUser;}
   $('business-account-note').textContent=newUser?'Choose your login details. Use this same account for your dashboard and extension.':'Your existing SecureIntent account will administer this workspace. Your sign-in details will stay the same.';
   $('business-code-input').value='';screen('account');message('');
  }catch(error){failed(error);}finally{setBusy(false);}
 });
 $('business-activate-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!claimToken||!event.currentTarget.reportValidity())return;
  setBusy(true);message('Preparing your Business workspace…');
  try{
   const result=await request('/activate',{email,claimToken,acceptedTerms:$('business-terms').checked,
    ...(newUser?{firstName:$('business-first').value.trim(),lastName:$('business-last').value.trim(),password:$('business-password').value}:{})});
   $('business-password').value='';claimToken='';
   $('business-done-email').textContent=result.email;
   $('business-welcome-status').textContent=result.welcomeEmailSent?'Your quick-start email has been sent. Check your inbox.':'Your workspace is active. The quick-start email could not be confirmed; you can continue below.';
   // Preserve only the organization selector through sign-in; never persist an activation token.
   try { sessionStorage.setItem('si_business_open_org',result.orgId); } catch { /* Account membership remains server-side. */ }
   $('business-console').href=SI.page('team.html?reauth=1#/overview');
   if(SI.config.pilot){$('business-install').hidden=true;$('business-pilot-note').hidden=false;}
   screen('done');message('');
  }catch(error){failed(error);}finally{setBusy(false);}
 });
 void(async()=>{setBusy(true);try{const result=await request('/inspect',{});screen(result.enabled?'start':'closed');}catch(error){failed(error);}finally{setBusy(false);}})();
})();
