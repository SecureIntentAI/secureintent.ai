// Synthetic browser fixtures only. Never deploy or route customer traffic here.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const host = process.env.BUSINESS_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3004);
const origin = `http://${host}:${port}`;
// BUSINESS_PREVIEW_MEMBER=1: signed in as a team member rather than the admin.
const member = process.env.BUSINESS_PREVIEW_MEMBER === '1';
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const people = [
  { userId:'user_demo_admin', email:'maya@northstar.example', name:'Maya Chen', role:'org:admin', createdAt:1 },
  { userId:'user_demo_1', email:'sam@northstar.example', name:'Sam Rivera', role:'org:member', createdAt:2 },
  { userId:'user_demo_2', email:'lee@northstar.example', name:'Lee Morgan', role:'org:member', createdAt:3 },
  // A second, full admin (not the owner).
  { userId:'user_demo_3', email:'jules@northstar.example', name:'Jules Patel', role:'org:admin', createdAt:4 },
  { userId:'user_demo_4', email:'robin@northstar.example', name:'Robin Kim', role:'org:member', createdAt:5 },
  { userId:'user_demo_5', email:'alex@northstar.example', name:'Alex Park', role:'org:member', createdAt:6 },
];
// ownerUserId and isOwner: Maya owns the team; billing stays with her.
const team = { team:{ orgId:'org_demo_northstar', name:'Northstar Engineering', role:'org:admin', ownerUserId:'user_demo_admin', isOwner:true, status:'active', currentPeriodEnd:null, seats:150, seatsUsed:7, seatsAvailable:143, comp:true, source:'comp', policyVersion:3, policyRollout:{ policyVersion:3, devices:5, applied:3, updating:1, attention:0, offline:1, pageGuardsConfirmed:2, lastReceiptAt:Date.now()-30000, savedAt:Date.now()-25*60_000, savedBy:'user_demo_admin' }, members:people.map((person, i) => {
  const device = (rollout, extra = {}) => ({ client:'extension', installationId:`dev-${i}`, extensionVersion:'1.2.0', lastSeenAt:Date.now()-60_000, appliedPolicyVersion:3, confirmedGuards:2, expectedPages:2, rollout, policyStatus: rollout === 'applied' ? 'guards_confirmed' : 'pending', ...extra });
  const devices = i === 1 ? [device('updating', { appliedPolicyVersion:2 })] : i === 4 ? [device('offline', { lastSeenAt:Date.now()-3*86_400_000, policyStatus:'offline' })] : [device('applied')];
  // Sam and Lee also run the desktop app (as in the Shadow AI desktop fixture).
  if (i === 1 || i === 2) devices.push(device('applied', { client:'desktop', installationId:`desk-${i}`, extensionVersion:'0.2.12', policyStatus:'applied' }));
  // The admin has not installed the extension yet (as in the original fixture).
  if (i === 0) return person;
  return { ...person, connection:{ status:'recently_connected', lastSeenAt:devices[0].lastSeenAt, devices } };
}), invitations:[{id:'invite_demo_1',email:'taylor@northstar.example'}] } };
// One saved team rule, rated High (ruleSeverities: OCSF 2 Low to 5 Critical). The
// optional legal pack is off; a policy save echoes it back like the other switches.
const settings = { settings:{ alertWebhook:'', alertMinType:'known-key', policy:{ blockInsteadOfWarn:false, requireSessionLock:false, extraPatterns:[{ label:'Northstar deploy token', regex:'NSD_[A-Z0-9]{32}', type:'known-key' }], blockedSites:[], replaceDefaultPatterns:false, legalPack:false }, policyVersion:3, alertDelivery:{ known:false, ok:null, consecutiveFailures:0, suppressedEvents:0, throttleWindowSeconds:60 },
  ruleSeverities:[{ label:'Northstar deploy token', severityId:4 }] } };
