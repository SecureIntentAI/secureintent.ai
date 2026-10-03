'use strict';

import { downloadShadowPdf } from './pdf-report.js';

// Hosted copy of the extension dashboard. Authentication and API configuration
// come from the site's shared runtime. Demo/preview bypasses are not enabled.
const PREVIEW = false;
const EXTENSION_DEMO = false;
export async function mountDashboard(root = document, integrated = false) {
const EMBED = integrated;
const themeElement = integrated ? root.host : document.documentElement;
const activeView = () => !integrated || location.hash === '#/shadow';
const POLL_MS = 5000;
const LIMIT = 25;
const $ = selector => root.querySelector(selector);
const $$ = selector => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const fmt = value => number(value).toLocaleString('en-US');
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const modes = { normal: 'Normal protection', block_sensitive: 'Block sensitive pastes', block_all: 'Block all pastes' };
const classifications = { sanctioned: 'Sanctioned', recognized: 'Recognised', review: 'Needs review' };
const outcomes = { blocked: 'Blocked', cancelled: 'Cancelled', sanitised: 'Sanitised & pasted', warning_bypassed: 'Warning bypassed' };
const marks = { chatgpt: 'G', claude: '✳', gemini: '✧', copilot: 'C', perplexity: 'P', deepseek: 'D' };
const date = value => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString();
};
const bytes = value => number(value) < 1024 ? `${fmt(value)} B` : number(value) < 1048576 ? `${(number(value) / 1024).toFixed(1)} KB` : `${(number(value) / 1048576).toFixed(1)} MB`;
const pasteMode = tool => Object.hasOwn(modes, tool.pasteMode) ? tool.pasteMode : tool.pasteBlocked ? 'block_all' : 'normal';
const classification = tool => Object.hasOwn(classifications, tool.classification) ? tool.classification : 'review';
const badge = tool => `<span class="badge ${classification(tool) === 'recognized' ? 'progress' : classification(tool)}">${classifications[classification(tool)]}</span>`;
const state = { days: 30, seatNumber: null, seats: [], seatsLoaded: false, chart: 'visits', search: '', filter: 'all', reviewFilter: 'all', view: 'list', offset: 0, nextOffset: null,
  dashboard: null, ledger: null, recent: [], scope: '', ready: false, saving: false, stale: true };
let extensionDemo, previewApi, timer, retryDelay = POLL_MS, requestController, requestId = 0, toastTimer, dialogTrigger;
const tools = () => state.dashboard?.tools || [];
const canManage = () => state.ready && !state.stale && state.dashboard?.canManagePolicy === true;
const toolById = id => tools().find(tool => tool.serviceId === id);

async function api(path, body, signal) {
  // Business grants require the session-bound sid omitted by JWT templates.
  const token = await window.Clerk?.session?.getToken();
  if (!token) throw Object.assign(new Error('Your session expired. Sign in again.'), { status: 401 });
  const response = await window.SI.fetch(window.SI.config.apiBase + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...window.SIAdminAccess?.headers() },
    body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if(data.error==='admin_reauthentication_required') {
      window.SIAdminAccess?.clear();
      window.dispatchEvent(new Event('si-admin-lock'));
      if(!integrated)location.href=window.SI.page('team.html?reauth=1#/shadow');
    }
    const messages = {
      unauthenticated: 'Your session expired. Sign in again.',
      business_organisation_required: 'Select your Business organisation to view its Shadow AI activity.',
      business_plan_required: 'An active Business plan is required for this dashboard.',
      forbidden: 'Only a Business organisation admin can access this dashboard.',
      business_promo_required: 'An activated Business invitation is required for this workspace.',
      policy_conflict: 'A newer policy was saved elsewhere. Refresh and review it before saving again.',
      unavailable: 'Shadow AI is temporarily unavailable. Retrying automatically.',
    };
    throw Object.assign(new Error(messages[data.error] || `The request could not be completed (${response.status}).`), { status: response.status });
  }
  return data;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}
