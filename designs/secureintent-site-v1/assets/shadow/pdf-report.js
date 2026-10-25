'use strict';

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 44;
const RIGHT = PAGE_W - LEFT;
const BOTTOM = PAGE_H - 48;
const WIDTH = RIGHT - LEFT;
const COLORS = {
  navy: [0.055, 0.102, 0.176],
  ink: [0.12, 0.17, 0.25],
  muted: [0.38, 0.44, 0.52],
  faint: [0.55, 0.60, 0.67],
  line: [0.87, 0.89, 0.92],
  panel: [0.96, 0.97, 0.98],
  cyan: [0.12, 0.66, 0.78],
  peach: [0.91, 0.55, 0.43],
  red: [0.86, 0.27, 0.27],
  green: [0.18, 0.62, 0.42],
  grey: [0.62, 0.66, 0.72],
  purple: [0.53, 0.42, 0.82],
  clean: [0.80, 0.88, 0.93],
  weekend: [0.975, 0.98, 0.985],
  white: [1, 1, 1],
};

// Helvetica-Bold and Helvetica advance widths (1/1000 em), ASCII 32 to 126, from
// the standard font metrics: used to place the header's wordmark and right-aligned
// labels exactly. Kept in step with integrations/overview-pdf.js.
const W_REGULAR = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
const W_BOLD = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
const measure = (value, size, bold = false) => {
  const widths = bold ? W_BOLD : W_REGULAR;
  let total = 0;
  for (const ch of plain(value)) total += widths[ch.charCodeAt(0) - 32] ?? 556;
  return total * size / 1000;
};
const BRAND_CYAN = [0.45, 1, 1];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDay = day => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// OCSF severity of a ledger event, 5 Critical to 2 Low. Older APIs send none.
const SEVERITY = { 5: 'Critical', 4: 'High', 3: 'Medium', 2: 'Low' };
const DESKTOP_KINDS = { local_model: 'local AI model', editor_extension: 'AI editor extension', desktop_app: 'AI desktop app' };
const safeNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const count = value => Math.round(safeNumber(value)).toLocaleString('en-US');
const formatBytes = value => safeNumber(value) < 1024 ? `${count(value)} B` : safeNumber(value) < 1048576 ? `${(safeNumber(value) / 1024).toFixed(1)} KB` : `${(safeNumber(value) / 1048576).toFixed(1)} MB`;
const reportDate = value => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};
const plain = value => String(value ?? '')
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/·/g, '|').replace(/…/g, '...').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '?');
const escapePdf = value => plain(value).replace(/([\\()])/g, '\\$1');
const pdfColor = color => color.map(part => part.toFixed(3)).join(' ');