const metrics = { metrics:{ days:30, total:263, activeActors:5,
  byDay:Array.from({length:30},(_,i)=>({day:new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10),n:[3,8,5,12,6,9,4,11,7,2][i%10]})),
  byDayAction:Array.from({length:30},(_,i)=>{const day=new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10);const n=[3,8,5,12,6,9,4,11,7,2][i%10];return [{day,key:'cancelled',n:Math.ceil(n*0.45)},{day,key:'paste_anonymously',n:Math.floor(n*0.3)},{day,key:'paste_anyway',n:Math.max(0,n-Math.ceil(n*0.45)-Math.floor(n*0.3))}];}).flat(),
  previousTotal:188,
  byType:[{key:'known-key',n:112},{key:'env-credential',n:74},{key:'private-key',n:48},{key:'pii',n:29}],
  bySite:[{key:'chatgpt.com',n:104},{key:'claude.ai',n:73},{key:'gemini.google.com',n:52},{key:'perplexity.ai',n:34}],
  byAction:[{key:'cancelled',n:121},{key:'paste_anonymously',n:62},{key:'blocked',n:30},{key:'paste_anyway',n:30},{key:'sanitised',n:20},{key:'auto_redacted',n:14}],
  byClient:[{key:'extension',n:249},{key:'desktop',n:14}],
  // OCSF severity (5 Critical to 2 Low): always all four, Critical first. letThrough
  // counts the catches whose secret went on anyway (pasted anyway, or Undo on the desktop).
  bySeverity:[{severityId:5,name:'Critical',n:48,letThrough:4},{severityId:4,name:'High',n:112,letThrough:9},{severityId:3,name:'Medium',n:74,letThrough:12},{severityId:2,name:'Low',n:29,letThrough:5}] } };
