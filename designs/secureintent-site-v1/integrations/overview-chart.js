// Business console Overview: "Detections over time" as a stacked bar chart.
// Plain SVG, no library. Shared with the PDF report (series + stats), so the
// figures on screen and on paper always come from the same arithmetic.
(() => {
  "use strict";

  const DAY = 86_400_000;
  // Bottom to top. "Pasted anyway" sits on top, in the warning colour: it is
  // the one outcome where the data actually left.
  const GROUPS = [
    { key: "stopped", label: "Blocked or cancelled", actions: ["blocked", "cancelled"] },
    { key: "anon", label: "Anonymised or sanitised", actions: ["paste_anonymously", "sanitised"] },
    { key: "anyway", label: "Pasted anyway", actions: ["paste_anyway"] },
    { key: "other", label: "Other", actions: [] },
  ];
  const groupOf = (action) => (GROUPS.find((g) => g.actions.includes(action)) || GROUPS[3]).key;

  const utcDay = (iso) => {
    const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(t) ? t : null;
  };
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortDate = (t) => {
    const d = new Date(t);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };
  const num = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0);
  const fmt = (n) => Math.round(num(n)).toLocaleString();

  /**
   * Every day of the window (quiet days included, so time is evenly spaced),
   * split by outcome; grouped into weeks past 45 days so bars stay readable.
   */
  function series(m, now = Date.now()) {
    const days = Math.max(1, Math.min(365, Number(m?.days) || 30));
    const split = Array.isArray(m?.byDayAction);
    const counts = new Map();
    const add = (day, group, n) => {
      const t = utcDay(day);
      if (t === null || !n) return;
      const row = counts.get(t) || { stopped: 0, anon: 0, anyway: 0, other: 0 };
      row[group] += num(n);
      counts.set(t, row);
    };
    if (split) for (const r of m.byDayAction) add(r.day, groupOf(r.key), r.n);
    else for (const r of m?.byDay || []) add(r.day, "other", r.n);

    const today = utcDay(new Date(now).toISOString());
    let start = today - (days - 1) * DAY;
    // A day the server counted that falls just outside our UTC window (a
    // timezone edge) still belongs on the chart rather than vanishing.
    for (const t of counts.keys()) if (t < start) start = t;
    const end = Math.max(today, ...counts.keys());

    const weekly = days > 45;
    const step = weekly ? 7 : 1;
    const buckets = [];
    for (let t = start; t <= end; t += step * DAY) {
      const b = { start: t, end: Math.min(t + (step - 1) * DAY, end), stopped: 0, anon: 0, anyway: 0, other: 0 };
      for (let d = b.start; d <= b.end; d += DAY) {
        const row = counts.get(d);
        if (row) for (const g of GROUPS) b[g.key] += row[g.key];
      }
      b.total = b.stopped + b.anon + b.anyway + b.other;
      b.label = weekly ? `${shortDate(b.start)} to ${shortDate(b.end)}` : shortDate(b.start);
      b.from = isoDay(b.start);
      b.to = isoDay(b.end);
      buckets.push(b);
    }
    return { days, weekly, split, buckets, unit: weekly ? "week" : "day" };
  }

  function stats(m, s) {
    const total = s.buckets.reduce((t, b) => t + b.total, 0);
    const busiest = s.buckets.reduce((best, b) => (b.total > (best?.total || 0) ? b : best), null);
    // Without the per-day outcome split the buckets carry no outcomes, so take
    // "pasted anyway" from the period's outcome totals instead of reporting 0.
    const fromTotals = num((m?.byAction || []).find((r) => r.key === "paste_anyway")?.n);
    const anyway = s.split ? s.buckets.reduce((t, b) => t + b.anyway, 0) : Math.min(fromTotals, total);
    const previous = Number.isFinite(Number(m?.previousTotal)) ? num(m.previousTotal) : null;
    let change = null;
    if (previous !== null) {
      if (previous === 0) change = total ? { text: "New activity", dir: "up" } : { text: "No change", dir: "flat" };
      else {
        const pct = Math.round(((total - previous) / previous) * 100);
        change = {
          text: pct === 0 ? "No change" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`,
          dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
          previous,
        };
      }
    }
    return {
      total,
      previous,
      change,
      busiest: busiest ? { label: busiest.label, n: busiest.total } : null,
      anyway,
      anywayPct: total ? Math.round((anyway / total) * 100) : 0,
    };
  }

  /** 0 and three or four round steps above the tallest bar. */
  function ticks(max) {
    if (max <= 4) return [0, 1, 2, 3, 4].slice(0, Math.max(2, max + 1));
    const rough = max / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= rough && Number.isInteger(v)) || mag * 10;
    const out = [];
    for (let v = 0; v < max + step; v += step) out.push(v);
    return out;
  }

  const SVG = "http://www.w3.org/2000/svg";
  const node = (name, attrs = {}, text) => {
    const el = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  };

  const tipText = (b, split) => {
    const head = `${b.label}: ${fmt(b.total)} detection${b.total === 1 ? "" : "s"}`;
    if (!split || !b.total) return [head];
    return [head, ...GROUPS.filter((g) => b[g.key]).map((g) => `${g.label}: ${fmt(b[g.key])}`)];
  };

  /**
   * Draw into `host` (the chart panel). Re-measures on resize; the tooltip
   * works with a mouse, a tap, and the arrow keys.
   */
  function render(host, s, tip) {
    host.replaceChildren();
    tip.hidden = true;
    const width = Math.max(260, host.clientWidth || 640);
    const narrow = width < 480;
    const height = narrow ? 200 : 240;
    const pad = { top: 12, right: 8, bottom: 26, left: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...s.buckets.map((b) => b.total));
    const yTicks = ticks(max);
    const top = yTicks[yTicks.length - 1];
    const y = (v) => pad.top + plotH - (v / top) * plotH;
    const slot = plotW / s.buckets.length;
    const barW = Math.max(2, Math.min(36, slot * (s.buckets.length > 40 ? 0.8 : 0.66)));

    const svg = node("svg", {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      class: "si-chart",
      tabindex: 0,
      role: "img",
      "aria-describedby": "chart-summary",
    });

    for (const v of yTicks) {
      svg.append(node("line", { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: v ? "grid" : "base" }));
      svg.append(node("text", { x: pad.left - 8, y: y(v) + 4, class: "ylab", "text-anchor": "end" }, fmt(v)));
    }

    const groups = [];
    s.buckets.forEach((b, i) => {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const g = node("g", { class: "col" });
      // Full-height hit area: a quiet day is as hoverable as a busy one.
      g.append(node("rect", { x: pad.left + i * slot, y: pad.top, width: slot, height: plotH, class: "hit" }));
      let base = 0;
      for (const grp of GROUPS) {
        const v = b[grp.key];
        if (!v) continue;
        const h = Math.max(1.5, y(base) - y(base + v));
        g.append(node("rect", { x, y: y(base) - h, width: barW, height: h, class: `seg seg-${s.split ? grp.key : "all"}` }));
        base += v;
      }
      svg.append(g);
      groups.push(g);
    });

    // Date labels: as many as fit without touching, always the first and last.
    const room = narrow ? 64 : 76;
    const every = Math.max(1, Math.ceil(s.buckets.length / Math.max(2, Math.floor(plotW / room))));
    s.buckets.forEach((b, i) => {
      const last = i === s.buckets.length - 1;
      if (i % every && !last) return;
      if (last && i % every && (i % every) < every / 2) return; // would overlap the previous label
      const x = pad.left + i * slot + slot / 2;
      const anchor = i === 0 && slot < room / 2 ? "start" : last && slot < room / 2 ? "end" : "middle";
      const xx = anchor === "start" ? pad.left : anchor === "end" ? width - pad.right : x;
      svg.append(node("text", { x: xx, y: height - 8, class: "xlab", "text-anchor": anchor }, s.weekly ? shortDate(b.start) : b.label));
    });
    host.append(svg);

    let active = -1;
    const show = (i, fromKey) => {
      if (i < 0 || i >= s.buckets.length) return;
      if (active >= 0) groups[active].classList.remove("on");
      active = i;
      groups[i].classList.add("on");
      const b = s.buckets[i];
      tip.replaceChildren(
        ...tipText(b, s.split).map((line, k) => {
          const el = document.createElement(k ? "div" : "strong");
          el.textContent = line;
          return el;
        }),
      );
      tip.hidden = false;
      const cx = pad.left + i * slot + slot / 2;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(0, cx - tw / 2), width - tw)}px`;
      tip.style.top = `${Math.max(0, y(b.total) - tip.offsetHeight - 10)}px`;
      if (fromKey) svg.setAttribute("aria-label", tipText(b, s.split).join(". "));
    };
    const hide = () => {
      if (active >= 0) groups[active].classList.remove("on");
      active = -1;
      tip.hidden = true;
      svg.removeAttribute("aria-label");
    };
    const indexAt = (ev) => {
      const r = svg.getBoundingClientRect();
      return Math.floor(((ev.clientX - r.left) * (width / r.width) - pad.left) / slot);
    };
    svg.addEventListener("pointermove", (ev) => show(indexAt(ev)));
    svg.addEventListener("pointerdown", (ev) => show(indexAt(ev)));
    svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") hide(); });
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (ev) => {
      const last = s.buckets.length - 1;
      const next = { ArrowRight: active + 1, ArrowLeft: active < 0 ? last : active - 1, Home: 0, End: last }[ev.key];
      if (ev.key === "Escape") return hide();
      if (next === undefined) return;
      ev.preventDefault();
      show(Math.max(0, Math.min(last, next)), true);
    });
  }

  window.SIOverviewChart = { GROUPS, series, stats, ticks, render };
})();
