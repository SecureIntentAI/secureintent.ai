// Business console Overview as a PDF. Written by hand like the Shadow AI report
// (assets/shadow/pdf-report.js): two standard fonts, vector shapes, no library.
// Aggregate figures only; no person, prompt or secret ever reaches this file.
(() => {
  "use strict";

  const PAGE_W = 595;
  const PAGE_H = 842;
  const LEFT = 44;
  const RIGHT = PAGE_W - LEFT;
  const BOTTOM = PAGE_H - 52;
  const WIDTH = RIGHT - LEFT;
  const C = {
    navy: [0.055, 0.102, 0.176],
    ink: [0.12, 0.17, 0.25],
    muted: [0.38, 0.44, 0.52],
    faint: [0.55, 0.6, 0.67],
    line: [0.87, 0.89, 0.92],
    panel: [0.96, 0.97, 0.98],
    cyan: [0.12, 0.66, 0.78],
    white: [1, 1, 1],
    stopped: [0.2, 0.7, 0.53],
    anon: [0.12, 0.62, 0.76],
    anyway: [0.93, 0.58, 0.16],
    other: [0.55, 0.6, 0.67],
    all: [0.12, 0.62, 0.76],
    up: [0.8, 0.33, 0.2],
    down: [0.16, 0.6, 0.42],
  };

  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const count = (v) => Math.round(num(v)).toLocaleString("en-US");
  const plain = (v) =>
    String(v ?? "")
      .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
      .replace(/·/g, "|").replace(/…/g, "...").replace(/▲/g, "up").replace(/▼/g, "down")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^\x20-\x7E]/g, "?");
  const escapePdf = (v) => plain(v).replace(/([\\()])/g, "\\$1");
  const rgb = (c) => c.map((p) => p.toFixed(3)).join(" ");
  // Helvetica's average advance is a little over half the size; good enough to
  // right-align numbers and centre short labels.
  const textWidth = (v, size, bold) => plain(v).length * size * (bold ? 0.56 : 0.52);
  const clip = (v, max) => {
    const s = plain(v);
    return s.length > max ? `${s.slice(0, Math.max(1, max - 3))}...` : s;
  };
  // Helvetica-Bold and Helvetica advance widths (1/1000 em), ASCII 32 to 126, from
  // the standard font metrics: used to place the header's wordmark and
  // right-aligned labels exactly. Kept in step with assets/shadow/pdf-report.js.
  const W_REGULAR = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584".split(" ").map(Number);
  const W_BOLD = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584".split(" ").map(Number);
  const measure = (v, size, bold) => {
    const widths = bold ? W_BOLD : W_REGULAR;
    let total = 0;
    for (const ch of plain(v)) total += widths[ch.charCodeAt(0) - 32] ?? 556;
    return (total * size) / 1000;
  };
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /** "8 Sep 2026" for a YYYY-MM-DD day; anything else is shown as given. */
  const longDay = (day) => {
    const d = new Date(`${day}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(day)) && !Number.isNaN(d.getTime())
      ? `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      : String(day ?? "");
  };

  /**
   * The brand header shared by the Overview and member reports: the
   * SecureIntent mark (site logo, drawn to scale) and wordmark, workspace and
   * period on the right, then eyebrow, title and subtitle. Returns where the
   * page content starts.
   */
  function header(push, { eyebrow, title, subtitle, rightLabel, rightValue }) {
    const text = (v, x, top, size, color, bold = false) =>
      push(`${rgb(color)} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${(PAGE_H - top).toFixed(1)} Tm (${escapePdf(v)}) Tj ET`);
    const right = (v, top, size, color, bold = false) => text(v, RIGHT - measure(v, size, bold), top, size, color, bold);
    const rect = (x, top, w, h, color) =>
      push(`${rgb(color)} rg ${x.toFixed(1)} ${(PAGE_H - top - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    const stroke = (x1, t1, x2, t2, color, w) =>
      push(`${w.toFixed(2)} w ${rgb(color)} RG ${x1.toFixed(2)} ${(PAGE_H - t1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - t2).toFixed(2)} l S`);
    const cyan = [0.45, 1, 1];
    const k = 22 / 120; // the logo mark spans y 75 to 195 of its 250 box; 22 points tall
    const w = 28 * k;
    const X = (px) => LEFT + w / 2 + (px - 50) * k;
    const T = (py) => 26 + (py - 75) * k;
    rect(0, 0, PAGE_W, 120, C.navy);
    rect(0, 120, PAGE_W, 3, C.cyan);
    push("q 1 J");
    stroke(X(50), T(195), X(110), T(75), C.white, w);
    stroke(X(130), T(195), X(160), T(135), cyan, w);
    stroke(X(190), T(75), X(190) + 0.01, T(75), cyan, w); // the dot: radius 14 = half the stroke
    push("Q");
    const wx = LEFT + 140 * k + w + 9;
    text("SecureIntent", wx, 43, 15, C.white, true);
    text(".ai", wx + measure("SecureIntent", 15, true), 43, 15, cyan, true);
    if (rightLabel) right(rightLabel, 33, 7, [0.65, 0.86, 0.91], true);
    if (rightValue) right(rightValue, 46, 10, C.white, true);
    if (eyebrow) text(eyebrow, LEFT, 74, 7.5, [0.65, 0.86, 0.91], true);
    text(title, LEFT, 96, 22, C.white, true);
    if (subtitle) text(clip(subtitle, 96), LEFT, 110, 8.5, [0.77, 0.83, 0.9]);
    return 146;
  }

  const when = (d) => d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  function makeReport(r) {
    const pages = [];
    let page;
    let y;
    const push = (cmd) => page.push(cmd);
    const text = (v, x, top, size = 9, color = C.ink, bold = false, align = "left") => {
      const w = align === "left" ? 0 : textWidth(v, size, bold);
      const xx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      push(`${rgb(color)} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${xx.toFixed(1)} ${(PAGE_H - top).toFixed(1)} Tm (${escapePdf(v)}) Tj ET`);
    };
    const rect = (x, top, w, h, color) =>
      push(`${rgb(color)} rg ${x.toFixed(1)} ${(PAGE_H - top - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    const line = (x1, t1, x2, t2, color = C.line, w = 0.7) =>
      push(`${w} w ${rgb(color)} RG ${x1.toFixed(1)} ${(PAGE_H - t1).toFixed(1)} m ${x2.toFixed(1)} ${(PAGE_H - t2).toFixed(1)} l S`);

    const m = r.metrics;
    const s = r.series;
    const st = r.stats;
    const beginPage = () => {
      page = [];
      pages.push(page);
      y = header(push, {
        eyebrow: "BUSINESS CONSOLE",
        title: "Overview report",
        subtitle: `${r.organization || "Your organisation"}  |  ${longDay(s.buckets[0].from)} to ${longDay(s.buckets[s.buckets.length - 1].to)}`,
        rightLabel: "BUSINESS WORKSPACE",
        rightValue: `Last ${count(s.days)} days`,
      });
    };
    const ensure = (h) => {
      if (y + h > BOTTOM) beginPage();
    };
    const section = (title) => {
      ensure(34);
      text(title, LEFT, y + 11, 11, C.ink, true);
      line(LEFT, y + 18, RIGHT, y + 18);
      y += 30;
    };

    beginPage();
    text(`Organisation: ${clip(r.organization || "Not available", 70)}`, LEFT, y, 10, C.ink, true);
    text(`Generated ${when(r.generatedAt)}`, RIGHT, y, 8, C.muted, false, "right");
    y += 22;

    // Headline figures, two rows of four.
    const change = st.change ? st.change.text : "Not available";
    const cards = [
      ["Detections", count(st.total)],
      ["vs previous period", change, st.change?.dir === "up" ? C.up : st.change?.dir === "down" ? C.down : C.ink],
      ["Users involved", count(m.activeActors)],
      ["Pasted anyway", st.total ? `${st.anywayPct}% (${count(st.anyway)})` : "0", st.anyway ? C.anyway : C.ink],
      [`Busiest ${s.unit}`, st.busiest ? st.busiest.label : "-"],
      [`Detections that ${s.unit}`, st.busiest ? count(st.busiest.n) : "-"],
      ["Seats used", r.seats ? `${count(r.seats.used)} of ${count(r.seats.total)}` : "-"],
      ["Previous period", st.previous === null ? "-" : count(st.previous)],
    ];
    const gap = 8;
    const cardW = (WIDTH - gap * 3) / 4;
    cards.forEach(([label, value, color], i) => {
      const x = LEFT + (i % 4) * (cardW + gap);
      const top = y + Math.floor(i / 4) * 56;
      rect(x, top, cardW, 49, C.panel);
      text(clip(label, 26), x + 8, top + 15, 7, C.muted);
      text(clip(value, value.length > 12 ? 22 : 16), x + 8, top + 36, value.length > 12 ? 10 : 13, color || C.ink, true);
    });
    y += 122;

    // Detections over time: the same stacked bars as the console.
    section(`Detections over time (per ${s.unit})`);
    const keys = s.split ? r.groups.filter((g) => g.key !== "other" || s.buckets.some((b) => b.other)) : [{ key: "all", label: "Detections" }];
    let lx = LEFT;
    for (const g of keys) {
      rect(lx, y - 7, 8, 8, C[g.key]);
      text(g.label, lx + 12, y, 8, C.muted);
      lx += 24 + textWidth(g.label, 8);
    }
    y += 14;
    const chartH = 170;
    const padL = 34;
    const plotW = WIDTH - padL;
    const max = Math.max(1, ...s.buckets.map((b) => b.total));
    const yt = window.SIOverviewChart.ticks(max);
    const top = yt[yt.length - 1];
    const yAt = (v) => y + chartH - (v / top) * chartH;
    for (const v of yt) {
      line(LEFT + padL, yAt(v), RIGHT, yAt(v), v ? C.line : C.faint, v ? 0.5 : 0.8);
      text(count(v), LEFT + padL - 6, yAt(v) + 3, 7, C.muted, false, "right");
    }
    const slot = plotW / s.buckets.length;
    const barW = Math.max(1.5, Math.min(26, slot * (s.buckets.length > 40 ? 0.8 : 0.66)));
    s.buckets.forEach((b, i) => {
      const x = LEFT + padL + i * slot + (slot - barW) / 2;
      let base = 0;
      for (const g of r.groups) {
        const v = b[g.key];
        if (!v) continue;
        const h = Math.max(0.8, yAt(base) - yAt(base + v));
        rect(x, yAt(base) - h, barW, h, s.split ? C[g.key] : C.all);
        base += v;
      }
    });
    const every = Math.max(1, Math.ceil(s.buckets.length / 7));
    s.buckets.forEach((b, i) => {
      const last = i === s.buckets.length - 1;
      if ((i % every && !last) || (last && i % every && i % every < every / 2)) return;
      const label = s.weekly ? b.label.split(" to ")[0] : b.label;
      text(label, LEFT + padL + i * slot + slot / 2, y + chartH + 13, 7, C.muted, false, "center");
    });
    y += chartH + 32;
    if (!st.total) {
      text(`No detections in the last ${count(s.days)} days.`, LEFT + padL + 8, y - chartH / 2 - 32, 10, C.muted);
    }
    // The figures behind the bars, so the page reads without the picture.
    const summary =
      `${count(st.total)} detections` +
      (st.busiest ? `; busiest ${s.unit} ${st.busiest.label} (${count(st.busiest.n)})` : "") +
      (s.split ? `; pasted anyway ${count(st.anyway)} (${st.anywayPct}%)` : "") +
      (st.change ? `; ${plain(st.change.text)} on the previous ${count(s.days)} days` : "") +
      ".";
    text(clip(summary, 120), LEFT, y, 8, C.muted);
    y += 22;

    // The three breakdowns, as labelled bars with share of total.
    const breakdown = (title, rows, labels) => {
      section(title);
      if (!rows?.length) {
        text("Nothing in this period.", LEFT, y, 9, C.muted);
        y += 20;
        return;
      }
      const total = rows.reduce((t, x) => t + num(x.n), 0) || 1;
      const peak = Math.max(1, ...rows.map((x) => num(x.n)));
      for (const row of rows.slice(0, 12)) {
        ensure(18);
        text(clip(labels?.[row.key] || row.key || "(unknown)", 34), LEFT, y + 8, 8.5);
        rect(LEFT + 180, y + 1, WIDTH - 280, 8, C.line);
        rect(LEFT + 180, y + 1, Math.max(1, ((WIDTH - 280) * num(row.n)) / peak), 8, C.cyan);
        text(count(row.n), RIGHT - 46, y + 8, 8.5, C.ink, true, "right");
        text(`${Math.round((num(row.n) / total) * 100)}%`, RIGHT, y + 8, 8, C.muted, false, "right");
        y += 17;
      }
      if (rows.length > 12) {
        text(`+ ${rows.length - 12} more`, LEFT, y + 8, 8, C.muted);
        y += 17;
      }
      y += 10;
    };
    breakdown("What was caught", m.byType, r.labels.types);
    breakdown("Where it was headed", m.bySite);
    breakdown("What people chose", m.byAction, r.labels.actions);

    if (r.rollout) {
      section("Policy rollout");
      text(clip(r.rollout, 110), LEFT, y + 4, 9);
      y += 24;
    }
    // Privacy wording rides in every page footer; the source line only where it fits.
    if (y + 12 <= BOTTOM)
      text(m.source === "shadow_events" ? "Source: Shadow AI event ledger (AI destinations only)." : "Source: SecureIntent extension detections.", LEFT, y + 6, 7, C.faint);
    return pages;
  }

  function encode(pages, footer = "Overview report | Aggregate counts only: no person, prompt, pasted text or secret value") {
    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    pages.forEach((cmds, i) => {
      const pageId = 5 + i * 2;
      cmds.push(`0.7 w ${rgb(C.line)} RG ${LEFT} 36 m ${RIGHT} 36 l S`);
      cmds.push(`${rgb(C.faint)} rg BT /F1 7 Tf 1 0 0 1 ${LEFT} 22 Tm (SecureIntent Business | ${escapePdf(footer)}) Tj ET`);
      cmds.push(`${rgb(C.faint)} rg BT /F1 7 Tf 1 0 0 1 ${RIGHT - 52} 22 Tm (Page ${i + 1} of ${pages.length}) Tj ET`);
      const stream = `${cmds.join("\n")}\n`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
      objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    });
    let out = "%PDF-1.4\n% SecureIntent report\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([out], { type: "application/pdf" });
  }

  function build(report) {
    return encode(makeReport(report));
  }

  function download(report) {
    const url = URL.createObjectURL(build(report));
    const a = document.createElement("a");
    a.href = url;
    a.download = `secureintent-overview-${report.series.days}d-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Shared with the member report (team.js): the same page geometry and fonts.
  const kit = { PAGE_W, PAGE_H, LEFT, RIGHT, BOTTOM, WIDTH, C, plain, escapePdf, rgb, textWidth, clip, count, when, encode, header };
  window.SIOverviewPdf = { build, download, kit };
})();
