// Synthetic browser fixtures only. Never deploy or route customer traffic here.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3004);
const origin = `http://${host}:${port}`;
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
const people = [
  { userId:'user_demo_admin', email:'maya@northstar.example', name:'Maya Chen', role:'org:admin', createdAt:1 },
  { userId:'user_demo_1', email:'sam@northstar.example', name:'Sam Rivera', role:'org:member', createdAt:2 },
  { userId:'user_demo_2', email:'lee@northstar.example', name:'Lee Morgan', role:'org:member', createdAt:3 },
  { userId:'user_demo_3', email:'jules@northstar.example', name:'Jules Patel', role:'org:member', createdAt:4 },
  { userId:'user_demo_4', email:'robin@northstar.example', name:'Robin Kim', role:'org:member', createdAt:5 },
  { userId:'user_demo_5', email:'alex@northstar.example', name:'Alex Park', role:'org:member', createdAt:6 },
];
const team = { team:{ orgId:'org_demo_northstar', name:'Northstar Engineering', role:'org:admin', status:'active', currentPeriodEnd:null, seats:150, seatsUsed:7, seatsAvailable:143, comp:true, source:'comp', members:people, invitations:[{id:'invite_demo_1',email:'taylor@northstar.example'}] } };
const settings = { settings:{ alertWebhook:'', alertMinType:'known-key', policy:{ blockInsteadOfWarn:false, requireSessionLock:false, extraPatterns:[], blockedSites:[], replaceDefaultPatterns:false }, policyVersion:3, alertDelivery:{ known:false, ok:null, consecutiveFailures:0, suppressedEvents:0, throttleWindowSeconds:60 } } };
const metrics = { metrics:{ days:30, total:263, activeActors:5,
  byDay:Array.from({length:30},(_,i)=>({day:`2026-09-${String(i+1).padStart(2,'0')}`,n:[3,8,5,12,6,9,4,11,7,2][i%10]})),
  byType:[{key:'known-key',n:112},{key:'env-credential',n:74},{key:'private-key',n:48},{key:'pii',n:29}],
  bySite:[{key:'chatgpt.com',n:104},{key:'claude.ai',n:73},{key:'gemini.google.com',n:52},{key:'perplexity.ai',n:34}],
  byAction:[{key:'cancelled',n:151},{key:'paste_anonymously',n:82},{key:'paste_anyway',n:30}] } };
const shadowDashboard = {
  organization:{name:'Northstar Engineering',email:'maya@northstar.example'},
  generatedAt: Date.now(), dataAsOf: Date.now(), policyVersion: 3, canManagePolicy: true,
  summary: { totalTools: 5, totalVisits: 486, unsanctionedUsagePercent: 61.1, pasteAttempts: 132, pasteBytes: 284910, sensitiveEvents: 9, highRiskDestinations: 2 },
  trends: Array.from({length:30},(_,i)=>({day:new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10),visits:i<6?17:16,pastes:i<12?5:4,sensitiveEvents:i<9?1:0})),
  tools: [
    {serviceId:'chatgpt',name:'ChatGPT',hostname:'chatgpt.com',classification:'sanctioned',visits:189,pastes:54,sensitiveEvents:2,lastSeen:Date.now()-240000},
    {serviceId:'claude',name:'Claude',hostname:'claude.ai',classification:'recognized',visits:121,pastes:36,sensitiveEvents:3,lastSeen:Date.now()-900000},
    {serviceId:'deepseek',name:'DeepSeek',hostname:'chat.deepseek.com',classification:'review',visits:82,pastes:23,sensitiveEvents:2,lastSeen:Date.now()-7200000},
    {serviceId:'gemini',name:'Gemini',hostname:'gemini.google.com',classification:'sanctioned',visits:61,pastes:14,sensitiveEvents:1,lastSeen:Date.now()-3600000},
    {serviceId:'perplexity',name:'Perplexity',hostname:'perplexity.ai',classification:'review',visits:33,pastes:5,sensitiveEvents:1,lastSeen:Date.now()-86400000},
  ]
};
const shadowLedger = { total:3, nextOffset:null, events:[
  {eventId:'evt_preview_1',timestamp:Date.now()-240000,hostname:'claude.ai',serviceId:'claude',reason:'OpenAI API key',action:'blocked',findingCount:1},
  {eventId:'evt_preview_2',timestamp:Date.now()-3600000,hostname:'chat.deepseek.com',serviceId:'deepseek',reason:'Email address',action:'paste_anonymously',findingCount:2},
  {eventId:'evt_preview_3',timestamp:Date.now()-7200000,hostname:'perplexity.ai',serviceId:'perplexity',reason:'High-entropy token',action:'paste_anyway',findingCount:1},
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
    res.end(`window.Clerk={user:{id:'user_demo_admin',fullName:'Maya Chen',primaryEmailAddress:{emailAddress:'maya@northstar.example'}},organization:{id:'org_demo_northstar',name:'Northstar Engineering'},setActive:async()=>{},session:{id:'session_fixture',getToken:async()=> 'synthetic-preview-token'},load:async()=>{},addListener:()=>{},signOut:()=>{},mountSignIn:()=>{},mountSignUp:()=>{}};`);
    return;
  }
  if (url.pathname.startsWith('/mock-api/')) {
    if (url.pathname === '/mock-api/v1/business-signup/inspect') return json(res, { enabled: false });
    if (url.pathname === '/mock-api/v1/business-promo/inspect') return json(res,{companyName:'Northstar Engineering',emailHint:'m***@northstar.example',seats:150});
    if (url.pathname === '/mock-api/v1/business-promo/redeem') return json(res,{ok:true,orgId:'org_demo_northstar',seats:150});
    if (url.pathname === '/mock-api/v1/team' && req.method === 'GET') return json(res, team);
    if (url.pathname === '/mock-api/v1/team/settings' && req.method === 'GET') return json(res, settings);
    if (url.pathname === '/mock-api/v1/team/metrics' && req.method === 'GET') return json(res, metrics);
    if (url.pathname === '/mock-api/v1/shadow/admin/dashboard' && req.method === 'POST') return json(res, shadowDashboard);
    if (url.pathname === '/mock-api/v1/shadow/admin/ledger' && req.method === 'POST') return json(res, shadowLedger);
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