function closeExportMenu(restoreFocus = false) {
  $('#export-menu').hidden = true;
  $('#export-button').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#export-button').focus();
}
function reportSnapshot() {
  return { sampleData: PREVIEW, localExtensionDemo: EXTENSION_DEMO, stale: state.stale, periodDays: state.days,
    reportSubject: state.seatNumber === null ? 'Entire organisation' :
      (state.seats.find(seat => seat.seatNumber === state.seatNumber)?.name ||
       state.seats.find(seat => seat.seatNumber === state.seatNumber)?.email || `Seat ${state.seatNumber}`),
    reportIdentity: {adminName: window.Clerk?.user?.fullName || [window.Clerk?.user?.firstName,window.Clerk?.user?.lastName].filter(Boolean).join(' ') || 'Not available', organizationName:state.dashboard?.organization?.name || 'Not available', organizationEmail:state.dashboard?.organization?.email || 'Not available'}, exportedAt:Date.now(),
    dashboard: state.dashboard, ledger: state.ledger, recent: state.recent };
}
function downloadJsonOverview() {
  if (!state.dashboard) return;
  const snapshot = { sampleData: PREVIEW, localExtensionDemo: EXTENSION_DEMO, stale: state.stale, periodDays: state.days, ...state.dashboard };
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `secureintent-shadow-ai${PREVIEW ? '-sample' : ''}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(PREVIEW ? 'Sample overview exported as JSON.' : 'Workspace overview exported as JSON.');
}
function downloadPdfReport() {
  if (!state.dashboard) return;
  try {
    downloadShadowPdf(reportSnapshot());
    toast('PDF report downloaded.');
  } catch (error) {
    toast(`PDF report could not be created: ${error.message || 'Please try again.'}`);
  }
}
function setTheme(theme) {
  themeElement.dataset.theme = theme;
  $$('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  try { localStorage.setItem('si-taskflow-v2-theme', theme); } catch { /* Theme works without persistent storage. */ }
}
function selectedGroup(attribute, value) {
  $$(`[${attribute}]`).forEach(button => {
    const selected = button.getAttribute(attribute) === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
function renderMetrics() {
  const summary = state.dashboard?.summary;
  const sanctioned = tools().filter(tool => classification(tool) === 'sanctioned').length;
  const unsanctioned = tools().length - sanctioned;
  const cards = [
    ['Discovered services', summary ? fmt(summary.totalTools) : '—', 'layers', summary ? `${sanctioned} sanctioned · ${unsanctioned} unsanctioned` : 'Waiting for activity'],
    ['Observed visits', summary ? fmt(summary.totalVisits) : '—', 'activity', `${state.days}-day reporting period`],
    ['Unsanctioned usage', summary ? `${number(summary.unsanctionedUsagePercent).toFixed(1)}<span class="metric-suffix">%</span>` : '—', 'shield', 'Share of visits to unsanctioned services'],
    ['Paste attempts', summary ? fmt(summary.pasteAttempts) : '—', 'clipboard', 'Attempted pastes, not submissions'],
  ];
  $('#metrics').innerHTML = cards.map(([title, value, glyph, note]) => `<article class="metric"><div class="metric-label"><span>${title}</span>${icon(glyph)}</div><div class="metric-main"><strong>${value}</strong></div><p class="metric-note">${note}</p></article>`).join('');
  const fraction = tools().length ? sanctioned / tools().length : 0;
  $('#progress-percent').innerHTML = `${summary ? Math.round(fraction * 100) : '—'}<span>%</span>`;
  $('#ring-value').style.strokeDashoffset = String(452.39 * (1 - fraction));
  $('#completed-count').textContent = summary ? sanctioned : '—';
  $('#open-count').textContent = summary ? unsanctioned : '—';
  for (const selector of ['#nav-service-count', '#inventory-count', '#queue-count']) $(selector).textContent = summary ? tools().length : '—';
  $('#nav-review-count').textContent = summary ? unsanctioned : '—';
  $('#review-filter-count').textContent = summary ? unsanctioned : '—';
  $('#sanctioned-filter-count').textContent = summary ? sanctioned : '—';
  $('#observed-services').textContent = summary ? `${tools().length} observed services` : 'Waiting for services';
  $('#attention-count').textContent = summary ? unsanctioned ? `${unsanctioned} unsanctioned services to review.` : tools().length ? 'All observed services are sanctioned.' : 'No AI services observed yet.' : 'Waiting for service decisions.';
  $('.attention-strip p > span').textContent = summary ? `${fmt(summary.highRiskDestinations)} higher-risk destinations · ${fmt(summary.sensitiveEvents)} sensitive events · ${bytes(summary.pasteBytes)} attempted volume` : 'Activity appears after enrolled extensions report it.';
}
function renderPolicyRollout() {
  const revision = state.dashboard?.policyVersion;
  const rollout = state.dashboard?.policyRollout;
  const summary = $('#policy-rollout-summary');
  const counts = $('#policy-rollout-counts');
  if (state.seatNumber !== null) {
    summary.textContent = 'Policy delivery is reported for the whole organisation.';
    counts.replaceChildren();
    $('#policy-rollout-note').textContent = 'Select Entire organisation to review connected devices and policy acknowledgements.';
    return;
  }
  if (!state.dashboard || !rollout) {
    summary.textContent = state.dashboard ? `Revision ${revision} saved. Waiting for fresh device reports…` : 'Waiting for workspace data…';
    counts.replaceChildren();
    $('#policy-rollout-note').textContent = 'Reports update as connected extensions receive the policy and confirm their open page guards.';
    return;
  }
  const active = number(rollout.activeDevices);
  const confirmed = number(rollout.confirmedDevices);
  const pending = number(rollout.pendingDevices);
  const attention = number(rollout.attentionDevices);
  const offline = number(rollout.offlineDevices);
  summary.textContent = active
    ? `Revision ${revision}: ${confirmed} of ${active} recently connected devices reported active page guards.`
    : `Revision ${revision}: no extension has checked in during the last two minutes.`;
  counts.innerHTML = [
    `${confirmed} confirmed`, `${pending} pending`, `${attention} need attention`, `${offline} offline`,
  ].map(label => `<span>${label}</span>`).join('');
  $('#policy-rollout-note').textContent = `Devices seen in the last 30 days: ${fmt(rollout.observedDevices)}. Last report: ${date(rollout.lastReceiptAt)}. Reports describe open page guards; they do not prove coverage on every site.`;
}
function renderChart() {
  const rows = state.dashboard?.trends || [];
  const sum = rows.reduce((n, row) => n + number(row[state.chart]), 0);
  $('#chart-total').textContent = state.dashboard ? fmt(sum) : '—';
  $('#chart-unit').textContent = state.chart === 'visits' ? 'observed visits' : 'paste attempts';
  $('#chart-legend').textContent = state.chart === 'visits' ? 'Service visits' : 'Paste attempts';
  $('#chart-caption').textContent = state.chart === 'visits' ? 'A visit is an observed page visit, not a submitted AI request.' : 'Paste attempts are not submissions. Pasted content is never included.';
  if (!rows.length || !sum) {
    $('#chart').innerHTML = `<p class="empty-state">${state.dashboard ? 'No activity in this reporting period.' : 'Waiting for activity data…'}</p>`;
    return;
  }
  // Sum actual daily API buckets. No interpolation or fabricated live trends.
  const groupSize = Math.ceil(rows.length / (state.days === 7 ? 7 : 10));
  const buckets = [];
  for (let i = 0; i < rows.length; i += groupSize) {
    const group = rows.slice(i, i + groupSize);
    buckets.push({ start: String(group[0].day), end: String(group.at(-1).day), value: group.reduce((n, row) => n + number(row[state.chart]), 0) });
  }
  const width = Math.max(240, Math.round($('#chart').getBoundingClientRect().width));
  const height = 218, left = 40, right = width - 10, top = 14, bottom = height - 30;
  const step = state.chart === 'visits' ? 100 : 5;
  const max = Math.max(step, Math.ceil(Math.max(...buckets.map(b => b.value)) / step) * step);
  const interval = (right - left) / buckets.length, barWidth = Math.min(30, interval * .42);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${fmt(sum)} ${state.chart} over ${state.days} days"><title>${PREVIEW ? 'Sample' : 'Observed'} activity over ${state.days} days</title>`;
  for (let i = 0; i <= 4; i++) {
    const y = top + (bottom - top) * i / 4;
    svg += `<line class="chart-gridline" x1="${left}" x2="${right}" y1="${y}" y2="${y}"/><text x="30" y="${y + 3}" text-anchor="end">${fmt(Math.round(max * (4 - i) / 4))}</text>`;
  }
  buckets.forEach((bucket, index) => {
    const x = left + interval * (index + .5) - barWidth / 2, barHeight = (bottom - top) * bucket.value / max;
    const parsed = new Date(`${bucket.start}T12:00:00Z`);
    const label = Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-US', state.days === 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });
    svg += `<rect class="chart-bar secondary" x="${x}" y="${top}" width="${barWidth}" height="${bottom - top}"/><rect class="chart-bar" x="${x}" y="${bottom - barHeight}" width="${barWidth}" height="${barHeight}"><title>${esc(bucket.start)}${bucket.start !== bucket.end ? ` – ${esc(bucket.end)}` : ''}: ${fmt(bucket.value)}</title></rect>`;
    if (index === buckets.length - 1 || index % (width < 470 ? 2 : state.days === 7 ? 1 : 2) === 0) svg += `<text x="${x + barWidth / 2}" y="${height - 6}" text-anchor="middle">${esc(label)}</text>`;
  });
  $('#chart').innerHTML = svg + '</svg>';
}
function renderServices() {
  const visible = tools().filter(tool => (state.filter === 'all' || (state.filter === 'review' ? classification(tool) !== 'sanctioned' : classification(tool) === 'sanctioned')) && `${tool.name} ${tool.hostname}`.toLowerCase().includes(state.search));
  $('#service-grid').innerHTML = visible.map(tool => `<button class="service-card" data-service="${esc(tool.serviceId)}" aria-label="View ${esc(tool.name)} details and policy"><span class="service-card-top"><span class="service-logo">${esc(marks[tool.serviceId] || String(tool.name).slice(0, 1))}</span>${icon('arrow-up')}</span><strong>${esc(tool.name)}</strong><span class="service-domain">${esc(tool.hostname)}</span><span class="service-meta">${fmt(tool.visits)} visits <span>·</span> ${tool.activeSeats == null ? `${fmt(tool.pastes)} pastes` : `${fmt(tool.activeSeats)} seats`}</span>${badge(tool)}</button>`).join('');
  $('#service-empty').hidden = visible.length > 0;
  $('#service-empty').textContent = state.dashboard ? tools().length ? 'No services match. Try another name or status.' : 'No AI tools discovered in this reporting period.' : 'Waiting for service data…';
}
function renderReviews() {
  const visible = tools().filter(tool => state.reviewFilter === 'all' || (state.reviewFilter === 'done' ? classification(tool) === 'sanctioned' : classification(tool) !== 'sanctioned'));
  const rows = visible.map(tool => `<tr><td><div class="task-name"><span class="service-logo" aria-hidden="true">${esc(marks[tool.serviceId] || String(tool.name).slice(0, 1))}</span><button class="task-open" data-service="${esc(tool.serviceId)}">Review ${esc(tool.name)} policy<small>${esc(tool.hostname)}</small></button></div></td><td><span class="review-policy-name">${modes[pasteMode(tool)]}</span></td><td>${fmt(tool.visits)} visits</td><td>${fmt(tool.pastes)} pastes</td><td>${badge(tool)}</td></tr>`).join('');
  $('#review-list').innerHTML = visible.length ? `<table class="review-table"><caption class="sr-only">Organisation service policies</caption><thead><tr><th scope="col">Service review</th><th scope="col">Paste policy</th><th scope="col">Usage</th><th scope="col">Paste attempts</th><th scope="col">Classification</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-state">No services in this view.</p>';
  $('#review-board').innerHTML = ['review', 'recognized', 'sanctioned'].map(status => {
    const column = visible.filter(tool => classification(tool) === status);
    return `<div class="board-column"><h3>${classifications[status]}<span class="count-badge">${column.length}</span></h3>${column.length ? column.map(tool => `<button class="board-task" data-service="${esc(tool.serviceId)}">${badge(tool)}<strong>${esc(tool.name)}</strong><p>${esc(tool.hostname)}</p><div><span>${modes[pasteMode(tool)]}</span></div></button>`).join('') : '<p class="empty-state">No services.</p>'}</div>`;
  }).join('');
  $('#review-list').hidden = state.view !== 'list';
  $('#review-board').hidden = state.view !== 'board';
  $('#queue-summary').textContent = `Showing ${visible.length} of ${tools().length} service reviews`;
}
const eventTone = action => ({ blocked: 'high', cancelled: 'review', sanitised: 'done', warning_bypassed: 'medium' })[action] || 'low';
function renderActivity() {
  $('#timeline').innerHTML = state.recent.length ? state.recent.slice(0, 4).map(event => `<li><span class="timeline-icon ${event.action === 'blocked' ? 'warm' : ''}">${icon(event.action === 'sanitised' ? 'check' : 'shield')}</span><div><strong>${esc(outcomes[event.action] || 'DLP event')}</strong><p>${esc(event.hostname)} · ${esc(event.reason)}</p><time>${esc(date(event.timestamp))}</time></div></li>`).join('') : '<li><div></div><p class="empty-state">No sensitive activity in this period.</p></li>';
  const ledger = state.ledger;
  $('#ledger-body').innerHTML = ledger?.events.length ? ledger.events.map(event => `<tr><td>${esc(date(event.timestamp))}</td><td>${esc(event.seat || 'Unattributed')}</td><td>${esc(event.hostname)}<small>${esc(event.serviceId)}</small></td><td>${esc(event.reason)}</td><td><span class="badge ${eventTone(event.action)}">${esc(outcomes[event.action] || 'DLP event')}</span></td><td>${fmt(event.findingCount)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No sensitive events in this period.</td></tr>';
  const count = ledger?.events.length || 0;
  $('#ledger-count').textContent = `${fmt(ledger?.total)} events · ${count ? state.offset + 1 : 0}–${count ? state.offset + count : 0}`;
  state.nextOffset = ledger?.nextOffset ?? null;
  $('#prev').disabled = state.offset === 0;
  $('#next').disabled = state.nextOffset === null;
}
const renderCache = new Map();
function renderAll() {
  // Keep focus, scroll, and open editors stable when polling returns unchanged data.
  const parts = [
    ['metrics', [state.days, state.dashboard?.summary, tools()], renderMetrics],
    ['policy-rollout', [state.dashboard?.policyVersion, state.dashboard?.policyRollout], renderPolicyRollout],
    ['chart', [state.days, state.chart, state.dashboard?.trends], renderChart],
    ['services', [state.dashboard !== null, tools()], renderServices],
    ['reviews', tools(), renderReviews],
    ['activity', [state.offset, state.ledger, state.recent], renderActivity],
  ];
  for (const [key, data, render] of parts) {
    const signature = JSON.stringify(data);
    if (renderCache.get(key) !== signature) { renderCache.set(key, signature); render(); }
  }
}

function showService(id) {
  const tool = toolById(id);
  if (!tool) return;
  const editable = canManage();
  const description = { normal: 'Use the usual DLP warnings and available paste choices.', block_sensitive: 'Stop the whole paste when sensitive content is detected.', block_all: 'Stop every paste into this AI service.' };
  $('#detail-content').innerHTML = `<span class="service-logo">${esc(marks[id] || String(tool.name).slice(0, 1))}</span><h2 id="detail-title" style="margin-top:14px">${esc(tool.name)}</h2><p class="dialog-subtitle">${esc(tool.hostname)} · Team policy</p><dl class="dialog-meta"><div><dt>Observed visits · ${state.days} days</dt><dd>${fmt(tool.visits)}</dd></div><div><dt>Paste attempts</dt><dd>${fmt(tool.pastes)}</dd></div><div><dt>Attempted volume</dt><dd>${bytes(tool.bytes)}</dd></div><div><dt>Active seats</dt><dd>${tool.activeSeats == null ? 'Not collected' : fmt(tool.activeSeats)}</dd></div></dl>
    <form id="policy-form" class="policy-form" data-service-id="${esc(id)}"><fieldset ${editable ? '' : 'disabled'}><label>Service classification<select name="classification">${Object.entries(classifications).map(([value, label]) => `<option value="${value}" ${classification(tool) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><fieldset><legend>How should your team paste here?</legend>${Object.entries(modes).map(([value, label]) => `<label class="policy-option"><input type="radio" name="pasteMode" value="${value}" ${pasteMode(tool) === value ? 'checked' : ''}><span><strong>${label}</strong><small>${description[value]}</small></span></label>`).join('')}</fieldset></fieldset><p class="dialog-note">${EXTENSION_DEMO ? 'Local demo: policy changes apply to this browser’s open AI tabs immediately.' : PREVIEW ? 'Local preview: changes reset when you reload.' : 'Saves the organisation policy. Extension application will be shown only after a confirmed device acknowledgement.'} These controls govern pastes; website access remains available.</p>${editable ? '' : `<p class="dialog-note">${state.stale ? 'Refresh the dashboard before editing policy.' : 'Only organisation admins can change team policies.'}</p>`}<p id="policy-error" class="error-banner" role="alert" hidden></p><p id="policy-message" role="status" hidden></p><div class="dialog-actions"><button class="button" type="button" data-close-dialog>Close</button>${editable ? '<button class="button primary" id="save-policy" type="submit">Save team policy</button>' : ''}</div></form>`;
  dialogTrigger = root.activeElement || document.activeElement;
  $('#detail-dialog').showModal();
}
async function savePolicy(form) {
  if (state.saving || !canManage()) return;
  const data = new FormData(form);
  const change = { serviceId: form.dataset.serviceId, classification: data.get('classification'), pasteMode: data.get('pasteMode') };
  if (!Object.hasOwn(classifications, change.classification) || !Object.hasOwn(modes, change.pasteMode)) return;
  const scope = state.scope;
  const button = $('#save-policy');
  state.saving = true;
  clearTimeout(timer);
  requestId++;
  requestController?.abort();
  button.disabled = true;
  button.textContent = 'Saving…';
  form.querySelector('fieldset').disabled = true;
  $('#policy-error').hidden = true;
  $('#policy-message').hidden = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await api('/v1/shadow/admin/policy', {...change,expectedVersion:state.dashboard.policyVersion}, controller.signal);
    if (state.scope !== scope) return;
    Object.assign(toolById(change.serviceId), change);
    state.dashboard.policyVersion = result.policyVersion;
    state.dashboard.policyRollout = null;
    const message = EXTENSION_DEMO ? 'Demo policy saved and sent to open tabs.' : PREVIEW ? 'Preview policy updated. Changes reset on reload.' : `Saved: ${modes[change.pasteMode]} (revision ${result.policyVersion}). Waiting for device confirmation.`;
    $('#policy-status').textContent = message;
    $('#policy-message').textContent = message;
    $('#policy-message').hidden = false;
    renderAll();
    toast(message);
  } catch (error) {
    if (state.scope !== scope) return;
    $('#policy-error').textContent = error.name === 'AbortError' ? 'The save timed out. Refresh to check the policy before retrying.' : `Policy could not be saved: ${error.message}`;
    $('#policy-error').hidden = false;
  } finally {
    clearTimeout(timeout);
    state.saving = false;
    if (button.isConnected && state.scope === scope) { button.disabled = false; button.textContent = 'Save team policy'; form.querySelector('fieldset').disabled = !canManage(); }
    if (state.ready) await load();
  }
}

function schedule() {
  clearTimeout(timer);
  if (!PREVIEW && state.ready && !document.hidden && activeView()) timer = setTimeout(load, retryDelay);
}
async function load() {
  if (!state.ready || state.saving || document.hidden || !activeView()) return;
  clearTimeout(timer);
  const id = ++requestId;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  const days = state.days, offset = state.offset, seatNumber = state.seatNumber;
  const scope = { days, ...(seatNumber === null ? {} : { seatNumber }) };
  if (EXTENSION_DEMO) extensionDemo.beginRefresh(days, offset);
  $('#refresh').disabled = true;
  $('#dashboard-shell').setAttribute('aria-busy', 'true');
  try {
    const [dashboard, ledger, latest, seatList] = await Promise.all([
      api('/v1/shadow/admin/dashboard', scope, controller.signal),
      api('/v1/shadow/admin/ledger', { ...scope, limit: LIMIT, offset }, controller.signal),
      offset ? api('/v1/shadow/admin/ledger', { ...scope, limit: 4, offset: 0 }, controller.signal) : Promise.resolve(null),
      state.seatsLoaded ? Promise.resolve(null) : api('/v1/shadow/admin/seats', {}, controller.signal),
    ]);
    if (id !== requestId) return;
    if (!dashboard.summary || !Array.isArray(dashboard.tools) || !Array.isArray(dashboard.trends) || !Array.isArray(ledger.events)) throw new Error('The server returned incomplete dashboard data.');
    if (dashboard.canManagePolicy !== true) throw Object.assign(new Error('Only a Business organisation admin can access this dashboard.'), { status: 403 });
    $('#auth-gate').hidden = true;
    $('#dashboard-shell').hidden = false;
    state.dashboard = dashboard;
    state.ledger = ledger;
    state.recent = (latest || ledger).events;
    if (seatList) {
      state.seats = Array.isArray(seatList.seats) ? seatList.seats : [];
      state.seatsLoaded = true;
      const select = $('#report-seat');
      select.replaceChildren(new Option('Entire organisation', ''), ...state.seats.map(seat =>
        new Option(`${seat.name || seat.email || `Seat ${seat.seatNumber}`} · Seat ${seat.seatNumber}`, String(seat.seatNumber))));
      select.value = seatNumber === null ? '' : String(seatNumber);
    }
    state.stale = false;
    $('#error').hidden = true;
    $('#connection-status').textContent = EXTENSION_DEMO ? (dashboard.demoEnabled ? 'Live · local extension events' : 'Local recording paused') : PREVIEW ? 'Local preview · sample data' : 'Live · refreshes every 5s';
    $('#activity-label').textContent = EXTENSION_DEMO ? (dashboard.demoEnabled ? 'Live · local' : 'Paused') : PREVIEW ? 'Sample' : 'Live';
    $('#updated').textContent = PREVIEW ? 'Sample data · local changes reset on reload' : `Updated ${date(dashboard.generatedAt)} · Latest event: ${date(dashboard.dataAsOf)}`;
    $('#profile-role').textContent = EXTENSION_DEMO ? 'This browser only' : dashboard.canManagePolicy ? 'Workspace admin' : 'Workspace member';
    if (EXTENSION_DEMO) {
      $('#demo-toggle').textContent = dashboard.demoEnabled ? 'Pause recording' : 'Start recording';
      $('#demo-status').textContent = `${dashboard.demoEnabled ? 'Recording real AI visits and paste metadata in this browser.' : 'Start recording, then reload an AI tab and paste to see live updates.'} Stored locally; no cloud upload. ${number(dashboard.droppedEvents) ? `${fmt(dashboard.droppedEvents)} older events removed at the 5,000-event demo limit.` : ''}`;
    }
    retryDelay = POLL_MS;
    renderAll();
    if ($('#policy-form fieldset')) $('#policy-form fieldset').disabled = !canManage();
    if ($('#save-policy')) $('#save-policy').disabled = !canManage();
    $('#export-button').disabled = false;
  } catch (error) {
    if (id !== requestId) return;
    state.stale = true;
    if ([401, 403].includes(error.status)) {
      state.dashboard = null; state.ledger = null; state.recent = [];
      $('#detail-dialog').close(); renderAll();
      $('#export-button').disabled = true;
      closeExportMenu();
    }
    $('#error').textContent = error.name === 'AbortError' ? 'The refresh timed out. Retrying automatically.' : error.message;
    $('#error').hidden = false;
    $('#connection-status').textContent = 'Disconnected · retrying';
    $('#activity-label').textContent = 'Stale';
    if ($('#policy-form fieldset')) $('#policy-form fieldset').disabled = true;
    if ($('#save-policy')) $('#save-policy').disabled = true;
    retryDelay = Math.min(retryDelay * 2, 60000);
    if (error.status === 401) { state.ready = false; showSignIn('Your session expired. Sign in again.'); }
    if (error.status === 403) {
      state.ready = false;
      themeElement.classList.add('requires-auth');
      $('#dashboard-shell').hidden = true;
      $('#auth-gate').hidden = false;
      $('#gate-title').textContent = 'Business admin access required';
      $('#gate-copy').textContent = error.message;
      $('#clerk-auth').replaceChildren();
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (id === requestId) { $('#refresh').disabled = false; $('#dashboard-shell').setAttribute('aria-busy', 'false'); schedule(); }
  }
}
function clearWorkspace() {
  requestId++;
  requestController?.abort();
  clearTimeout(timer);
  state.dashboard = null; state.ledger = null; state.recent = []; state.offset = 0; state.stale = true;
  $('#detail-dialog').close();
  $('#toast').hidden = true;
  $('#error').hidden = true;
  $('#export-button').disabled = true;
  closeExportMenu();
  $('#policy-status').textContent = 'Policies apply across your organisation';
  $('#updated').textContent = 'Waiting for data';
  $('#connection-status').textContent = 'Connecting…';
  renderAll();
}
function showSignIn(message) {
  themeElement.classList.add('requires-auth');
  $('#dashboard-shell').hidden = true;
  $('#auth-gate').hidden = false;
  $('#gate-copy').textContent = message || 'Sign in with your Business organisation account to view team activity.';
  if (integrated) { window.dispatchEvent(new Event('si-team-auth-required')); return; }
  if (window.Clerk && !$('#clerk-auth').childElementCount) window.Clerk.mountSignIn($('#clerk-auth'), {
    signUpUrl: '/team.html?mode=signup',
    afterSignInUrl: EMBED ? '/team.html#/shadow' : '/shadow.html',
    fallbackRedirectUrl: EMBED ? '/team.html#/shadow' : '/shadow.html',
  });
}
function syncSession() {
  const clerk = window.Clerk;
  const scope = clerk.user && clerk.session ? `${clerk.user.id}:${clerk.session.id}:${clerk.organization?.id || ''}` : '';
  if (scope === state.scope && state.ready) return;
  state.ready = false;
  clearWorkspace();
  state.seatNumber = null; state.seats = []; state.seatsLoaded = false;
  $('#report-seat').replaceChildren(new Option('Entire organisation', ''));
  state.scope = scope;
  if (!scope) { showSignIn(); return; }
  themeElement.classList.remove('requires-auth');
  const name = clerk.user.fullName || clerk.user.firstName || 'Workspace member';
  $('#profile-name').textContent = name;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  $$('.profile-initials').forEach(el => { el.textContent = initials; });
  $('#workspace-name').textContent = clerk.organization?.name || 'Business workspace';
  $('#auth-gate').hidden = integrated;
  $('#dashboard-shell').hidden = !integrated;
  $('#gate-copy').textContent = 'Checking Business workspace access…';
  state.ready = true;
  retryDelay = POLL_MS;
  load();
}
async function start() {
  renderAll();
  $('#export-button').disabled = true;
  if (!integrated) { await window.SI.ready({ auth: true }); await window.Clerk.load(); }
  window.Clerk.addListener(syncSession);
  syncSession();
}

function reviewServices() {
  state.filter = 'review'; state.search = ''; $('#service-search').value = '';
  selectedGroup('data-service-filter', 'review'); renderServices();
  $('#services').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  $('#service-search').focus({ preventScroll: true });
}
root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.themeChoice) setTheme(button.dataset.themeChoice);
  if (button.dataset.chart) { state.chart = button.dataset.chart; selectedGroup('data-chart', state.chart); renderChart(); }
  if (button.dataset.serviceFilter) { state.filter = button.dataset.serviceFilter; selectedGroup('data-service-filter', state.filter); renderServices(); }
  if (button.dataset.reviewFilter) { state.reviewFilter = button.dataset.reviewFilter; selectedGroup('data-review-filter', state.reviewFilter); renderReviews(); }
  if (button.dataset.view) { state.view = button.dataset.view; selectedGroup('data-view', state.view); renderReviews(); }
  if (button.dataset.service) showService(button.dataset.service);
  if (button.hasAttribute('data-close-dialog') && !state.saving) button.closest('dialog').close();
});
root.addEventListener('change', event => {
  if (!event.target.closest('#policy-form') || state.saving) return;
  const message = $('#policy-message');
  message.textContent = 'Unsaved changes. Click Save team policy to apply them to your organization.';
  message.hidden = false;
  $('#policy-error').hidden = true;
});
root.addEventListener('submit', event => { if (event.target.id === 'policy-form') { event.preventDefault(); savePolicy(event.target); } });
$('#detail-dialog').addEventListener('cancel', event => { if (state.saving) event.preventDefault(); });
$('#detail-dialog').addEventListener('close', () => {
  if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
  else $('#review-policy').focus({ preventScroll: true });
});
$('#service-search').addEventListener('input', event => { state.search = event.target.value.trim().toLowerCase(); renderServices(); });
$('#period').addEventListener('change', event => { state.days = Number(event.target.value); state.offset = 0; clearWorkspace(); load(); });
$('#report-seat').addEventListener('change', event => {
  state.seatNumber = event.target.value === '' ? null : Number(event.target.value);
  clearWorkspace(); load();
});
$('#review-services').addEventListener('click', reviewServices);
$('#review-policy').addEventListener('click', reviewServices);
$('#refresh').addEventListener('click', load);
$('#prev').addEventListener('click', () => { state.offset = Math.max(0, state.offset - LIMIT); load(); });
$('#next').addEventListener('click', () => { if (state.nextOffset !== null) { state.offset = state.nextOffset; load(); } });
$('#signout').addEventListener('click', async () => {
  try { await window.Clerk.signOut(); } catch { toast('Sign-out failed. Check your connection and try again.'); }
});
$('#export-button').addEventListener('click', () => {
  if (!state.dashboard) return;
  const menu = $('#export-menu');
  menu.hidden = !menu.hidden;
  $('#export-button').setAttribute('aria-expanded', String(!menu.hidden));
  if (!menu.hidden) $('#export-pdf').focus();
});
$('#export-pdf').addEventListener('click', () => { closeExportMenu(); downloadPdfReport(); });
$('#export-json').addEventListener('click', () => { closeExportMenu(); downloadJsonOverview(); });
const mobile = matchMedia('(max-width: 760px)');
function setNavigation(open, restoreFocus = false) {
  const isOpen = mobile.matches && open;
  $('#sidebar').classList.toggle('open', isOpen); $('#sidebar').inert = mobile.matches && !isOpen;
  $('#scrim').hidden = !isOpen;
  $('#menu-button').setAttribute('aria-expanded', String(isOpen));
  $('#menu-button').setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  if (isOpen) $('#sidebar .nav a').focus();
  if (restoreFocus) $('#menu-button').focus();
}
$('#menu-button').addEventListener('click', () => setNavigation(!$('#sidebar').classList.contains('open')));
$('#scrim').addEventListener('click', () => setNavigation(false, true));
root.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!$('#export-menu').hidden) { closeExportMenu(true); return; }
  if ($('#sidebar').classList.contains('open')) setNavigation(false, true);
});
root.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest('.export-menu-wrap')) closeExportMenu();
});
mobile.addEventListener('change', () => setNavigation(false));
$$('.nav a[data-section]').forEach(link => link.addEventListener('click', () => {
  $$('.nav a').forEach(item => { item.classList.toggle('active', item === link); if (item === link) item.setAttribute('aria-current', 'location'); else item.removeAttribute('aria-current'); });
  $('.breadcrumb strong').textContent = { overview: 'Overview', services: 'AI services', reviews: 'Review queue', activity: 'Activity log' }[link.dataset.section];
  setNavigation(false);
  if (mobile.matches) { const section = $(link.getAttribute('href')); section.setAttribute('tabindex', '-1'); section.focus({ preventScroll: true }); }
}));
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && state.ready) { retryDelay = POLL_MS; load(); } });
window.addEventListener('online', () => { if (state.ready) { retryDelay = POLL_MS; load(); } });
let chartWidth = 0;
new ResizeObserver(entries => { const width = Math.round(entries[0].contentRect.width); if (width !== chartWidth) { chartWidth = width; renderChart(); } }).observe($('#chart'));
try { if (!integrated && localStorage.getItem('si-taskflow-v2-theme') === 'white') themeElement.dataset.theme = 'white'; } catch {}
setTheme(themeElement.dataset.theme);
setNavigation(false);
$('.nav a.active').setAttribute('aria-current', 'location');
if (integrated) {
  window.addEventListener('si-team-view', () => { clearTimeout(timer); if (activeView() && state.ready) load(); });
  new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'light' ? 'white' : 'secureintent')).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
}
await start().catch(error => { $('#gate-copy').textContent = 'The dashboard could not start. Reload this page to retry.'; $('#gate-error').textContent = error.message; $('#gate-error').hidden = false; });

}
if (!document.querySelector('#shadow-root')) {
  location.replace(new URL('../../team.html#/shadow', import.meta.url).href);
}
