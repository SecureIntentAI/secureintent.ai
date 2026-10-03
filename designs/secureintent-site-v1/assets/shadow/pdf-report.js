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
  white: [1, 1, 1],
};

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
  const beginPage = () => {
    page = [];
    pages.push(page);
    rect(0, 0, PAGE_W, 78, COLORS.navy);
    // Original SecureIntent mark, drawn as vector strokes for sharp PDF output.
    push('q 1 J');
    line(LEFT,39,LEFT+9,21,COLORS.white,4.2);
    line(LEFT+12,39,LEFT+16.5,30,[0.45,1,1],4.2);
    line(LEFT+21,21,LEFT+21.01,21,[0.45,1,1],4.2);
    push('Q');
    text('SECUREINTENT  /  SHADOW AI', LEFT+32, 31, 9, [0.65, 0.86, 0.91], true);
    text('Security activity report', LEFT, 55, 18, COLORS.white, true);
    text(`Last ${count(snapshot.periodDays)} days`, RIGHT - 96, 34, 9, COLORS.white, true);
    const sourceLabel = snapshot.sampleData ? 'SAMPLE PREVIEW' : snapshot.localExtensionDemo ? 'LOCAL EXTENSION DEMO' : 'BUSINESS WORKSPACE';
    text(sourceLabel, RIGHT - 146, 53, 8, [0.77, 0.83, 0.90]);
    y = 103;
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
    ['Higher-risk destinations', count(summary.highRiskDestinations)],
    ['Sensitive paste events', count(summary.sensitiveEvents)],
    ['Attempted paste volume', formatBytes(summary.pasteBytes)],
    ['Data status', snapshot.stale ? 'May be out of date' : 'Current at export'],
  ];
  const gap = 8;
  const cardW = (WIDTH - gap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const x = LEFT + col * (cardW + gap);
    const top = y + row * 58;
    rect(x, top, cardW, 51, COLORS.panel);
    text(clipped(label, 24), x + 8, top + 15, 7, COLORS.muted);
    text(clipped(value, 17), x + 8, top + 37, 13, COLORS.ink, true);
  });
  y += 128;

  section('Activity trend');
  const trends = Array.isArray(dashboard.trends) ? dashboard.trends : [];
  const grouped = (key, buckets = 10) => {
    if (!trends.length) return [];
    const size = Math.ceil(trends.length / buckets);
    const rows = [];
    for (let i = 0; i < trends.length; i += size) {
      const group = trends.slice(i, i + size);
      rows.push({ start: group[0].day, end: group.at(-1).day, value: group.reduce((n, row) => n + safeNumber(row[key]), 0) });
    }
    return rows;
  };
  const drawBars = (title, key, x, color) => {
    const chartW = 244;
    text(title, x, y + 2, 8, COLORS.muted, true);
    const rows = grouped(key, 10);
    const top = y + 14;
    const plotH = 59;
    const base = top + plotH;
    if (!rows.length || rows.every(row => row.value === 0)) {
      text('No activity recorded', x, top + 28, 8, COLORS.faint);
      return;
    }
    const max = Math.max(1, ...rows.map(row => row.value));
    for (let i = 0; i <= 2; i++) {
      const gy = top + plotH * i / 2;
      line(x, gy, x + chartW, gy, COLORS.line, 0.45);
    }
    const slot = chartW / rows.length;
    const barW = Math.min(13, slot * 0.56);
    rows.forEach((row, i) => {
      const h = Math.max(row.value ? 2 : 0, plotH * row.value / max);
      rect(x + i * slot + (slot - barW) / 2, base - h, barW, h, color);
    });
    text(`${count(rows.reduce((n, row) => n + row.value, 0))} total`, x, base + 12, 7, COLORS.muted);
    text(`${rows[0].start || ''}  -  ${rows.at(-1).end || ''}`, x + 90, base + 12, 7, COLORS.faint);
  };
  ensure(107);
  drawBars('OBSERVED VISITS', 'visits', LEFT, COLORS.cyan);
  drawBars('PASTE ATTEMPTS', 'pastes', LEFT + 263, COLORS.peach);
  y += 103;
  text('Visits show page loads, not AI submissions. Paste counts are attempts, not confirmed submissions.', LEFT, y, 7, COLORS.faint);
  y += 19;

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
      const values = [tool.name, tool.hostname || (tool.observedHostnames || []).join(', '), classification,
        tool.activeSeats == null ? 'N/A' : count(tool.activeSeats), count(tool.visits), count(tool.pastes), pastePolicy];
      let x = LEFT;
      values.forEach((value, i) => {
        text(clipped(value, Math.floor((columnWidths[i] - 10) / 4.2)), x + 5, y + 15, 7, COLORS.ink);
        x += columnWidths[i];
      });
      line(LEFT, y + 25, RIGHT, y + 25, COLORS.line, 0.4);
      y += 25;
    });
  }
  y += 14;

  const ledger = snapshot.ledger || { total: 0, events: [] };
  const events = Array.isArray(ledger.events) ? ledger.events : [];
  section(`Sensitive paste activity (${count(ledger.total)} total)`);
  if (!events.length) {
    text('No sensitive paste events are available in the current ledger page.', LEFT, y + 12, 8, COLORS.muted);
    y += 27;
  } else {
    const dlpWidths = [85, 50, 90, 130, 106, 46];
    const dlpHeaders = ['Time', 'Seat', 'Destination', 'Detection reason', 'Resolution', 'Findings'];
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
      const outcome = { blocked: 'Blocked', cancelled: 'Cancelled', sanitised: 'Sanitised', warning_bypassed: 'Warning bypassed' }[event.action] || 'DLP event';
      const values = [reportDate(event.timestamp), event.seat || 'Unattributed', event.hostname, event.reason, outcome, count(event.findingCount)];
      let x = LEFT;
      values.forEach((value, i) => { text(clipped(value, Math.floor((dlpWidths[i] - 10) / 3.8)), x + 5, y + 16, 7, COLORS.ink); x += dlpWidths[i]; });
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