const shadowDashboard = {
  organization:{name:'Northstar Engineering',email:'maya@northstar.example'},
  generatedAt: Date.now(), dataAsOf: Date.now(), policyVersion: 3, canManagePolicy: true,
  policyRollout: { observedDevices: 5, activeDevices: 4, confirmedDevices: 3, pendingDevices: 1, attentionDevices: 0, offlineDevices: 1, pageGuardsConfirmed: 2, lastReceiptAt: Date.now() - 30000 },
  // totalTools counts the two desktop-only tools (desktopOnlyTools) at the end of tools.
  summary: { totalTools: 7, desktopOnlyTools: 2, totalVisits: 486, unsanctionedUsagePercent: 61.1, pasteAttempts: 132, pasteBytes: 284910, sensitiveEvents: 9, highRiskDestinations: 2, outcomes: { blocked: 3, cancelled: 2, sanitised: 3, warning_bypassed: 1 } },
  // Varied days with weekend dips; the nine sensitive pastes match summary.outcomes.
  trends: Array.from({length:30},(_,i)=>{
    const day=new Date(Date.now()-(29-i)*86400000);
    const weekend=[0,6].includes(day.getUTCDay());
    const outcomes={blocked:[3,11,24].includes(i)?1:0,cancelled:[7,19].includes(i)?1:0,sanitised:[5,16,27].includes(i)?1:0,warning_bypassed:i===22?1:0};
    const sensitiveEvents=Object.values(outcomes).reduce((a,b)=>a+b,0);
    return {day:day.toISOString().slice(0,10),visits:weekend?6+(i%3):14+(i*7)%9,pastes:weekend?1+(i%2):3+(i*5)%5,sensitiveEvents,outcomes};
  }),
  // Desktop app catches per day, aligned with trends: the four in the desktop summary.
  desktopTrends: Array.from({length:30},(_,i)=>({day:new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10),catches:[4,12,20].includes(i)?1:i===27?1:0})),
  tools: [
    {serviceId:'chatgpt',name:'ChatGPT',hostname:'chatgpt.com',source:'web',classification:'sanctioned',visits:189,pastes:54,sensitiveEvents:2,activeSeats:3,seatNumbers:[1,2,4],lastSeen:Date.now()-240000},
    // Also found on members' computers by the desktop app.
    {serviceId:'claude',name:'Claude',hostname:'claude.ai',source:'web',classification:'recognized',visits:121,pastes:36,sensitiveEvents:3,activeSeats:2,seatNumbers:[3,9],lastSeen:Date.now()-900000,
      desktop:{memberCount:2,seatNumbers:[2,3],lastSeen:Date.now()-600000,kinds:['desktop_app','editor_extension']}},
    {serviceId:'deepseek',name:'DeepSeek',hostname:'chat.deepseek.com',source:'web',classification:'review',visits:82,pastes:23,sensitiveEvents:2,lastSeen:Date.now()-7200000},
    {serviceId:'gemini',name:'Gemini',hostname:'gemini.google.com',source:'web',classification:'sanctioned',visits:61,pastes:14,sensitiveEvents:1,lastSeen:Date.now()-3600000},
    {serviceId:'perplexity',name:'Perplexity',hostname:'perplexity.ai',source:'web',classification:'review',visits:33,pastes:5,sensitiveEvents:1,lastSeen:Date.now()-86400000},
    // Found only by the desktop app: no hostname, visits or paste rule.
    {serviceId:'desktop-ollama',name:'Ollama',hostname:'',source:'desktop',kind:'local_model',classification:'review',pasteMode:null,visits:0,pastes:0,sensitiveEvents:0,activeSeats:1,seatNumbers:[2],lastSeen:Date.now()-600000,observedHostnames:[]},
    {serviceId:'desktop-lm-studio',name:'LM Studio',hostname:'',source:'desktop',kind:'local_model',classification:'recognized',pasteMode:null,visits:0,pastes:0,sensitiveEvents:0,activeSeats:1,seatNumbers:[3],lastSeen:Date.now()-7200000,observedHostnames:[]},
  ]
};
// One desktop app catch (source 'desktop': no hostname, the app it was copied in);
// the last row has no source or severityId, as from an older API, and counts as the browser.
// severityId is OCSF: 5 Critical, 4 High, 3 Medium, 2 Low. destinationStatus is the
// destination's classification; null for a desktop catch (made on copy, before any destination).
const shadowLedger = { total:4, nextOffset:null, events:[
  {eventId:'evt_preview_1',source:'browser',seat:'Seat 2',seatNumber:2,timestamp:Date.now()-240000,hostname:'claude.ai',serviceId:'claude',reason:'OpenAI API key',action:'blocked',findingCount:1,severityId:4,destinationStatus:'recognized'},
  {eventId:'evt_preview_4',source:'desktop',seat:'Seat 3',seatNumber:3,timestamp:Date.now()-1800000,hostname:'',serviceId:'',sourceApp:'Visual Studio Code',reason:'AWS access key',action:'auto_redacted',findingCount:1,severityId:5,destinationStatus:null},
  {eventId:'evt_preview_2',seat:'Seat 9',seatNumber:9,timestamp:Date.now()-3600000,hostname:'chat.deepseek.com',serviceId:'deepseek',reason:'Email address',action:'sanitised',findingCount:2,severityId:3,destinationStatus:'review'},
  {eventId:'evt_preview_3',timestamp:Date.now()-7200000,hostname:'perplexity.ai',serviceId:'perplexity',reason:'High-entropy token',action:'warning_bypassed',findingCount:1},
] };
// AI on members' computers, as the desktop app reports it (POST /v1/shadow/admin/desktop).
const shadowDesktop = { available:true,
  summary:{ membersWithDesktop:2, membersWithLocalModel:2, toolsFound:5, newThisPeriod:1, desktopCatches:4 },
  members:[
    { seatNumber:2, name:'Sam Rivera', email:'sam@northstar.example', devices:[{ os:'windows', appVersion:'0.2.10', lastSeen:Date.now()-5*86400000 },{ os:'macos', appVersion:'0.2.12', lastSeen:Date.now()-600000 }],
      tools:[{ name:'Ollama', kind:'local_model', firstSeen:Date.now()-20*86400000, lastSeen:Date.now()-600000 },{ name:'GitHub Copilot', kind:'editor_extension', firstSeen:Date.now()-25*86400000, lastSeen:Date.now()-600000 },{ name:'Cursor', kind:'desktop_app', firstSeen:Date.now()-3*86400000, lastSeen:Date.now()-600000 }],
      catches:3, lastSeen:Date.now()-600000 },
    { seatNumber:3, name:'Lee Morgan', email:'lee@northstar.example', devices:[{ os:'linux', appVersion:'0.2.12', lastSeen:Date.now()-7200000 }],
      tools:[{ name:'LM Studio', kind:'local_model', firstSeen:Date.now()-12*86400000, lastSeen:Date.now()-7200000 },{ name:'Continue', kind:'editor_extension', firstSeen:Date.now()-12*86400000, lastSeen:Date.now()-7200000 }],
      catches:1, lastSeen:Date.now()-7200000 },
  ],
  tools:[
    { name:'Ollama', kind:'local_model', seatNumbers:[2], memberCount:1, firstSeen:Date.now()-20*86400000, lastSeen:Date.now()-600000 },
    { name:'LM Studio', kind:'local_model', seatNumbers:[3], memberCount:1, firstSeen:Date.now()-12*86400000, lastSeen:Date.now()-7200000 },
    { name:'GitHub Copilot', kind:'editor_extension', seatNumbers:[2], memberCount:1, firstSeen:Date.now()-25*86400000, lastSeen:Date.now()-600000 },
    { name:'Continue', kind:'editor_extension', seatNumbers:[3], memberCount:1, firstSeen:Date.now()-12*86400000, lastSeen:Date.now()-7200000 },
    { name:'Cursor', kind:'desktop_app', seatNumbers:[2], memberCount:1, firstSeen:Date.now()-3*86400000, lastSeen:Date.now()-600000 },
  ] };