function makeReport(snapshot) {
  const pages = [];
  let page;
  let y;

  const push = command => page.push(command);
  const text = (value, x, top, size = 9, color = COLORS.ink, bold = false) => {
    const baseline = PAGE_H - top;
    push(`${pdfColor(color)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${baseline.toFixed(1)} Tm (${escapePdf(value)}) Tj ET`);
  };
  const rect = (x, top, width, height, color) => {
    push(`${pdfColor(color)} rg ${x.toFixed(1)} ${(PAGE_H - top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f`);
  };
  const line = (x1, top1, x2, top2, color = COLORS.line, width = 0.7) => {
    push(`${width} w ${pdfColor(color)} RG ${x1.toFixed(1)} ${(PAGE_H - top1).toFixed(1)} m ${x2.toFixed(1)} ${(PAGE_H - top2).toFixed(1)} l S`);
  };
  const textRight = (value, right, top, size, color, bold = false) => text(value, right - measure(value, size, bold), top, size, color, bold);
  /** The SecureIntent mark from the site logo (viewBox 250), `size` points tall, top-left at (x, top). Returns its width. */
  const mark = (x, top, size) => {
    const k = size / 120; // the mark spans y 75 to 195 of the 250 box
    const w = 28 * k;
    const X = px => x + w / 2 + (px - 50) * k;
    const T = py => top + (py - 75) * k;
    push('q 1 J');
    line(X(50), T(195), X(110), T(75), COLORS.white, w);
    line(X(130), T(195), X(160), T(135), BRAND_CYAN, w);
    line(X(190), T(75), X(190) + 0.01, T(75), BRAND_CYAN, w); // the dot: radius 14 = half the stroke
    push('Q');
    return 140 * k + w;
  };
  const wordmark = (x, top, size) => {
    text('SecureIntent', x, top, size, COLORS.white, true);
    text('.ai', x + measure('SecureIntent', size, true), top, size, BRAND_CYAN, true);
  };
  const headerOrg = (snapshot.reportIdentity || {}).organizationName || 'Your organisation';
  const headerDays = Array.isArray(snapshot.dashboard?.trends) ? snapshot.dashboard.trends : [];
  const headerRange = headerDays.length ? `${longDay(headerDays[0].day)} to ${longDay(headerDays.at(-1).day)}` : `Last ${count(snapshot.periodDays)} days`;
  const beginPage = () => {
    page = [];
    pages.push(page);
    // Brand header: logo and wordmark, workspace and period, then the title block.
    rect(0, 0, PAGE_W, 120, COLORS.navy);
    rect(0, 120, PAGE_W, 3, COLORS.cyan);
    wordmark(LEFT + mark(LEFT, 26, 22) + 9, 43, 15);
    const sourceLabel = snapshot.sampleData ? 'SAMPLE PREVIEW' : snapshot.localExtensionDemo ? 'LOCAL EXTENSION DEMO' : 'BUSINESS WORKSPACE';
    textRight(sourceLabel, RIGHT, 33, 7, [0.65, 0.86, 0.91], true);
    textRight(`Last ${count(snapshot.periodDays)} days`, RIGHT, 46, 10, COLORS.white, true);
    text('SHADOW AI', LEFT, 74, 7.5, [0.65, 0.86, 0.91], true);
    text('Security activity report', LEFT, 96, 22, COLORS.white, true);
    text(`${headerOrg}  |  ${headerRange}`, LEFT, 110, 8.5, [0.77, 0.83, 0.90]);
    y = 146;
  };
  const ensure = height => {
    if (y + height <= BOTTOM) return;
    beginPage();
  };
  const section = title => {
    ensure(30);
    text(title, LEFT, y + 11, 11, COLORS.ink, true);
    line(LEFT, y + 18, RIGHT, y + 18);
    y += 29;
  };
  const clipped = (value, maxChars) => {
    const str = plain(value);
    return str.length > maxChars ? `${str.slice(0, Math.max(1, maxChars - 3))}...` : str;
  };
  /** Text cut with "..." to fit `room` points, measured. */
  const fit = (value, room, size = 7) => {
    let str = plain(value);
    if (measure(str, size) <= room) return str;
    while (str.length > 1 && measure(`${str}...`, size) > room) str = str.slice(0, -1);
    return `${str.trimEnd()}...`;
  };
  /** A table row: each cell on one line, or two when it does not fit (the second cut to fit). */
  const tableRow = (values, widths, height) => {
    let x = LEFT;
    values.forEach((value, i) => {
      const room = widths[i] - 10;
      const str = plain(value);
      let lines = [str];
      if (measure(str, 7) > room) {
        const words = str.split(' ');
        let first = words.shift();
        while (words.length && measure(`${first} ${words[0]}`, 7) <= room) first += ` ${words.shift()}`;
        lines = measure(first, 7) > room || !words.length ? [fit(str, room)] : [first, fit(words.join(' '), room)];
      }
      if (lines.length === 1) text(lines[0], x + 5, y + height / 2 + 3, 7, COLORS.ink);
      else { text(lines[0], x + 5, y + height / 2 - 1.5, 7, COLORS.ink); text(lines[1], x + 5, y + height / 2 + 7.5, 7, COLORS.ink); }
      x += widths[i];
    });
  };

  beginPage();
  const dashboard = snapshot.dashboard;
  const summary = dashboard.summary || {};
  text(`Generated ${reportDate(snapshot.exportedAt || dashboard.generatedAt)}`, LEFT, y, 8, COLORS.muted);
  text(`Latest event ${reportDate(dashboard.dataAsOf)}`, LEFT + 250, y, 8, COLORS.muted);
  y += 18;
  const identity=snapshot.reportIdentity || {};
  text(`Organization: ${clipped(identity.organizationName || 'Not available',85)}`,LEFT,y,9,COLORS.ink,true); y+=15;
  text(`Administrator: ${clipped(identity.adminName || 'Not available',85)}`,LEFT,y,9); y+=15;
  text(`Organization email: ${clipped(identity.organizationEmail || 'Not available',85)}`,LEFT,y,9); y+=23;
  text(`Report for: ${clipped(snapshot.reportSubject || 'Entire organisation',85)}`,LEFT,y,9,COLORS.ink,true); y+=18;

  const cards = [
    ['AI services', count(summary.totalTools)],
    ['Observed visits', count(summary.totalVisits)],
    ['Unsanctioned usage', `${safeNumber(summary.unsanctionedUsagePercent).toFixed(1)}%`],
    ['Paste attempts', count(summary.pasteAttempts)],
    ['AI tools needing review', `${count(summary.highRiskDestinations)} of ${count(summary.totalTools)}`, safeNumber(summary.highRiskDestinations) ? COLORS.peach : null],
    ['Sensitive paste events', count(summary.sensitiveEvents)],
    ['Attempted paste volume', formatBytes(summary.pasteBytes)],
    ['Data status', snapshot.stale ? 'May be out of date' : 'Current at export'],
  ];
  // What happened to the sensitive pastes. Older APIs send no breakdown; then
  // the row is left out rather than shown as zeros.
  const outcomes = summary.outcomes;
  if (outcomes && typeof outcomes === 'object') {
    cards.push(
      ['Blocked', count(outcomes.blocked)],
      ['Cancelled', count(outcomes.cancelled)],
      ['Sanitised', count(outcomes.sanitised)],
      ['Pasted anyway', count(outcomes.warning_bypassed)],
    );
  }
  const gap = 8;
  const cardW = (WIDTH - gap * 3) / 4;
  cards.forEach(([label, value, tone], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const x = LEFT + col * (cardW + gap);
    const top = y + row * 58;
    rect(x, top, cardW, 51, COLORS.panel);
    text(clipped(label, 24), x + 8, top + 15, 7, COLORS.muted);
    text(clipped(value, 17), x + 8, top + 37, 13, tone || COLORS.ink, true);
  });
  y += Math.ceil(cards.length / 4) * 58 + 12;

  section('Activity per day');
  const trends = Array.isArray(dashboard.trends) ? dashboard.trends : [];
  // What happened to each day's paste attempts, bottom of the bar first.
  const SEGMENTS = [
    ['blocked', 'Blocked', COLORS.red],
    ['sanitised', 'Sanitised', COLORS.green],
    ['cancelled', 'Cancelled', COLORS.grey],
    ['warning_bypassed', 'Pasted anyway', COLORS.peach],
    ['other', 'Other sensitive', COLORS.purple],
    ['clean', 'Clean', COLORS.clean],
  ];
  const segmentsOf = row => {
    const o = row.outcomes || {};
    const known = ['blocked', 'sanitised', 'cancelled', 'warning_bypassed'].reduce((n, k) => n + safeNumber(o[k]), 0);
    const sensitive = Math.max(safeNumber(row.sensitiveEvents), known);
    return { blocked: safeNumber(o.blocked), sanitised: safeNumber(o.sanitised), cancelled: safeNumber(o.cancelled),
      warning_bypassed: safeNumber(o.warning_bypassed), other: sensitive - known, clean: Math.max(0, safeNumber(row.pastes) - sensitive) };
  };
  const axisMax = value => {
    const raw = Math.max(1, value) / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map(m => m * power).find(m => m >= raw);
    return Math.max(4, Math.ceil(step) * 4);
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayText = (day, opts = {}) => {
    const d = new Date(`${day}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return '';
    return [opts.weekday ? WEEKDAYS[d.getUTCDay()] : '', d.getUTCDate(), MONTHS[d.getUTCMonth()]].filter(Boolean).join(' ');
  };
  // One full-width chart, one bar per calendar day (UTC), labelled axes.
  const dailyChart = (title, unit, valueOf, stacked) => {
    const values = trends.map(valueOf);
    const total = values.reduce((a, b) => a + b, 0);
    ensure(150);
    text(title, LEFT, y + 2, 9, COLORS.ink, true);
    if (!total) {
      text('No activity recorded in this period.', LEFT, y + 22, 8, COLORS.faint);
      y += 38;
      return;
    }
    const peakIndex = values.indexOf(Math.max(...values));
    const active = values.filter(Boolean).length;
    text(`Total ${count(total)}  |  Busiest day ${dayText(trends[peakIndex].day, { day: 'numeric', month: 'short' })} (${count(values[peakIndex])})  |  Active on ${count(active)} of ${count(trends.length)} days`,
      LEFT + 190, y + 2, 7, COLORS.muted);
    const plotLeft = LEFT + 34, plotRight = RIGHT, top = y + 16, plotH = 82, base = top + plotH;
    const max = axisMax(Math.max(...values));
    const yOf = n => base - plotH * n / max;
    const slot = (plotRight - plotLeft) / trends.length;
    const barW = Math.max(1.2, Math.min(11, slot * 0.7));
    if (trends.length <= 31) trends.forEach((row, i) => {
      const weekday = new Date(`${row.day}T12:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) rect(plotLeft + i * slot, top, slot, plotH, COLORS.weekend);
    });
    for (let i = 0; i <= 4; i++) {
      const n = max * i / 4;
      line(plotLeft, yOf(n), plotRight, yOf(n), COLORS.line, i ? 0.4 : 0.8);
      const label = count(n);
      text(label, plotLeft - 5 - label.length * 3.6, yOf(n) + 2.5, 6.5, COLORS.faint);
    }
    // Y axis title, written vertically.
    push(`${pdfColor(COLORS.muted)} rg BT /F1 6.5 Tf 0 1 -1 0 ${(LEFT + 4).toFixed(1)} ${(PAGE_H - base + 4).toFixed(1)} Tm (${escapePdf(unit)}) Tj ET`);
    trends.forEach((row, i) => {
      const x = plotLeft + i * slot + (slot - barW) / 2;
      if (stacked) {
        const parts = segmentsOf(row);
        let stack = 0;
        for (const [key, , color] of SEGMENTS) {
          if (!parts[key]) continue;
          rect(x, yOf(stack + parts[key]), barW, yOf(stack) - yOf(stack + parts[key]), color);
          stack += parts[key];
        }
      } else if (values[i]) {
        rect(x, yOf(values[i]), barW, base - yOf(values[i]), COLORS.cyan);
      }
      if (i === peakIndex) {
        const label = count(values[i]);
        text(label, x + barW / 2 - label.length * 1.9, yOf(values[i]) - 3, 6.5, COLORS.ink, true);
      }
    });
    const labelEvery = Math.max(1, Math.ceil(trends.length / 8));
    trends.forEach((row, i) => {
      if (i % labelEvery && i !== trends.length - 1) return;
      if (i === trends.length - 1 && i % labelEvery && (i % labelEvery) < labelEvery / 2) return;
      const label = dayText(row.day, trends.length <= 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });
      text(label, plotLeft + i * slot + slot / 2 - label.length * 1.7, base + 10, 6.5, COLORS.faint);
    });
    text('Day (UTC)', (plotLeft + plotRight) / 2 - 14, base + 20, 6.5, COLORS.muted);
    y = base + 28;
    if (stacked) {
      let lx = plotLeft;
      for (const [key, label, color] of SEGMENTS) {
        const n = trends.reduce((sum, row) => sum + segmentsOf(row)[key], 0);
        if (!n) continue;
        rect(lx, y - 6, 6, 6, color);
        const item = `${label} ${count(n)}`;
        text(item, lx + 9, y, 7, COLORS.muted);
        lx += 18 + item.length * 3.8;
      }
      y += 10;
    }
    y += 8;
  };
  dailyChart('Paste attempts per day', 'Paste attempts', row => {
    const parts = segmentsOf(row);
    return Math.max(safeNumber(row.pastes), Object.values(parts).reduce((a, b) => a + b, 0));
  }, true);
  dailyChart('AI page visits per day', 'Visits', row => safeNumber(row.visits), false);
  // Secrets the desktop app caught on copy. Older APIs send no desktopTrends.
  const desktopDays = Array.isArray(dashboard.desktopTrends) ? new Map(dashboard.desktopTrends.map(row => [row.day, safeNumber(row.catches)])) : null;
  if (desktopDays) dailyChart('Desktop catches per day', 'Desktop catches', row => desktopDays.get(row.day) || 0, false);
  text('Visits show page loads, not AI submissions. Paste counts are attempts, not confirmed submissions.', LEFT, y, 7, COLORS.faint);
  y += desktopDays ? 10 : 19;
  if (desktopDays) {
    text('A desktop catch is a secret the SecureIntent desktop app caught when it was copied.', LEFT, y, 7, COLORS.faint);
    y += 19;
  }

  section('AI service inventory');
  const columnWidths = [74, 100, 82, 45, 45, 45, 116];
  const headers = ['Service', 'Hostname', 'Classification', 'Seats', 'Visits', 'Pastes', 'Paste policy'];
  const drawTableHeader = () => {
    rect(LEFT, y, WIDTH, 22, COLORS.panel);
    let x = LEFT;
    headers.forEach((label, i) => {
      text(label, x + 5, y + 14, 7, COLORS.muted, true);
      x += columnWidths[i];
    });
    y += 22;
  };
  const serviceRows = Array.isArray(dashboard.tools) ? dashboard.tools : [];
  const desktopOnlyRows = serviceRows.filter(tool => tool.source === 'desktop').length;
  if (!serviceRows.length) {
    text('No AI services were observed in this reporting period.', LEFT, y + 13, 8, COLORS.muted);
    y += 28;
  } else {
    drawTableHeader();
    serviceRows.forEach((tool, index) => {
      if (y + 25 > BOTTOM) { beginPage(); section('AI service inventory (continued)'); drawTableHeader(); }
      if (index % 2 === 1) rect(LEFT, y, WIDTH, 25, [0.985, 0.988, 0.992]);
      const classification = { sanctioned: 'Sanctioned', recognized: 'Recognised', review: 'Needs review' }[tool.classification] || 'Needs review';
      const pastePolicy = { normal: 'Normal protection', block_sensitive: 'Block sensitive', block_all: 'Block all pastes' }[tool.pasteMode] || (tool.pasteBlocked ? 'Block all pastes' : 'Normal protection');
      // A desktop-only tool (found by the desktop app, no website): its kind in place
      // of a hostname, members as seats, and no visits, pastes or paste rule.
      const desktopOnly = tool.source === 'desktop';
      const values = desktopOnly
        ? [tool.name, `Desktop: ${DESKTOP_KINDS[tool.kind] || 'AI tool'}`, classification,
          count(tool.activeSeats ?? (Array.isArray(tool.seatNumbers) ? tool.seatNumbers.length : 0)), '-', '-', 'Not applied on desktop']
        // A web service also used through its desktop app says so, as the card does.
        : [tool.name, `${tool.hostname || (tool.observedHostnames || []).join(', ')}${tool.desktop ? ' + desktop app' : ''}`, classification,
          tool.activeSeats == null ? 'N/A' : count(tool.activeSeats), count(tool.visits), count(tool.pastes), pastePolicy];
      let x = LEFT;
      values.forEach((value, i) => {
        text(desktopOnly ? fit(value, columnWidths[i] - 10) : clipped(value, Math.floor((columnWidths[i] - 10) / 4.2)), x + 5, y + 15, 7, COLORS.ink);
        x += columnWidths[i];
      });
      line(LEFT, y + 25, RIGHT, y + 25, COLORS.line, 0.4);
      y += 25;
    });
    if (desktopOnlyRows) {
      ensure(18);
      text(`${count(desktopOnlyRows)} ${desktopOnlyRows === 1 ? 'tool was' : 'tools were'} found only by the desktop app: Seats counts members who have it. Paste rules apply in the browser.`, LEFT, y + 12, 7, COLORS.faint);
      y += 16;
    }
  }
  y += 14;

  // AI on members' computers (desktop app). Left out when the API has none.
  const desktop = snapshot.desktop;
  if (desktop) {
    const ds = desktop.summary || {};
    section("AI on members' computers");
    ensure(20);
    text(`${count(ds.membersWithDesktop)} members with the desktop app  |  ${count(ds.membersWithLocalModel)} running a local AI model  |  ${count(ds.toolsFound)} AI tools found  |  ${count(ds.newThisPeriod)} new this period  |  ${count(ds.desktopCatches)} desktop catches`, LEFT, y + 6, 7.5, COLORS.muted);
    y += 18;
    const deskTools = Array.isArray(desktop.tools) ? desktop.tools : [];
    if (!desktop.memberCount || !deskTools.length) {
      text(desktop.memberCount ? "No AI tools found on members' computers in this period." : 'No desktop app data yet. Members appear once they sign in to the SecureIntent desktop app.', LEFT, y + 12, 8, COLORS.muted);
      y += 27;
    } else {
      const deskWidths = [118, 96, 183, 110];
      const deskHeaders = ['Tool', 'Kind', 'Members', 'Last seen'];
      const drawDeskHeader = () => {
        rect(LEFT, y, WIDTH, 22, COLORS.panel);
        let x = LEFT;
        deskHeaders.forEach((label, i) => { text(label, x + 5, y + 14, 7, COLORS.muted, true); x += deskWidths[i]; });
        y += 22;
      };
      drawDeskHeader();
      deskTools.forEach((tool, index) => {
        if (y + 26 > BOTTOM) { beginPage(); section("AI on members' computers (continued)"); drawDeskHeader(); }
        if (index % 2 === 1) rect(LEFT, y, WIDTH, 26, [0.985, 0.988, 0.992]);
        tableRow([tool.name, tool.kind, tool.members, reportDate(tool.lastSeen)], deskWidths, 26);
        line(LEFT, y + 26, RIGHT, y + 26, COLORS.line, 0.4);
        y += 26;
      });
    }
    y += 14;
  }

  const ledger = snapshot.ledger || { total: 0, events: [] };
  const events = Array.isArray(ledger.events) ? ledger.events : [];
  section(`Sensitive paste activity (${count(ledger.total)} total)`);
  if (!events.length) {
    text('No sensitive paste events are available in the current ledger page.', LEFT, y + 12, 8, COLORS.muted);
    y += 27;
  } else {
    // A Severity column once the API rates events; the others give up a little room for it.
    const rated = events.some(event => SEVERITY[event.severityId]);
    const dlpWidths = rated ? [72, 58, 52, 84, 77, 88, 40, 36] : [88, 66, 52, 92, 82, 91, 36];
    const dlpHeaders = ['Time', 'Member', 'Source', 'Destination', 'Detection reason', 'Resolution', ...(rated ? ['Severity'] : []), 'Findings'];
    if (rated) {
      // The rows below, counted by severity: "Critical 2 | High 5 | Medium 1 | Low 0".
      const tally = [5, 4, 3, 2].map(id => `${SEVERITY[id]} ${count(events.filter(event => Number(event.severityId) === id).length)}`);
      text(`By severity: ${tally.join(' · ')}`, LEFT, y + 4, 8, COLORS.muted);
      y += 14;
    }
    const drawDlpHeader = () => {
      rect(LEFT, y, WIDTH, 22, COLORS.panel);
      let x = LEFT;
      dlpHeaders.forEach((label, i) => { text(label, x + 5, y + 14, 7, COLORS.muted, true); x += dlpWidths[i]; });
      y += 22;
    };
    drawDlpHeader();
    events.forEach((event, index) => {
      if (y + 26 > BOTTOM) { beginPage(); section('Sensitive paste activity (continued)'); drawDlpHeader(); }
      if (index % 2 === 1) rect(LEFT, y, WIDTH, 26, [0.985, 0.988, 0.992]);
      // Desktop rows (the app a secret was copied in) use the console's desktop wording.
      const desktopRow = event.source === 'desktop';
      const outcome = (desktopRow && { auto_redacted: 'Redacted on the desktop', unlocked: 'Restored on the desktop (Undo)', purged: 'Cleared from the desktop clipboard' }[event.action])
        || { blocked: 'Blocked', cancelled: 'Cancelled', sanitised: 'Sanitised', warning_bypassed: 'Pasted anyway' }[event.action] || 'DLP event';
      const destination = desktopRow ? (event.sourceApp ? `Copied in ${event.sourceApp} (desktop)` : 'Desktop app') : event.hostname;
      tableRow([reportDate(event.timestamp), event.seat || 'Unattributed', desktopRow ? 'Desktop app' : 'Browser', destination, event.reason, outcome,
        ...(rated ? [SEVERITY[event.severityId] || ''] : []), count(event.findingCount)], dlpWidths, 26);
      line(LEFT, y + 26, RIGHT, y + 26, COLORS.line, 0.4);
      y += 26;
    });
    if (safeNumber(ledger.total) > events.length) {
      ensure(20);
      text(`Showing ${events.length} events from the current ledger page; ${count(ledger.total)} events match this period.`, LEFT, y + 12, 7, COLORS.faint);
      y += 20;
    }
  }

  ensure(42);
  y += 5;
  line(LEFT, y, RIGHT, y);
  y += 15;
  text('Privacy: This report contains aggregate activity metadata only. It excludes prompts, pasted text, and secret values.', LEFT, y, 7, COLORS.muted);
  text(snapshot.stale ? 'The dashboard data was stale when this report was exported.' : 'Report generated from the dashboard data available at export time.', LEFT, y + 12, 7, COLORS.faint);

  return pages;
}

function encodePdf(pages) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((commands, index) => {
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    commands.push(`0.7 w ${pdfColor(COLORS.line)} RG ${LEFT} 36 m ${RIGHT} 36 l S`);
    commands.push(`${pdfColor(COLORS.faint)} rg BT /F1 7 Tf 1 0 0 1 ${LEFT} 22 Tm (SecureIntent Shadow AI | Metadata only) Tj ET`);
    commands.push(`${pdfColor(COLORS.faint)} rg BT /F1 7 Tf 1 0 0 1 ${RIGHT - 70} 22 Tm (Page ${index + 1} of ${pages.length}) Tj ET`);
    const stream = `${commands.join('\n')}\n`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  });
  let output = '%PDF-1.4\n% SecureIntent report\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([output], { type: 'application/pdf' });
}

export function downloadShadowPdf(snapshot) {
  const blob = encodePdf(makeReport(snapshot));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `secureintent-shadow-ai-${count(snapshot.periodDays)}-days-${suffix}${snapshot.sampleData ? '-sample' : ''}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