const json = (res, body) => { res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };

http.createServer(async (req,res) => {
  const url = new URL(req.url, origin);
  if (url.pathname === '/integrations/config.js') {
    res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    res.end(`window.SI_CONFIG={production:null,preview:{apiBase:${JSON.stringify(origin+'/mock-api')},allowedOrigins:[${JSON.stringify(origin)}],clerkPublishableKey:'pk_test_visual_fixture',clerkScriptUrl:${JSON.stringify(origin+'/mock-clerk.js')},jwtTemplate:'secureintent'}};`);
    return;
  }
  if (url.pathname === '/mock-clerk.js') {
    res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    // Signed in by default. An invitation link (#invite=) starts signed out so the
    // one-code join card can be walked through; the ticket "signs in" locally.
    res.end(`(()=>{const USER={id:'user_demo_admin',fullName:'Maya Chen',primaryEmailAddress:{emailAddress:'maya@northstar.example'},passwordEnabled:false,updatePassword:async(o)=>{window.__previewPasswordSet=o&&o.newPassword;USER.passwordEnabled=true;}};const SESSION={id:'session_fixture',getToken:async()=> 'synthetic-preview-token'};
if(/[?&]preview_signed_out=1/.test(location.search))sessionStorage.setItem('preview-signed-out','1');
const inviting=(/[#&]invite=[a-f0-9]{64}/.test(location.hash)&&location.pathname.includes('account'))||((!!sessionStorage.getItem('si:business-member-invite')||sessionStorage.getItem('preview-signed-out')==='1')&&!sessionStorage.getItem('preview-joined'));
const listeners=[];
window.Clerk={user:inviting?null:USER,organization:{id:'org_demo_northstar',name:'Northstar Engineering'},session:inviting?null:SESSION,
client:{signIn:{create:async(o)=>({status:o&&o.strategy==='ticket'&&o.ticket?'complete':'needs_identifier',createdSessionId:'session_fixture'}),authenticateWithRedirect:async(o)=>{sessionStorage.setItem('preview-joined','1');sessionStorage.setItem('preview-google','1');location.assign(o.redirectUrl);}}},
setActive:async()=>{sessionStorage.setItem('preview-joined','1');window.Clerk.user=USER;window.Clerk.session=SESSION;listeners.forEach(f=>f());},
handleRedirectCallback:async()=>{},load:async()=>{},addListener:(f)=>{listeners.push(f);},signOut:()=>{},mountSignIn:()=>{},mountSignUp:()=>{},mountUserProfile:(el)=>{const box=document.createElement('div');box.style.cssText='margin-top:14px;padding:22px;border:1px dashed var(--field-border);border-radius:14px;color:var(--muted);font-size:13px;line-height:1.6';box.textContent='Clerk profile goes here on the live site: name, photo, email addresses, password, connected Google account, active devices. (The local preview has no real Clerk.)';el.replaceChildren(box);},unmountUserProfile:()=>{}};})();`);
    return;
  }
  if (url.pathname.startsWith('/mock-api/')) {
    if (url.pathname === '/mock-api/v1/business-signup/inspect') return json(res, { enabled: false });
    // Desktop sign-in approval (link.html, code typed): EXPR-ED22 has expired, WRNG-…
    // is unknown, ADMN-… and AGAN-… are admin unlocks (AGAN- needs a fresh sign-in),
    // any other code is a sign-in started two minutes ago from Pakistan.
    if (url.pathname.startsWith('/mock-api/v1/desktop/link/') && req.method === 'POST') {
      const body = JSON.parse(await new Promise(resolve => { let data = ''; req.on('data', c => data += c); req.on('end', () => resolve(data || '{}')); }));
      if (body.code === 'EXPR-ED22') { res.writeHead(410, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ error: 'code_expired' })); return; }
      if (String(body.code).startsWith('WRNG-')) { res.writeHead(404, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ error: 'code_invalid' })); return; }
      const purpose = /^(ADMN|AGAN)-/.test(body.code) ? 'admin_unlock' : 'sign_in';
      if (url.pathname.endsWith('/inspect')) return json(res, { device: { name: 'MacBook Pro', os: 'macos', appVersion: '0.2.12' }, startedAt: Date.now() - 120000, country: 'PK', expiresAt: Date.now() + 480000, email: 'maya@northstar.example', purpose });
      if (url.pathname.endsWith('/approve') && body.code.startsWith('AGAN-')) { res.writeHead(401, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ error: 'password_verification_required' })); return; }
      return json(res, { ok: true });
    }
    if (url.pathname === '/mock-api/v1/business-promo/inspect') return json(res,{companyName:'Northstar Engineering',email:'maya@northstar.example',emailHint:'m***@northstar.example',expiresAt:Date.now()+6*86400000,activated:false,seats:150,domain:{status:'available'}});
    if (url.pathname === '/mock-api/v1/business-promo/redeem') return json(res,{ok:true,orgId:'org_demo_northstar',seats:150});
    // Member invitation accepted by a signed-in account (the Google path in the preview).
    if (url.pathname === '/mock-api/v1/business-member/accept' && req.method === 'POST') return json(res, { ok: true, orgId: 'org_demo_northstar' });
    if (url.pathname === '/mock-api/v1/business-member/pending') return json(res, { invitation: null });
    // Domain link (#domain=…): any @northstar.example address; code 123456.
    if (url.pathname.startsWith('/mock-api/v1/business-promo/domain/') && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const step = url.pathname.split('/').pop();
      const fail = (status, error) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error })); };
      const onDomain = (e) => typeof e === 'string' && e.endsWith('@northstar.example');
      if (step === 'inspect') return json(res, { companyName: 'Northstar Engineering', emailDomain: 'northstar.example', expiresAt: Date.now() + 6 * 86400000, seats: 150, domain: { status: 'available' } });
      if (step === 'start') return !body.firstName ? fail(400, 'name_required') : !onDomain(body.email) ? fail(403, 'email_domain_mismatch') : json(res, { ok: true, email: body.email, retryAfter: 30 });
      if (step === 'verify') return body.code === '123456' && onDomain(body.email) ? json(res, { ok: true, orgId: 'org_demo_northstar', seats: 150, ticket: 'preview_ticket' }) : fail(400, 'invalid_code');
      if (step === 'redeem') return json(res, { ok: true, orgId: 'org_demo_northstar', seats: 150 });
    }
    // One-code admin setup. The local preview accepts the code 123456.
    if (url.pathname.startsWith('/mock-api/v1/business-promo/activate/') && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const fail = (status, error) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error })); };
      if (url.pathname.endsWith('/start')) return body.firstName ? json(res, { ok: true, email: 'maya@northstar.example', retryAfter: 30 }) : fail(400, 'name_required');
      if (url.pathname.endsWith('/verify')) return body.code === '123456' ? json(res, { ok: true, orgId: 'org_demo_northstar', seats: 150, ticket: 'preview_ticket' }) : fail(400, 'invalid_code');
    }
    if (url.pathname === '/mock-api/v1/entitlement' && req.method === 'GET') return json(res, { entitlement: { clerkUserId:'user_demo_admin', email:'maya@northstar.example', plan:'business_pro', source:'org_seat', pro:true, features:['rehydrate','ghost','session_lock'], status:'active', businessDomain:null, org:{ id:'org_demo_northstar', name:'Northstar Engineering', role:member?'org:member':'org:admin', seats:150 }, issuedAt:0, exp:9999999999 }, signature:null, personalSubscription:null });
    // A member's policy notice (BUSINESS_PREVIEW_MEMBER=1 only, so the admin checks are unchanged).
    if (member && url.pathname === '/mock-api/v1/business/connection/policy-status') return json(res, { orgId:'org_demo_northstar', orgName:'Northstar Engineering', version:3, updatedAt:new Date(Date.now()-25*60_000).toISOString(), status:'applied', controls:{ blockInsteadOfWarn:true, requireSessionLock:false, blockedSiteCount:2, blockedSites:['chatgpt.com','deepseek.com'], aiServiceRuleCount:1 } });
    // The admin pass: the real server opens it for a session started in the last 12 hours.
    if (url.pathname === '/mock-api/v1/business-access/unlock/clerk' && req.method === 'POST')
      return json(res, { accessToken: 'a'.repeat(64), expiresAt: Date.now() + 30 * 60000, orgId: 'org_demo_northstar' });
    if (url.pathname === '/mock-api/v1/team' && req.method === 'GET') return json(res, team);
    if (url.pathname === '/mock-api/v1/team/settings' && req.method === 'GET') return json(res, settings);
    if (url.pathname === '/mock-api/v1/team/settings/rule-severity' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const { label, severityId } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (![2, 3, 4, 5].includes(severityId) || !settings.settings.policy.extraPatterns.some(p => p.label === label)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'invalid_rule_severity' })); return; }
      settings.settings.ruleSeverities = [...settings.settings.ruleSeverities.filter(r => r.label !== label), { label, severityId }];
      return json(res, { ok: true, ruleSeverities: settings.settings.ruleSeverities });
    }
    if (url.pathname === '/mock-api/v1/team/settings/test-alert' && req.method === 'POST') {
      if (!settings.settings.alertWebhook) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'no_webhook' })); return; }
      return json(res, { ok: true });
    }
    if (url.pathname === '/mock-api/v1/team/settings' && ['PUT','POST'].includes(req.method)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!('policy' in body)) {
        // Alerts-only save: no revision check, revision unchanged (as the real API).
        Object.assign(settings.settings, { alertWebhook: body.alertWebhook ?? '', alertMinType: body.alertMinType ?? settings.settings.alertMinType });
        return json(res, settings);
      }
      if (body.expectedVersion !== settings.settings.policyVersion) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'policy_conflict' })); return; }
      const sent = body.policy?.extraPatterns ?? [];
      const kept = sent.filter(p => { try { new RegExp(p.regex); return true; } catch { return false; } });
      Object.assign(settings.settings, { policy: { ...settings.settings.policy, ...body.policy, extraPatterns: kept }, policyVersion: settings.settings.policyVersion + 1,
        detection: { teamPatterns: kept.length, builtInChecks: body.policy?.replaceDefaultPatterns && kept.length ? 'off' : 'on', droppedPatterns: sent.length - kept.length } });
      return json(res, settings);
    }
    if (url.pathname === '/mock-api/v1/team/metrics' && req.method === 'GET') return json(res, metrics);
    if (url.pathname.startsWith('/mock-api/v1/business-member/join/') && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const step = url.pathname.split('/').pop();
      const fail = (status, error) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error })); };
      if (!/^[a-f0-9]{64}$/.test(body.inviteToken || '')) return fail(400, 'invitation_unavailable');
      if (step === 'inspect') return json(res, { companyName: 'Northstar Engineering', email: 'sam@northstar.example', expiresAt: Date.now() + 6 * 86400000 });
      if (step === 'start') return body.firstName ? json(res, { ok: true, email: 'sam@northstar.example', retryAfter: 30 }) : fail(400, 'name_required');
      // The local preview accepts the code 123456.
      if (step === 'verify') return body.code === '123456' ? json(res, { ok: true, orgId: 'org_demo_northstar', ticket: 'preview_ticket' }) : fail(400, 'invalid_code');
    }
    if (url.pathname === '/mock-api/v1/team/member-report' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const idx = team.team.members.findIndex(m => m.userId === body.userId);
      if (idx < 0) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'member_not_found' })); return; }
      const m = team.team.members[idx];
      const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
      const scale = days / 30;
      const n = (v) => Math.max(0, Math.round(v * scale));
      const devices = (m.connection?.devices || []).map(d => ({ client: d.client, extensionVersion: d.extensionVersion, lastSeenAt: d.lastSeenAt, appliedPolicyVersion: d.appliedPolicyVersion, policyState: d.policyStatus, rollout: d.rollout }));
      return json(res, {
        days, policyVersion: team.team.policyVersion,
        member: { userId: m.userId, name: m.name, email: m.email, role: m.role, joinedAt: Date.now() - (20 - idx) * 86_400_000, seatNumber: idx + 1, lastSeenAt: devices[0]?.lastSeenAt ?? null },
        devices,
        activity: idx === 0 ? { days, total: 0, activeActors: 0, byDay: [], byType: [], bySite: [], byAction: [],
          bySeverity: [{ severityId: 5, name: 'Critical', n: 0 }, { severityId: 4, name: 'High', n: 0 }, { severityId: 3, name: 'Medium', n: 0 }, { severityId: 2, name: 'Low', n: 0 }] } : {
          days, total: n(23), activeActors: 1,
          byDay: Array.from({ length: days }, (_, i) => ({ day: new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10), n: [0, 1, 0, 2, 0, 0, 3, 1, 0, 0][i % 10] })),
          byType: [{ key: 'known-key', n: n(11) }, { key: 'pii', n: n(7) }, { key: 'env-credential', n: n(5) }],
          bySite: [{ key: 'chatgpt.com', n: n(14) }, { key: 'claude.ai', n: n(6) }, { key: 'github.com', n: n(3) }],
          byAction: [{ key: 'cancelled', n: n(9) }, { key: 'paste_anonymously', n: n(6) }, { key: 'blocked', n: n(4) }, { key: 'paste_anyway', n: n(3) }, { key: 'sanitised', n: n(1) }],
          bySeverity: [{ severityId: 5, name: 'Critical', n: n(3), letThrough: n(1) }, { severityId: 4, name: 'High', n: n(11), letThrough: n(2) }, { severityId: 3, name: 'Medium', n: n(5), letThrough: 0 }, { severityId: 2, name: 'Low', n: n(4), letThrough: 0 }],
        },
        aiTools: idx === 0 ? [] : [
          { serviceId: 'chatgpt', name: 'ChatGPT', visits: n(41), pastes: n(18), sensitiveEvents: n(6), lastSeen: Date.now() - 3_600_000 },
          { serviceId: 'claude', name: 'Claude', visits: n(12), pastes: n(5), sensitiveEvents: n(2), lastSeen: Date.now() - 7_200_000 },
          { serviceId: 'deepseek', name: 'DeepSeek', visits: n(3), pastes: 0, sensitiveEvents: 0, lastSeen: Date.now() - 86_400_000 },
        ],
        // What the desktop app found on this person's computer (Sam: Ollama and Cursor).
        desktopTools: idx === 1 ? [
          { name: 'Ollama', kind: 'local_model', firstSeen: Date.now() - 20 * 86_400_000, lastSeen: Date.now() - 600_000 },
          { name: 'Cursor', kind: 'desktop_app', firstSeen: Date.now() - 3 * 86_400_000, lastSeen: Date.now() - 600_000 },
        ] : [],
        recentSensitive: idx === 0 ? [] : [
          { timestamp: Date.now() - 600_000, hostname: 'claude.ai', serviceId: 'claude', action: 'blocked', reason: 'Credential detected', findingCount: 1 },
          { timestamp: Date.now() - 900_000, hostname: 'chatgpt.com', serviceId: 'chatgpt', action: 'sanitised', reason: 'Personal information detected', findingCount: 42 },
          { timestamp: Date.now() - 5_400_000, hostname: 'chatgpt.com', serviceId: 'chatgpt', action: 'warning_bypassed', reason: 'Credential detected', findingCount: 1 },
          { timestamp: Date.now() - 86_400_000, hostname: 'chatgpt.com', serviceId: 'chatgpt', action: 'cancelled', reason: 'High-entropy secret detected', findingCount: 1 },
        ],
      });
    }
    if (url.pathname === '/mock-api/v1/team/member/remove' && req.method === 'POST') return json(res, { ok: true });
    // Make admin / Make member, with the real API's refusals.
    if (url.pathname === '/mock-api/v1/team/member/role' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const { userId, role } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const fail = (status, error) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error })); };
      const m = team.team.members.find(x => x.userId === userId);
      if (!['admin', 'member'].includes(role)) return fail(400, 'invalid_role');
      if (!m) return fail(404, 'member_not_found');
      if (userId === team.team.ownerUserId) return fail(400, 'owner_role_fixed');
      m.role = role === 'admin' ? 'org:admin' : 'org:member';
      return json(res, { ok: true, userId, role });
    }
    if (url.pathname === '/mock-api/v1/shadow/admin/dashboard' && req.method === 'POST') return json(res, shadowDashboard);
    if (url.pathname === '/mock-api/v1/shadow/admin/ledger' && req.method === 'POST') return json(res, shadowLedger);
    if (url.pathname === '/mock-api/v1/shadow/admin/desktop' && req.method === 'POST') return json(res, shadowDesktop);
    if (url.pathname === '/mock-api/v1/shadow/admin/policy' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const tool = shadowDashboard.tools.find(t => t.serviceId === body.serviceId);
      if (!tool) return json(res, { error: 'invalid_service' });
      // As the real API: a desktop-only tool takes a classification only.
      if (tool.source === 'desktop' && body.pasteMode !== undefined && body.pasteMode !== 'normal') { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'invalid_paste_mode' })); return; }
      Object.assign(tool, { classification: body.classification }, tool.source === 'desktop' ? {} : { pasteMode: body.pasteMode });
      shadowDashboard.policyVersion += 1;
      // One shared revision, as in the real API.
      settings.settings.policyVersion = shadowDashboard.policyVersion;
      return json(res, { ok: true, policyVersion: shadowDashboard.policyVersion, services: [] });
    }
    if (url.pathname === '/mock-api/v1/shadow/admin/service-activity' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const tool = shadowDashboard.tools.find(t => t.serviceId === body.serviceId);
      if (!tool) return json(res, { error: 'invalid_service' });
      const seatsUsed = tool.seatNumbers || [];
      // Members who have the tool only on their computer come back as desktop rows.
      const desktopSeats = (tool.desktop?.seatNumbers || []).filter(n => !seatsUsed.includes(n)).map(seatNumber => ({ seatNumber, source: 'desktop', lastSeen: tool.desktop.lastSeen }));
      if (body.kind === 'seats') return json(res, { serviceId: tool.serviceId, seats: [...seatsUsed.map((seatNumber, i) => ({ seatNumber, visits: 14 - i * 5, pastes: 9 - i * 4, sensitiveEvents: i ? 0 : 3, lastSeen: Date.now() - (i + 1) * 3_600_000 })), ...desktopSeats] });
      const outcomesCycle = ['blocked', 'sanitised', null, 'warning_bypassed', null, 'cancelled'];
      const all = Array.from({ length: tool.pastes }, (_, i) => ({ eventId: `p${i}`, seatNumber: seatsUsed[i % Math.max(1, seatsUsed.length)] ?? null, timestamp: Date.now() - i * 2_700_000, byteSize: 300 + (i * 977) % 6000, outcome: outcomesCycle[i % outcomesCycle.length], reason: null }));
      const offset = Number(body.offset) || 0, limit = Number(body.limit) || 25;
      const page = all.slice(offset, offset + limit);
      return json(res, { serviceId: tool.serviceId, total: all.length, pastes: page, nextOffset: offset + page.length < all.length ? offset + page.length : null });
    }
    if (url.pathname === '/mock-api/v1/shadow/admin/seats' && req.method === 'POST') return json(res, { seats: people.map((person, index) => ({ seatNumber: index + 1, name: person.name, email: person.email })) });
    res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'fixture_endpoint_missing'})); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (decoded.split('/').some(p => p === '..' || p.startsWith('.') && p !== '.well-known') || decoded.includes('\\')) { res.writeHead(400); res.end(); return; }
  let file = path.join(root, decoded);
  try { if ((await stat(file)).isDirectory()) file = path.join(file,'index.html'); }
  catch { if (!path.extname(file)) file += '.html'; }
  if (!file.startsWith(root)) { res.writeHead(404); res.end(); return; }
  try {
    let data = await readFile(file);
    if (path.extname(file) === '.html') {
      data = Buffer.from(data.toString().replace(/<body([^>]*)>/, '<body$1><div style="position:fixed;bottom:12px;left:12px;z-index:99999;background:#173347;color:white;padding:8px 12px;border-radius:8px;font:12px sans-serif;pointer-events:none">LOCAL PREVIEW · synthetic accounts and sample activity</div>'));
    }
    res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port,host,()=>console.log(`Synthetic Business admin preview: ${origin}/team.html`));
