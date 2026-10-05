/* Ported from main commit 3612483; API contracts and DOM IDs retained. */
(async () => {
  const SI = window.SI;
  try {
    await SI.ready({ auth: true, billing: true });
// Where Clerk should return people after they authenticate. Kept as one
      // constant so a rename can't leave a redirect pointing somewhere stale.
      const TEAM_PATH = SI.page("team.html");
      // Sign-up has to live on this page too: Clerk's "Sign up" link needs
      // somewhere that mounts the sign-up component, not the sign-in one again.
      const TEAM_SIGNUP_PATH = SI.page("team.html?mode=signup");
      // Keep the chromewebstore.google.com/detail/secureintent shape — the GA4
      // install_click handler selects on it.
      const EXTENSION_URL =
        "https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof";
      const BILLING_EMAIL = "billing@secureintent.ai";
      // Must match the Worker: MIN_SEATS/MAX_SEATS in backend/src/routes/team.ts,
      // and the per-seat price behind PADDLE_TEAM_PRICE_ID.
      const MIN_SEATS = 1;
      const MAX_SEATS = 150;
      const SEAT_PRICE = 9; // main price; confirm against Paddle before launch.
      const PAY_HINT = "Available once your payment completes";

      const CFG = SI.config;
      const $ = (id) => document.getElementById(id);
      const esc = (s) =>
        String(s ?? "").replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
        );
      const fmt = (n) => (Number(n) || 0).toLocaleString();
      const ACTION_LABEL = {
        blocked: "Blocked by policy",
        cancelled: "Cancelled the paste",
        paste_anonymously: "Pasted anonymised",
        paste_anyway: "Pasted anyway",
      };
      const TYPE_LABEL = {
        "high-entropy": "Credential-like string",
        "known-key": "Known API key",
        "private-key": "Private key",
        "env-credential": "Env credential",
        pii: "Personal data",
      };
      // The four detector types, most severe first — the order the alert
      // threshold reads down.
      const TYPES = ["private-key", "known-key", "env-credential", "pii"];

      // How far back the dashboard looks, and the last payload we drew, so
      // Export CSV writes exactly the figures on screen rather than refetching.
      let days = 30;
      let lastMetrics = null;
      // The team as the server last described it, so the seat editor knows the
      // current count and a cancelled confirmation can redraw the roster.
      let currentTeam = null;
      let lastPeopleRenderKey = null;
      let invitesBusy = false;

      function authScope() {
        const clerk = window.Clerk;
        return `${clerk.user?.id || ''}:${clerk.session?.id || ''}:${clerk.organization?.id || ''}`;
      }
      async function api(path, init = {}) {
        const scope = authScope();
        const assertScope = () => {
          if (scope !== authScope()) throw new DOMException('Account changed', 'AbortError');
        };
        const accessHeader=window.SIAdminAccess.headers()['X-SI-Admin-Access'];
        // Admin grants are bound to Clerk's session ID. Custom JWT templates
        // omit sid, so dashboard requests must use the session token.
        const token = await window.Clerk.session.getToken();
        assertScope();
        const res = await SI.fetch(`${CFG.apiBase}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
            ...(accessHeader?{'X-SI-Admin-Access':accessHeader}:{}),
            ...(init.headers || {}),
          },
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        assertScope();
        if (res.ok && accessHeader) window.SIAdminAccess.touch();
        if (!res.ok) {
          // Carry the code, the status and the rest of the body on the error:
          // explain() needs `minSeats` and `seatsUsed` to say something an admin
          // can act on. `message` stays the raw code for the console only.
          const err = new Error(body.error || `HTTP ${res.status}`);
          err.code = typeof body.error === "string" ? body.error : null;
          err.status = res.status;
          err.data = body || {};
          if(err.code==='admin_reauthentication_required' && (init.headers?.['X-SI-Admin-Access']||accessHeader)===window.SIAdminAccess.headers()['X-SI-Admin-Access']) {
            const freshlySignedIn=Number(new Date(window.Clerk.session?.createdAt))>Date.now()-5*60_000;
            showAdminClerkGate({automatic:!freshlySignedIn,reason:freshlySignedIn?'Clerk sign-in finished, but dashboard access was not confirmed. Please retry or contact SecureIntent support.':''});
          }
          throw err;
        }
        return body;
      }

      // ---------------------------------------------------------------------
      // Server codes are for our logs. Everything a person reads is a sentence
      // that says what happened and what to do next; an unmapped code falls back
      // to DEFAULT_ERROR rather than putting `invalid_seats` on screen.
      // ---------------------------------------------------------------------
      const DEFAULT_ERROR = `Something went wrong — try again, or email ${BILLING_EMAIL}.`;
      // fetch() rejects with a TypeError whose message is the browser's own
      // ("Failed to fetch", "NetworkError when attempting…"). Never show that.
      const NETWORK_ERROR = "We couldn't reach SecureIntent. Check your connection and try again.";
      const TIMEOUT_ERROR = "That took too long to answer. Try again in a moment.";
      const BELOW_MIN_SEATS =
        "A team starts at three seats — for fewer, Developer Pro on your account page is the cheaper plan.";
      const ABOVE_MAX_SEATS = `${MAX_SEATS} seats is the most you can buy here — email ${BILLING_EMAIL} for anything larger.`;
      const ERROR_TEXT = {
        business_promo_required: "This console requires an activated Business invitation from SecureIntent.",
        member_role_required: "Invitations are for member seats. Only the organization owner administers this workspace.",
        team_busy: "Another user change is in progress. Please retry shortly.",
        already_member: "This user already belongs to your organization.",
        too_soon: "Wait one minute before resending this invitation.",
        invitation_not_pending: "This invitation is no longer pending. Refresh the user list.",
        invitation_pending_reconciliation: "The invitation delivery could not be confirmed. Its seat remains reserved. Refresh the user list before retrying.",
        policy_conflict: "A newer policy was saved elsewhere. Reload the settings before making your change again.",
        unauthenticated: "Your session has expired. Sign in again and pick up where you left off.",
        forbidden: "Only an admin of this team can do that.",
        "email required": "Your account needs an email address before you can buy seats.",
        company_name_required: "Company name is required.",
        invalid_email: "That doesn't look like an email address.",
        organization_email_required: "Invite an address at your organisation's registered work email domain.",
        no_active_subscription:
          "Your payment hasn't reached us yet, so there are no seats to fill. Complete the payment above first.",
        "no subscription":
          "We can't find a subscription for this team yet. If you've just paid, give it a minute and press Check again.",
        cannot_remove_self: "You can't remove yourself. Ask another admin to do it.",
        no_team_grant:
          "This account's plan doesn't include team seats. If you redeemed a Business promo code, sign in with that email.",
        comp_team:
          "Your team is already included with your plan — there's nothing to buy. Reload the page to manage it.",
        comp_team_fixed_seats:
          `Your seats come with your plan, so there's no subscription to change. Email ${BILLING_EMAIL} and we'll raise your seat count.`,
        "checkout failed": `Couldn't open the payment form. Nothing has been charged — try again, or email ${BILLING_EMAIL}.`,
        "reconcile failed":
          "Couldn't reach our payment provider just now. Press Check again in a moment.",
        "seat update failed": `Couldn't change your seat count. Nothing has been charged — try again, or email ${BILLING_EMAIL}.`,
        "invite failed": `The invitation didn't go out. Try again in a moment, or email ${BILLING_EMAIL}.`,
        "revoke failed": "Couldn't revoke that invitation. Try again in a moment.",
        "remove failed": "Couldn't remove that person. Try again in a moment.",
        "team billing not configured": `Team billing is unavailable right now. Email ${BILLING_EMAIL} and we'll sort it out.`,
        "auth not configured": `Team billing is unavailable right now. Email ${BILLING_EMAIL} and we'll sort it out.`,
        invalid_webhook:
          "That webhook URL isn't one we can post to — it has to be a public https:// address.",
        invalid_alert_min_type: "Pick one of the listed alert thresholds.",
        "save failed": `Couldn't save your changes. Try again, or email ${BILLING_EMAIL}.`,
        no_webhook: "There's no saved webhook to test yet. Add one and save it first.",
        delivery_failed: "The test didn't reach your webhook. Check the URL is still accepting posts.",
      };

      /** The seat count is out of range — say which end, because the fix differs. */
      function seatsRangeError(seats) {
        if (!Number.isFinite(seats) || seats < MIN_SEATS) return BELOW_MIN_SEATS;
        if (seats > MAX_SEATS) return ABOVE_MAX_SEATS;
        return null;
      }

      /**
       * A sentence for any failure. `ctx.seats` disambiguates invalid_seats (too
       * few or too many — the server sends one code for both); `ctx.fallback`
       * gives a screen-specific default where the generic one would read oddly.
       */
      function explain(err, ctx = {}) {
        const code = err && err.code;
        const data = (err && err.data) || {};
        if (err instanceof TypeError || code === "network") return NETWORK_ERROR;
        if (err && err.name === "TimeoutError") return TIMEOUT_ERROR;
        if (code === "invalid_seats") {
          return seatsRangeError(Math.floor(Number(ctx.seats))) || BELOW_MIN_SEATS;
        }
        if (code === "seats_in_use") {
          const n = Number(data.seatsUsed);
          if (!Number.isFinite(n) || n < 1) return "Remove people before reducing seats.";
          return n === 1
            ? "1 person is using a seat — remove them first."
            : `${n} people are using seats — remove some first.`;
        }
        if (code === "seat_limit_reached") {
          const n = Number(data.seats);
          return Number.isFinite(n) && n > 0
            ? `All ${n} seats are reserved. Revoke an unused invitation or remove a user before inviting someone else.`
            : "Every seat is reserved. Revoke an unused invitation or remove a user first.";
        }
        if (code === "delivery_failed") {
          // The status is the webhook's answer, not ours (the call itself 502s).
          // It is the whole diagnosis, so put it in the sentence.
          const n = Math.floor(Number(data.status));
          return Number.isFinite(n) && n >= 100
            ? `The test didn't reach your webhook — it answered ${n}. Check the URL is still accepting posts.`
            : ERROR_TEXT.delivery_failed;
        }
        // typeof, not `in`: a code of "constructor" must not reach a prototype.
        if (code && typeof ERROR_TEXT[code] === "string") return ERROR_TEXT[code];
        if (err && err.status === 401) return ERROR_TEXT.unauthenticated;
        if (err && err.status === 403) return ERROR_TEXT.forbidden;
        return ctx.fallback || DEFAULT_ERROR;
      }

      /** "5 seats × $9 = $45/mo" — the figure, before the Paddle overlay shows it. */
      function priceLine(seats, tail = "") {
        const n = Math.floor(Number(seats));
        if (!Number.isFinite(n) || n < 1) return "";
        return `${n} seat${n === 1 ? "" : "s"} × $${SEAT_PRICE} = $${n * SEAT_PRICE}/mo${tail}`;
      }

      /** Keep a price line in step with the seat box it sits under. */
      function updatePrice(input, out, tail = "") {
        out.textContent = priceLine(input.value, tail);
      }

      /**
       * A pop-up for the result of something the admin just did. It repeats
       * what the page says beside the control rather than replacing it, so a
       * missed one loses nothing. Failures stay until dismissed; the rest
       * leave on their own.
       */
      function notify(kind, title, message = "") {
        const host = $("toasts");
        if (!host) return;
        const toast = document.createElement("div");
        toast.className = `toast toast--${kind}`;
        toast.setAttribute("role", kind === "error" ? "alert" : "status");
        const body = document.createElement("div");
        body.className = "toast-body";
        const head = document.createElement("span");
        head.className = "toast-title";
        head.textContent = title;
        body.append(head);
        if (message) {
          const text = document.createElement("p");
          text.textContent = message;
          body.append(text);
        }
        const close = document.createElement("button");
        close.type = "button";
        close.className = "toast-close";
        close.setAttribute("aria-label", "Dismiss");
        close.textContent = "×";
        close.addEventListener("click", () => toast.remove());
        toast.append(body, close);
        // The same notice twice in a row is one notice.
        [...host.children].find((el) => el.textContent === toast.textContent)?.remove();
        host.append(toast);
        while (host.children.length > 4) host.firstElementChild.remove();
        // Failures linger longer, but not forever: the stack sits over the
        // view's header actions (Export CSV, Refresh), and the inline message
        // beside the control still carries the error after this goes.
        setTimeout(() => toast.remove(), kind === "error" ? 15000 : 6000);
      }

      // One inline line of feedback per form. Success and failure look
      // different and both say what actually happened; the message clears
      // itself so a stale "Saved" can't be mistaken for the current state.
      const flashTimers = new WeakMap();
      function flash(el, msg, kind) {
        el.textContent = msg;
        el.className = kind ? `status ${kind}` : "status";
        clearTimeout(flashTimers.get(el));
        if (kind) {
          flashTimers.set(
            el,
            setTimeout(() => {
              el.textContent = "";
              el.className = "status";
            }, 7000),
          );
        }
      }

      function bars(el, list, labels) {
        el.textContent = "";
        if (!list || !list.length) {
          el.innerHTML = '<div class="empty">Nothing yet</div>';
          return;
        }
        const max = list.reduce((m, r) => Math.max(m, r.n), 0) || 1;
        el.innerHTML = list
          .map(
            (r) =>
              `<div class="row"><div class="lbl" title="${esc(r.key)}">${esc(
                (labels && labels[r.key]) || r.key,
              )}</div><div class="track"><div class="fill" style="width:${
                (r.n / max) * 100
              }%"></div></div><div class="n">${fmt(r.n)}</div></div>`,
          )
          .join("");
      }

      // The chart redraws itself at the panel's width, so a resize or a rotated
      // phone gets crisp bars and labels that still fit.
      let chartSeries = null;
      let chartWidth = 0;
      function drawChart() {
        if (!chartSeries) return;
        chartWidth = $("p-chart").clientWidth;
        window.SIOverviewChart.render($("p-chart"), chartSeries, $("chart-tip"));
      }
      if (window.ResizeObserver)
        new ResizeObserver(() => {
          if (chartSeries && $("p-chart").clientWidth && $("p-chart").clientWidth !== chartWidth) drawChart();
        }).observe($("p-chart"));

      function chart(m) {
        const C = window.SIOverviewChart;
        const s = C.series(m);
        const st = C.stats(m, s);
        chartSeries = s;
        const unit = s.unit;
        $("chart-stats").hidden = false;
        $("cs-total").textContent = fmt(st.total);
        const change = $("cs-change");
        change.textContent = st.change ? st.change.text : "—";
        change.className = st.change ? `chg chg-${st.change.dir}` : "";
        change.title = st.change && st.change.previous !== undefined ? `${fmt(st.change.previous)} in the previous ${s.days} days` : "";
        $("cs-busiest-k").textContent = `Busiest ${unit}`;
        $("cs-busiest").textContent = st.busiest ? `${st.busiest.label} · ${fmt(st.busiest.n)}` : "—";
        $("cs-anyway").textContent = st.total ? `${st.anywayPct}% · ${fmt(st.anyway)}` : "—";
        $("cs-anyway").className = st.anyway ? "warn" : "";

        const legend = $("chart-legend");
        legend.replaceChildren();
        const shown = s.split
          ? C.GROUPS.filter((g) => g.key !== "other" || s.buckets.some((b) => b.other))
          : [{ key: "all", label: "Detections" }];
        for (const g of shown) {
          const li = document.createElement("li");
          li.innerHTML = `<span class="sw sw-${g.key}" aria-hidden="true"></span>${esc(g.label)}`;
          legend.append(li);
        }

        if (!st.total) {
          $("p-chart").innerHTML = `<div class="empty">No detections in the last ${s.days} days</div>`;
          $("chart-tip").hidden = true;
          chartSeries = null;
          $("chart-summary").textContent = `No detections in the last ${s.days} days.`;
          return;
        }
        drawChart();
        const first = s.buckets[0];
        const last = s.buckets[s.buckets.length - 1];
        $("chart-summary").textContent =
          `Detections per ${unit}, ${first.label} to ${last.label}: ${fmt(st.total)} in total` +
          (st.change ? `, ${st.change.text.replace("▲", "up").replace("▼", "down")} on the previous period` : "") +
          (st.busiest ? `. Busiest ${unit}: ${st.busiest.label} with ${fmt(st.busiest.n)}` : "") +
          (s.split ? `. Pasted anyway: ${fmt(st.anyway)} (${st.anywayPct}%).` : ".") +
          " Focus the chart and use the arrow keys to read each bar.";
      }

      /**
       * Pull the aggregate numbers for the selected window and draw all four
       * views plus the two headline cards. Kept apart from loadTeam so the
       * range picker can redraw without re-reading the roster.
       */
      let metricsBusy = false;
      async function loadMetrics() {
        if (metricsBusy) return;
        metricsBusy = true;
        const want = days;
        const status = $("metrics-status");
        $("range").disabled = true;
        try {
          const { metrics } = await api(`/v1/team/metrics?days=${want}`);
          if (!metrics || !Number.isFinite(metrics.total)) throw new Error('metrics_unavailable');
          const m = metrics;
          // The server clamps the window (1–365), so label the cards with what
          // it actually counted rather than what we asked for.
          const shown = Number(m.days) || want;
          lastMetrics = { ...m, days: shown };
          $("c-total-k").textContent = `${m.source === 'shadow_events' ? 'AI detections' : 'Detections'} · ${shown}d`;
          $("c-actors-k").textContent = `Users involved · ${shown}d`;
          $("c-total").textContent = fmt(m.total);
          // Just the count: people who triggered a detection in the window. Not
          // "of seats" — someone can hold a seat and never trip a warning.
          $("c-actors").textContent = fmt(m.activeActors);
          chart({ ...m, days: shown });
          bars($("p-types"), m.byType, TYPE_LABEL);
          bars($("p-sites"), m.bySite);
          bars($("p-actions"), m.byAction, ACTION_LABEL);
          $("export").disabled = false;
          $("overview-export-pdf").disabled = false;
          status.textContent = `${m.source === 'shadow_events' ? 'AI destinations only · Counts match the Shadow AI event ledger. ' : ''}Updated ${new Date().toLocaleTimeString()}`;
        } catch (error) {
          if (error.name === 'AbortError') return;
          status.textContent = 'Overview data is temporarily unavailable. Retrying automatically.';
          $("export").disabled = true;
          $("overview-export-pdf").disabled = true;
          if (!lastMetrics) {
            $("c-total").textContent = '—'; $("c-actors").textContent = '—';
          } else status.textContent += ' Showing the last successful update.';
        } finally {
          metricsBusy = false;
          $("range").disabled = false;
        }
      }

      // A leading =, +, @ or control character makes a spreadsheet treat the
      // cell as a formula. Site names come from the wild, so defuse them.
      function csvCell(v) {
        let s = String(v ?? "");
        if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }

      /** Everything currently on screen, as one long CSV — no new dependency. */
      function exportCsv() {
        if (!lastMetrics) return;
        const m = lastMetrics;
        const rows = [["section", "key", "label", "detections"]];
        (m.byDay || []).forEach((p) => rows.push(["day", p.day, p.day, p.n]));
        // The chart's stacked bars, one row per day and outcome.
        (m.byDayAction || []).forEach((p) =>
          rows.push(["day_outcome", `${p.day}:${p.key}`, `${p.day} · ${ACTION_LABEL[p.key] || p.key}`, p.n]),
        );
        (m.byType || []).forEach((r) => rows.push(["type", r.key, TYPE_LABEL[r.key] || r.key, r.n]));
        (m.bySite || []).forEach((r) => rows.push(["destination", r.key, r.key, r.n]));
        (m.byAction || []).forEach((r) =>
          rows.push(["action", r.key, ACTION_LABEL[r.key] || r.key, r.n]),
        );
        rows.push(["summary", "total", "All detections", m.total ?? 0]);
        rows.push(["summary", "activeActors", "Users involved", m.activeActors ?? 0]);
        rows.push(["summary", "days", "Days covered", m.days]);
        if (Number.isFinite(Number(m.previousTotal)))
          rows.push(["summary", "previousTotal", `Detections in the previous ${m.days} days`, m.previousTotal]);
        // The BOM is what makes Excel read this as UTF-8 rather than Latin-1.
        const body = `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
        const url = URL.createObjectURL(
          new Blob(["\ufeff", body], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `secureintent-team-${m.days}d-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }

      /** The Overview as a printable report: the same figures, drawn by hand. */
      function exportPdf() {
        if (!lastMetrics) return;
        const m = lastMetrics;
        const C = window.SIOverviewChart;
        const s = C.series(m);
        try {
          window.SIOverviewPdf.download({
            metrics: m,
            series: s,
            stats: C.stats(m, s),
            organization: currentTeam?.name || $("team-name").textContent || "",
            seats: currentTeam ? { used: currentTeam.seatsUsed, total: currentTeam.seats } : null,
            rollout: $("policy-rollout-summary").textContent || "",
            labels: { types: TYPE_LABEL, actions: ACTION_LABEL },
            groups: C.GROUPS,
            generatedAt: new Date(),
          });
          notify("ok", "Overview report downloaded");
        } catch (error) {
          console.error("[overview-pdf]", error);
          notify("error", "The PDF report could not be created", "Please try again in a moment.");
        }
      }

      function policyStatusLabel(status) {
        return ({guards_confirmed:"Active page guards confirmed",downloaded:"Downloaded · awaiting active pages",
          disabled:"Protection disabled",failed:"Policy could not be applied",offline:"Offline · update on reconnect",
          pending:"Policy confirmation pending"})[status] || "Policy confirmation pending";
      }
      function renderPolicyRollout(team) {
        const devices = (team.members || []).flatMap(member => member.connection?.devices || []);
        const current = Number(team.policyVersion) || 0;
        const confirmed = devices.filter(d => d.appliedPolicyVersion === current && d.policyStatus === "guards_confirmed").length;
        const downloaded = devices.filter(d => d.appliedPolicyVersion === current && d.policyStatus === "downloaded").length;
        const offline = devices.filter(d => d.policyStatus === "offline").length;
        const pending = devices.length - confirmed - downloaded - offline;
        const summary = current
          ? `Revision ${current} · ${confirmed} active, ${downloaded} downloaded, ${pending} pending, ${offline} offline`
          : "No team policy has been published yet.";
        $("policy-rollout-summary").textContent = summary;
        const track = $("policy-rollout-track");
        track.replaceChildren();
        track.setAttribute("aria-label", summary);
        if (devices.length) {
          for (const [kind,count] of [["confirmed",confirmed],["downloaded",downloaded],["pending",pending],["offline",offline]]) {
            if (!count) continue;
            const bar = document.createElement("span");
            bar.className = `rollout-segment rollout-${kind}`;
            bar.style.width = `${count / devices.length * 100}%`;
            bar.title = `${count} ${kind}`;
            track.appendChild(bar);
          }
        }
        $("policy-rollout-detail").textContent = devices.length
          ? `${devices.length} reported device${devices.length === 1 ? "" : "s"}. Active means a device confirmed page guards; downloaded means it saved the revision but has not confirmed active pages.`
          : "No extension has checked in yet. Users without a connected device are shown in Users.";
      }
      function devicePolicyDetails(connection, userId, expanded) {
        if (!connection?.devices?.length) return "";
        return `<details data-policy-user="${esc(userId)}" ${expanded.has(userId) ? "open" : ""}><summary>${connection.devices.length} device(s)</summary>${connection.devices.map((d,i)=>
          `<div>Device ${i+1} · v${esc(d.extensionVersion)}<br>${esc(policyStatusLabel(d.policyStatus))} · revision ${esc(d.appliedPolicyVersion)}<br><small>${esc(d.confirmedGuards)} guards responded · ${esc(d.expectedPages)} web pages checked</small></div>`).join("")}</details>`;
      }
      function renderPeople(team) {
        if (!team) return;
        const key = JSON.stringify([team.orgId, team.role, team.members, team.invitations, team.pendingInvitations]);
        if (key === lastPeopleRenderKey) return false;
        const body = $("people");
        const active = document.activeElement;
        const focusKey = body.contains(active)
          ? ["remove", "resend", "revoke", "cancelPending"].find((name) => active.dataset?.[name] !== undefined)
          : null;
        const focusValue = focusKey ? active.dataset[focusKey] : null;
        const focusedPolicyUser = body.contains(active) && active.tagName === "SUMMARY"
          ? active.closest("details[data-policy-user]")?.dataset.policyUser : null;
        const scrollPane = $("console").querySelector(".content");
        const scrollTop = scrollPane.scrollTop;
        const expanded=new Set(Array.from($("people").querySelectorAll("details[open][data-policy-user]"),el=>el.dataset.policyUser));
        const isAdmin = team.role === "org:admin";
        $("invite-row").classList.toggle("hide", !isAdmin);
        const initials = (text) =>
          String(text || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
        const person = (name, email, pending = false) =>
          `<div class="person"><span class="avatar${pending ? " avatar--pending" : ""}" aria-hidden="true">${esc(
            initials(name || email),
          )}</span><div>${name ? `<span class="name">${esc(name)}</span>` : ""}<span class="${
            name ? "mail" : "name"
          }">${esc(email || "")}</span></div></div>`;
        const rows = [
          ...(team.members || []).map((m) => {
            const who = m.name || m.email || "this person";
            const admin = m.role === "org:admin";
            const status = m.connection?.status;
            const [tone, label] =
              status === "recently_connected" ? ["ok", "Recently connected"]
              : status === "inactive" ? ["idle", "Inactive"]
              : ["idle", admin ? "Not yet connected" : "Joined · not yet connected"];
            return `<tr><td>${person(m.name, m.email)}</td><td><span class="tag ${admin ? "admin" : ""}">${
              admin ? "Admin" : "Member"
            }</span></td><td><div class="conn"><span class="pill pill--${tone}">${label}</span>${
              m.connection?.lastSeenAt ? `<small>Last check-in: ${esc(new Date(m.connection.lastSeenAt).toLocaleString())}</small>` : ""
            }${m.connection?.policyStatus ? `<small>${policyStatusLabel(m.connection.policyStatus)}</small>` : ""}${devicePolicyDetails(
              m.connection, m.userId, expanded,
            )}</div></td><td>${
              isAdmin && !admin
                ? `<button class="btn btn--sm" type="button" data-remove="${esc(
                    m.userId,
                  )}" data-who="${esc(who)}" aria-label="Remove ${esc(who)}">Remove</button>`
                : ""
            }</td></tr>`;
          }),
          ...(team.invitations || []).map(
            (i) =>
              `<tr><td>${person("", i.email, true)}</td><td><span class="tag">Member</span></td><td><div class="conn"><span class="pill pill--warn">Invited · awaiting acceptance</span><small>Email delivery not confirmed</small></div></td><td>${
                isAdmin
                  ? `<span class="rowactions"><button class="btn btn--sm" type="button" data-resend="${esc(i.email)}">Resend</button><button class="btn btn--sm" type="button" data-revoke="${esc(i.id)}" data-who="${esc(
                      i.email,
                    )}" aria-label="Revoke the invitation for ${esc(i.email)}">Revoke</button></span>`
                  : ""
              }</td></tr>`,
          ),
        ];
        for (const invitation of team.pendingInvitations || []) rows.push(`<tr><td>${person("", invitation.email, true)}</td><td><span class="tag">Member</span></td><td><div class="conn"><span class="pill pill--warn">Invitation awaiting confirmation</span></div></td><td><button class="btn btn--sm" type="button" data-cancel-pending="${esc(invitation.email)}">Cancel pending invitation</button></td></tr>`);
        body.innerHTML = rows.join("") || '<tr><td colspan="4" class="empty">No users yet. Invite someone above to fill a seat.</td></tr>';
        lastPeopleRenderKey = key;
        if (focusKey) {
          const replacement = [...body.querySelectorAll("button")].find((button) => button.dataset[focusKey] === focusValue);
          replacement?.focus({ preventScroll: true });
        } else if (focusedPolicyUser) {
          const replacement = [...body.querySelectorAll("details[data-policy-user]")].find((item) => item.dataset.policyUser === focusedPolicyUser);
          replacement?.querySelector("summary")?.focus({ preventScroll: true });
        }
        scrollPane.scrollTop = scrollTop;
        return true;
      }

      /**
       * Removing someone is not undoable from here — they'd have to be invited
       * and accept again — so ask once, naming them, and say what it costs them.
       */
      function askConfirm(cell, { question, verb, attr, value, who }) {
        cell.innerHTML =
          `<div class="confirm"><span class="q">${esc(question)}</span>` +
          `<button class="btn btn--sm danger" type="button" data-${attr}="${esc(
            value,
          )}" data-who="${esc(who)}" data-confirmed="1">${esc(verb)}</button>` +
          '<button class="btn btn--sm" type="button" data-cancel="1">Keep</button></div>';
      }

      // Paddle's transaction status is the difference between "we're waiting on
      // Paddle" and "the payment never went through" — worth saying out loud.
      function explainPending(status) {
        const paid = status === "completed" || status === "billed";
        $("pending-title").textContent = paid
          ? "Payment received — activating your seats."
          : "We haven't seen your payment yet.";
        $("pending-body").innerHTML = paid
          ? 'Your subscription is being set up. Press Check again in a moment; if it still ' +
            "doesn't appear, email <a href=\"mailto:billing@secureintent.ai\">billing@secureintent.ai</a> " +
            'and nothing will be lost.'
          : "The checkout wasn't completed, so nothing has been charged. Finish it below, or email " +
            '<a href="mailto:billing@secureintent.ai">billing@secureintent.ai</a> if you think this is wrong.';
      }

      /**
       * Show the payment form. Paddle's overlay is the supported way to pay for
       * a transaction created through the API; the hosted URL is only a fallback
       * for a browser where Paddle.js didn't load.
       */
      function openCheckout(transactionId, fallbackUrl, errEl) {
        const successUrl = `${location.origin}${TEAM_PATH}?welcome=1&claim=${encodeURIComponent(transactionId)}`;
        if (window.Paddle?.Checkout) {
          window.Paddle.Checkout.open({
            transactionId,
            settings: { displayMode: "overlay", theme: document.documentElement.dataset.theme || "dark", successUrl },
          });
          return true;
        }
        // The backend fallback URL points at the old root console. Keep the
        // transaction on this redesigned route so a refresh can resume it.
        history.replaceState(null, "", TEAM_PATH + "?_ptxn=" + encodeURIComponent(transactionId));
        (errEl || $("gate-err")).textContent = "Couldn't load the payment form. Refresh this page to retry.";
        return false;
      }

      /**
       * Create a transaction and open Paddle for it. Shared by the first-purchase
       * form on the gate and the one inside the pending panel — an abandoned
       * checkout leaves a team with no seats, and that panel is then the only
       * screen its buyer can reach, so it has to be able to sell them the seats.
       */
      async function runCheckout({ companyName, seats, errEl, btn }) {
        errEl.textContent = "";
        if (!window.Paddle?.Checkout) {
          errEl.textContent = "Couldn't load the payment service. Please refresh before buying seats.";
          return;
        }
        if (!companyName) {
          errEl.textContent = "Company name is required.";
          return;
        }
        const range = seatsRangeError(seats);
        if (range) {
          errEl.textContent = range;
          return;
        }
        btn.disabled = true;
        try {
          const { transactionId, url } = await api("/v1/team/checkout", {
            method: "POST",
            body: JSON.stringify({ companyName, seats }),
          });
          openCheckout(transactionId, url, errEl);
        } catch (e) {
          errEl.textContent = explain(e, { seats });
        } finally {
          btn.disabled = false;
        }
      }

      // ---------------------------------------------------------------------
      // Team settings: alert routing, and the policy every seat's extension
      // enforces. One record on the server, edited through two panels.
      // ---------------------------------------------------------------------

      // `settings` is the working copy: the lists are edited in place and only
      // reach the server on Save. `loaded` guards against a background
      // loadTeam() (an invite, a removal) wiping edits someone is mid-way
      // through, and against saving defaults over a record we never read.
      let settings = null;
      let settingsLoaded = false;
      let savedWebhook = "";

      const SETTINGS_CONTROLS = [
        "alert-webhook",
        "alert-min",
        "alerts-save",
        "alerts-test",
        "pol-block",
        "pol-lock",
        "site-input",
        "site-add",
        "pat-label",
        "pat-regex",
        "pat-type",
        "pat-add",
        "pol-replace",
        "policy-save",
      ];
      const setSettingsEnabled = (on) => {
        SETTINGS_CONTROLS.forEach((id) => {
          $(id).disabled = !on;
        });
      };

      /**
       * How the last delivery attempt went, as the console needs it. `known`
       * separates "the server told us nothing has been sent" from "this build of
       * the API doesn't report delivery at all" — the second must show nothing
       * rather than claim a healthy silence.
       */
      function normalizeDelivery(raw) {
        const d = raw && typeof raw === "object" ? raw : null;
        const count = (v) => {
          const n = Math.floor(Number(v));
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        const status = d && d.status != null ? Math.floor(Number(d.status)) : NaN;
        return {
          known: !!d,
          lastAttemptAt: d && typeof d.lastAttemptAt === "string" ? d.lastAttemptAt : null,
          // Three states, and null is not a failure: it means nothing has ever
          // been sent, which is the normal state of a quiet week.
          ok: d && d.ok === true ? true : d && d.ok === false ? false : null,
          status: Number.isFinite(status) ? status : null,
          reason: d && typeof d.reason === "string" ? d.reason : null,
          consecutiveFailures: count(d && d.consecutiveFailures),
          suppressedSinceLastAlert: count(d && d.suppressedSinceLastAlert),
          suppressedEvents: count(d && d.suppressedEvents),
          throttleWindowSeconds: count(d && d.throttleWindowSeconds),
        };
      }

      /** Never trust the shape: a missing field must not become `undefined` in a PUT. */
      function normalizeSettings(raw) {
        const s = raw || {};
        const p = s.policy || {};
        return {
          alertWebhook: typeof s.alertWebhook === "string" ? s.alertWebhook : "",
          alertMinType: TYPES.includes(s.alertMinType) ? s.alertMinType : "known-key",
          policy: {
            blockInsteadOfWarn: !!p.blockInsteadOfWarn,
            requireSessionLock: !!p.requireSessionLock,
            // Kept even with an empty pattern list: the server stores the admin's
            // intent and ignores it until there is something to replace the
            // catalogue with, so dropping it here would lose the decision
            // between "tick the box" and "add the patterns" on two saves.
            replaceDefaultPatterns: !!p.replaceDefaultPatterns,
            extraPatterns: (Array.isArray(p.extraPatterns) ? p.extraPatterns : [])
              .filter((x) => x && x.regex)
              .map((x) => ({
                label: String(x.label ?? ""),
                regex: String(x.regex),
                type: TYPES.includes(x.type) ? x.type : "known-key",
              })),
            aiServices: Array.isArray(p.aiServices) ? p.aiServices : [],
            blockedSites: (Array.isArray(p.blockedSites) ? p.blockedSites : [])
              .map((h) => String(h ?? "").trim())
              .filter(Boolean),
          },
          policyVersion: Number(s.policyVersion) || 0,
          alertDelivery: normalizeDelivery(s.alertDelivery),
        };
      }

      // ---------------------------------------------------------------------
      // Alert delivery health. Alerts are fire-and-forget by design, so nothing
      // else on this page would ever tell an admin that their webhook has been
      // swallowing the team's security events since somebody rotated its URL.
      // ---------------------------------------------------------------------

      /** "12 minutes ago" — the form of a timestamp anyone reads at a glance. */
      function relTime(iso) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return null;
        const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
        if (secs < 60) return "just now";
        const mins = Math.round(secs / 60);
        if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
        const dys = Math.round(hrs / 24);
        if (dys < 30) return `${dys} day${dys === 1 ? "" : "s"} ago`;
        const mos = Math.round(dys / 30);
        return `${mos} month${mos === 1 ? "" : "s"} ago`;
      }

      /** The exact time, kept in the title behind the relative one. */
      function absTime(iso) {
        const t = Date.parse(iso);
        return Number.isFinite(t) ? new Date(t).toLocaleString() : String(iso ?? "");
      }

      function agoHtml(iso) {
        const rel = relTime(iso);
        return rel ? `<span class="ago" title="${esc(absTime(iso))}">${esc(rel)}</span>` : "";
      }

      // The Worker's coarse reasons — 'ok', 'http_<status>', 'timeout',
      // 'network_error', 'blocked_url' — as sentences. A code on screen tells an
      // admin nothing they can do something about.
      const DELIVERY_REASON = {
        ok: "your webhook accepted it.",
        timeout: "it didn't answer in time. Check the endpoint is up and replies within a few seconds.",
        network_error:
          "we couldn't reach it at all. Check the address is right and reachable from the public internet.",
        blocked_url:
          "that address isn't allowed. Alerts only go to a public https:// address, so nothing was sent — save a different URL.",
      };

      /** A sentence for any reason, including ones this build has never seen. */
      function deliveryReason(reason, status) {
        // typeof, not `in`: an invented reason must not reach a prototype.
        if (reason && typeof DELIVERY_REASON[reason] === "string") return DELIVERY_REASON[reason];
        const fromReason = /^http_(\d{3})$/.exec(String(reason ?? ""));
        const code = Math.floor(Number(fromReason ? fromReason[1] : status));
        if (Number.isFinite(code) && code >= 100) return `${code} from your webhook. Check the URL.`;
        return "we don't know why. Press Send test to see what it answers.";
      }

      /** How often alerts can leave at most, in the words of the window we got. */
      function throttlePhrase(seconds) {
        const secs = Math.floor(Number(seconds));
        if (!Number.isFinite(secs) || secs <= 0) return "Alerts are sent in batches.";
        if (secs < 60) return `Alerts are sent at most once every ${secs} seconds.`;
        const mins = Math.round(secs / 60);
        if (mins === 1) return "Alerts are sent at most once a minute.";
        if (mins < 60) return `Alerts are sent at most once every ${mins} minutes.`;
        const hrs = Math.round(mins / 60);
        return hrs === 1
          ? "Alerts are sent at most once an hour."
          : `Alerts are sent at most once every ${hrs} hours.`;
      }

      function renderAlertHealth() {
        const box = $("alert-health");
        const line = $("alert-health-line");
        const sub = $("alert-health-sub");
        const d = settings && settings.alertDelivery;
        // The same verdict rides the sidebar, so a webhook that has stopped
        // delivering is visible from the other three views too.
        syncDirty();
        // Nothing to report on: no webhook saved and nothing ever attempted, or
        // an API that doesn't tell us. Silence beats a made-up verdict.
        if (!d || !d.known || (!savedWebhook && d.ok === null && !d.suppressedSinceLastAlert)) {
          box.hidden = true;
          return;
        }
        box.hidden = false;
        box.classList.remove("health--ok", "health--bad");

        const notes = [];
        if (d.ok === true) {
          box.classList.add("health--ok");
          const ago = agoHtml(d.lastAttemptAt);
          line.innerHTML = ago ? `Last alert delivered ${ago}.` : "Last alert delivered.";
        } else if (d.ok === false) {
          box.classList.add("health--bad");
          // consecutiveFailures is the streak; below 2 there is only "the last one".
          const n = Math.max(1, d.consecutiveFailures);
          const what = n > 1 ? `Last ${fmt(n)} alerts failed` : "The last alert failed";
          const ago = agoHtml(d.lastAttemptAt);
          line.innerHTML =
            `${esc(what)} — ${esc(deliveryReason(d.reason, d.status))}` +
            (ago ? ` Last tried ${ago}.` : "");
        } else {
          // Never attempted. Neutral: a team can go a long time without one.
          line.textContent = "No alerts sent yet.";
          notes.push("Nothing has needed one yet. Press Send test to check the URL works.");
        }

        // What is waiting to go out. Without this, "6 detections" on the
        // dashboard and one message in the channel look like lost alerts.
        const held = d.suppressedSinceLastAlert;
        if (held > 0) {
          const ev = d.suppressedEvents;
          const from = ev > 0 ? ` — from ${fmt(ev)} paste${ev === 1 ? "" : "s"}` : "";
          notes.push(
            `${fmt(held)} detection${held === 1 ? "" : "s"} since the last alert, batched${from}. ` +
              `${throttlePhrase(d.throttleWindowSeconds)}`,
          );
        }
        sub.textContent = notes.join(" ");
        sub.hidden = notes.length === 0;
      }

      /**
       * The empty-list case is the one that would read as a lie: the switch is
       * on, our catalogue is still running, and nothing says why. Say it beside
       * the switch, and keep it in step as patterns come and go.
       */
      function syncReplaceWarning() {
        const on = $("pol-replace").checked;
        const empty = !settings || settings.policy.extraPatterns.length === 0;
        $("pol-replace-box").classList.toggle("armed", on);
        $("pol-replace-warn").hidden = !(on && empty);
      }

      function renderSites() {
        const list = settings.policy.blockedSites;
        $("site-list").innerHTML = list.length
          ? `<div class="chips">${list
              .map(
                (h, i) =>
                  `<span class="chip">${esc(h)}<button type="button" data-site="${i}" title="Remove ${esc(
                    h,
                  )}" aria-label="Remove ${esc(h)}">×</button></span>`,
              )
              .join("")}</div>`
          : '<div class="empty">No hostname blocks in this list. Shadow AI paste policies still apply.</div>';
        syncDirty();
      }

      function renderPatterns() {
        const list = settings.policy.extraPatterns;
        $("pat-list").innerHTML = list.length
          ? `<table><thead><tr><th>Label</th><th>Pattern</th><th>Treated as</th><th></th></tr></thead><tbody>${list
              .map(
                (p, i) =>
                  `<tr><td>${esc(p.label || "—")}</td><td><code>${esc(
                    p.regex,
                  )}</code></td><td><span class="tag">${esc(
                    TYPE_LABEL[p.type] || p.type,
                  )}</span></td><td><button class="btn" type="button" data-pattern="${i}">Remove</button></td></tr>`,
              )
              .join("")}</tbody></table>`
          : '<div class="empty">No custom patterns — only the built-in detectors run.</div>';
        // The list just changed, so whether "use only these" is a no-op did too.
        syncReplaceWarning();
        syncDirty();
      }

      function renderSettings() {
        $("alert-webhook").value = settings.alertWebhook;
        $("alert-min").value = settings.alertMinType;
        $("pol-block").checked = settings.policy.blockInsteadOfWarn;
        $("pol-lock").checked = settings.policy.requireSessionLock;
        // Before renderPatterns(): it reads this box to decide whether to warn.
        $("pol-replace").checked = settings.policy.replaceDefaultPatterns;
        renderAlertHealth();
        renderSites();
        renderPatterns();
        $("policy-version").textContent = settings.policyVersion
          ? `Policy version ${settings.policyVersion} saved. Extension application has not yet been confirmed.`
          : "No organization policy saved yet.";
      }

      /** Read once per page load; re-read only after a failure. */
      async function loadSettings() {
        if (settingsLoaded) return;
        setSettingsEnabled(false);
        try {
          const res = await api("/v1/team/settings");
          settings = normalizeSettings(res.settings || res);
          savedWebhook = settings.alertWebhook;
          settingsLoaded = true;
          renderSettings();
          markSettingsSaved();
          setSettingsEnabled(true);
        } catch (e) {
          // Leave the controls disabled: writing defaults over a record we
          // failed to read would quietly undo someone's policy.
          settings = settings || normalizeSettings(null);
          renderSettings();
          markSettingsSaved();
          const msg = explain(e, {
            fallback: "Couldn't load your settings. Reload the page to try again.",
          });
          flash($("alerts-status"), msg, "err");
          flash($("policy-status"), msg, "err");
        }
      }

      /**
       * One record, so either Save writes the whole thing — the copy under both
       * panels says as much.
       */
      async function saveSettings(statusEl, btn) {
        if (!settingsLoaded) return;
        const webhook = $("alert-webhook").value.trim();
        if (webhook && !/^https:\/\/\S+$/i.test(webhook)) {
          flash(statusEl, "The webhook URL has to start with https:// — alerts are never sent over http.", "err");
          return;
        }
        settings.alertWebhook = webhook;
        settings.alertMinType = $("alert-min").value;
        settings.policy.blockInsteadOfWarn = $("pol-block").checked;
        settings.policy.requireSessionLock = $("pol-lock").checked;
        settings.policy.replaceDefaultPatterns = $("pol-replace").checked;

        btn.disabled = true;
        flash(statusEl, "Saving…", "");
        try {
          // Only the three fields the server owns from here. policyVersion and
          // the delivery health are its to report, not ours to echo back.
          const res = await api("/v1/team/settings", {
            method: "PUT",
            body: JSON.stringify({
              alertWebhook: settings.alertWebhook,
              alertMinType: settings.alertMinType,
              policy: settings.policy,
              expectedVersion: settings.policyVersion,
            }),
          });
          // Take the server's copy when it sends one back (it owns
          // policyVersion); otherwise keep what we just wrote.
          const back = res && (res.settings || (res.policy ? res : null));
          settings = normalizeSettings(back || settings);
          savedWebhook = settings.alertWebhook;
          if (currentTeam) {
            currentTeam.policyVersion = settings.policyVersion;
            renderPolicyRollout(currentTeam);
          }
          renderSettings();
          markSettingsSaved();
          flash(statusEl, "Saved. Extension application has not yet been confirmed.", "ok");
        } catch (e) {
          flash(statusEl, explain(e, { fallback: ERROR_TEXT["save failed"] }), "err");
        } finally {
          btn.disabled = false;
        }
      }

      async function sendTestAlert() {
        const st = $("alerts-status");
        const typed = $("alert-webhook").value.trim();
        if (!typed) {
          flash(st, "Add a webhook URL and save it — there's nowhere to send a test yet.", "err");
          return;
        }
        if (typed !== savedWebhook) {
          flash(st, "Save the new URL first — the test posts to the saved one.", "err");
          return;
        }
        $("alerts-test").disabled = true;
        flash(st, "Sending…", "");
        try {
          await api("/v1/team/settings/test-alert", { method: "POST", body: "{}" });
          flash(st, "Test alert sent. It should be in your channel now.", "ok");
          recordTestAttempt(true, null);
        } catch (e) {
          flash(st, explain(e, { fallback: ERROR_TEXT.delivery_failed }), "err");
          // Only a real delivery attempt counts. A 401/403/400 never reached the
          // webhook, so it must not be written into its health.
          if (e && e.code === "delivery_failed") recordTestAttempt(false, e.data && e.data.status);
        } finally {
          $("alerts-test").disabled = false;
        }
      }

      /**
       * The server counts a test as a real delivery attempt, so the health line
       * above has just changed. Mirror it rather than re-reading /settings — a
       * refetch would overwrite pattern and hostname edits nobody has saved yet.
       */
      function recordTestAttempt(ok, status) {
        if (!settingsLoaded || !settings) return;
        const prev = settings.alertDelivery;
        const code = Math.floor(Number(status));
        const known = Number.isFinite(code) && code >= 100 ? code : null;
        settings.alertDelivery = normalizeDelivery({
          ...prev,
          known: true,
          lastAttemptAt: new Date().toISOString(),
          ok,
          // Nothing is invented: a failure with no status stays reasonless
          // rather than guessing between a timeout and a refusal.
          status: ok ? null : known,
          reason: ok ? "ok" : known ? `http_${known}` : null,
          consecutiveFailures: ok ? 0 : prev.consecutiveFailures + 1,
        });
        renderAlertHealth();
      }

      function addBlockedSite() {
        const st = $("policy-status");
        const host = $("site-input")
          .value.trim()
          .replace(/^[a-z]+:\/\//i, "")
          .replace(/\/.*$/, "")
          .toLowerCase();
        if (!host) return;
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
          flash(st, "That isn't a hostname. Try something like chat.example.com.", "err");
          return;
        }
        if (settings.policy.blockedSites.includes(host)) {
          flash(st, `${host} is already on the list.`, "err");
          return;
        }
        settings.policy.blockedSites.push(host);
        $("site-input").value = "";
        renderSites();
        flash(st, `Added ${host}. Press Save changes to send it out.`, "ok");
      }

      function addPattern() {
        const st = $("policy-status");
        const label = $("pat-label").value.trim();
        const regex = $("pat-regex").value.trim();
        if (!label) {
          flash(st, "Give the pattern a label — that's what your colleague reads in the warning.", "err");
          return;
        }
        if (!regex) {
          flash(st, "A pattern needs a regular expression.", "err");
          return;
        }
        // Better to fail here than to ship a regex that throws on every seat.
        try {
          new RegExp(regex);
        } catch (err) {
          flash(st, `That regular expression won't compile: ${err.message}`, "err");
          return;
        }
        settings.policy.extraPatterns.push({ label, regex, type: $("pat-type").value });
        $("pat-label").value = "";
        $("pat-regex").value = "";
        renderPatterns();
        flash(st, `Added "${label}". Press Save changes to send it out.`, "ok");
      }

      // ---------------------------------------------------------------------
      // Views behind one sidebar, addressed by hash so the back
      // button works and a link can point at the one you mean. The hash carries
      // a slash (#/policy) so it can never collide with an element id on the
      // page and make the browser jump to it instead.
      // ---------------------------------------------------------------------
      const VIEWS = ["overview", "people", "policy", "alerts", "shadow"];
      // Everything except the roster needs a live subscription behind it: with
      // no seats there are no figures, and a policy nothing would enforce.
      const VIEWS_NEED_SEATS = ["overview", "policy", "alerts", "shadow"];
      let currentView = null;
      const viewScroll = new Map();
      let seatsLive = false;

      const viewFromHash = () => {
        const name = String(location.hash || "").replace(/^#\/?/, "");
        return VIEWS.includes(name) ? name : null;
      };
      // Preserve the incoming deep link while Clerk and the team record load.
      // Early renders must not replace an explicit #/shadow with Overview.
      let requestedView = viewFromHash();

      /** Which nav items are reachable, and why not when they aren't. */
      function syncNavLocks() {
        VIEWS.forEach((name) => {
          const item = document.querySelector(`.navitem[data-view="${name}"]`);
          if (!item) return;
          const locked = !seatsLive && VIEWS_NEED_SEATS.includes(name);
          item.setAttribute("aria-disabled", locked ? "true" : "false");
          if (locked) item.title = PAY_HINT;
          else item.removeAttribute("title");
        });
      }

      /**
       * Show one view. `focus` moves the caret into it on a real click, so a
       * keyboard user lands in the content they just asked for rather than back
       * at the top of the document.
       */
      function showView(name, { focus = false, replace = false } = {}) {
        let want = VIEWS.includes(name) ? name : "overview";
        if (!seatsLive && VIEWS_NEED_SEATS.includes(want)) want = "people";
        const viewChanged = currentView !== want;
        const contentPane = $("console").querySelector(".content");
        if (viewChanged && currentView) viewScroll.set(currentView, contentPane.scrollTop);
        currentView = want;
        if (viewChanged) {
          // A notice belongs to the view whose action raised it.
          $("toasts")?.replaceChildren();
          VIEWS.forEach((v) => {
            $(`view-${v}`).hidden = v !== want;
            const item = document.querySelector(`.navitem[data-view="${v}"]`);
            if (item) {
              if (v === want) item.setAttribute("aria-current", "page");
              else item.removeAttribute("aria-current");
            }
          });
          if (want === "shadow") mountShadow();
        }
        requestedView = want;
        const hash = `#/${want}`;
        if (location.hash !== hash) {
          if (replace) history.replaceState(null, "", location.pathname + location.search + hash);
          else history.pushState(null, "", location.pathname + location.search + hash);
        }
        if (viewChanged) window.dispatchEvent(new CustomEvent('si-team-view', {detail: want}));
        if (focus) $(`view-${want}`).focus({ preventScroll: true });
        // Each view retains its own reading position. Background refreshes
        // leave the pane where the reader was.
        if (viewChanged) contentPane.scrollTop = viewScroll.get(want) ?? 0;
      }

      // The API verifies Business entitlement and the organization admin role.
      // Seat count or a personal Pro subscription cannot unlock this link.
      let shadowMount;
      function mountShadow() {
        if (shadowMount) return;
        shadowMount = import('./team-shadow.js').then(module => module.mountShadow(document.getElementById('shadow-root'))).catch(() => {
          shadowMount = null;
          const host = document.getElementById('shadow-root');
          host.replaceChildren();
          const message = document.createElement('p');
          message.textContent = 'Shadow AI could not load. Please retry.';
          const retry = document.createElement('button');
          retry.className = 'btn'; retry.textContent = 'Retry'; retry.onclick = mountShadow;
          host.append(message, retry);
        });
      }

      /** Seats used, on the People item, so the number follows you around. */
      function syncNavSeats(team) {
        const el = $("nav-seats");
        if (!el) return;
        const seats = Math.floor(Number(team && team.seats));
        if (!Number.isFinite(seats) || seats <= 0) {
          el.textContent = "";
          return;
        }
        el.textContent = `${fmt(team.seatsUsed)}/${fmt(seats)}`;
      }

      /** One dot's three states, written in one place. */
      function setDot(id, kind) {
        const el = $(id);
        if (!el) return;
        el.className = "sdot" + (kind ? ` sdot--${kind}` : "");
        el.hidden = !kind;
        el.title =
          kind === "ok"
            ? "Your last alert was delivered"
            : kind === "bad"
              ? "Your last alert failed to deliver"
              : kind === "dirty"
                ? "Unsaved changes"
                : "";
      }

      /**
       * Unsaved work has to be visible from the other three views, or splitting
       * one long page into four turns "I edited that" into "I thought I saved
       * it". Both dots light: alerts and policy are one record, so either Save
       * writes whatever is outstanding on both.
       */
      function settingsSnapshot() {
        if (!settings) return "";
        return JSON.stringify({
          webhook: $("alert-webhook").value.trim(),
          min: $("alert-min").value,
          block: $("pol-block").checked,
          lock: $("pol-lock").checked,
          replace: $("pol-replace").checked,
          patterns: settings.policy.extraPatterns,
          sites: settings.policy.blockedSites,
        });
      }
      let savedSnapshot = "";
      /** This is now the record the server holds — nothing outstanding. */
      function markSettingsSaved() {
        savedSnapshot = settingsSnapshot();
        syncDirty();
      }
      function syncDirty() {
        const dirty = settingsLoaded && settingsSnapshot() !== savedSnapshot;
        setDot("nav-policy-dot", dirty ? "dirty" : null);
        // A failing webhook outranks an unsaved edit on its own item: one is a
        // reminder, the other is alerts going nowhere.
        const d = settings && settings.alertDelivery;
        const health = d && d.known && savedWebhook ? (d.ok === true ? "ok" : d.ok === false ? "bad" : null) : null;
        setDot("nav-alerts-dot", health || (dirty ? "dirty" : null));
      }

      /**
       * The one place that decides which of the gate's four faces is showing —
       * sign-in, buy, "you're covered", or an error — so a new branch can't
       * leave another one's block on screen.
       */
      function showGate({ title, sub = "", pitch = false, actions = false, member = false, comp = false }) {
        $("gate").classList.remove("hide");
        $("console").classList.add("hide");
        $("topbar").hidden = false;
        $("gate-wrap").hidden = false;
        $("gate-title").textContent = title;
        $("gate-sub").textContent = sub;
        $("gate-retry").hidden = true;
        $("pitch").classList.toggle("hide", !pitch);
        $("gate-actions").classList.toggle("hide", !actions);
        $("comp-actions").classList.toggle("hide", !comp);
        $("member-actions").classList.toggle("hide", !member);
      }

      let clerkVerificationStarting=false;
      function showAdminClerkGate({automatic=true,reason='',retry=false}={}) {
        seatsLive=false;
        window.SIAdminAccess.clear();
        currentTeam=null;lastMetrics=null;
        // `retry`: Clerk signed them in and only our own check failed to
        // answer. Signing in a second time would not help; asking again might.
        showGate(retry
          ? {title:"We couldn't confirm your admin access",sub:'You are signed in, but the check that opens the Business dashboard did not finish.'}
          : {title:'Verify your admin account with Clerk',sub:'Sign in again with your registered organisation account to open the Business dashboard.'});
        const host=$('clerk-auth');host.replaceChildren();
        host.innerHTML='<div class="gate-cta">'+(retry?'<button class="btn primary btn--lg" id="admin-clerk-retry" type="button">Try again</button>':'')+
          `<button class="btn ${retry?'':'primary '}btn--lg" id="admin-clerk-verify" type="button">${retry?'Sign in again':'Continue with Clerk'}</button></div>`+
          '<p id="admin-clerk-status" class="status" role="status" aria-live="polite"></p>';
        // Progress is a quiet line; a failure is an alert. Never the same look.
        const say=(text,failed=false)=>{const el=$('admin-clerk-status');if(!el)return;el.textContent=text;el.className=failed?'err':'status';};
        say(reason,Boolean(reason));
        const begin=async()=>{
          if(clerkVerificationStarting)return;
          clerkVerificationStarting=true;
          $('admin-clerk-verify').disabled=true;
          $('admin-clerk-verify').setAttribute('aria-busy','true');
          say('Opening Clerk sign-in…');
          try {
            sessionStorage.setItem('si_admin_clerk_pending','1');
            if(/^#\/(overview|people|policy|alerts|shadow)$/.test(location.hash)) sessionStorage.setItem('si_admin_return_view',location.hash);
          } catch {}
          const destination=SI.page('team.html?admin_verify=1');
          try {
            await window.Clerk.signOut({sessionId:window.Clerk.session?.id,redirectUrl:destination});
            location.assign(destination);
          } catch {
            clerkVerificationStarting=false;
            $('admin-clerk-verify').disabled=false;
            $('admin-clerk-verify').removeAttribute('aria-busy');
            say('Clerk sign-in did not open. Check your connection and try again.',true);
          }
        };
        $('admin-clerk-retry')?.addEventListener('click',()=>{
          $('admin-clerk-retry').disabled=true;
          $('admin-clerk-retry').setAttribute('aria-busy','true');
          say('Checking your admin access…');
          void render(true);
        });
        $('admin-clerk-verify').addEventListener('click',begin);
        if(automatic)void begin();
      }
      window.addEventListener('si-admin-lock',()=>showAdminClerkGate());

      /**
       * Everything that needs a live subscription behind it. Disabled with a
       * reason rather than left clickable: unpaid, the server answers every one
       * of these with a 402, and a button that always fails teaches nothing.
       */
      function setPaywalled(live) {
        ["invite-email", "invite-role", "invite", "seats-btn"].forEach((id) => {
          $(id).disabled = !live || invitesBusy;
          if (live) $(id).removeAttribute("title");
          else $(id).title = PAY_HINT;
        });
        $("users-refresh").disabled = invitesBusy;
        $("invite-hint").hidden = live;
        if (!live) closeSeatsEditor();
      }

      /** Prefill the pending panel's form from the team we already created. */
      function preparePendingBuy(team) {
        // Only when empty, so a background refresh can't overwrite what someone
        // is halfway through typing.
        if (!$("pending-company").value.trim()) $("pending-company").value = team.name || "";
        if (!$("pending-seats").value) $("pending-seats").value = String(MIN_SEATS + 2);
        updatePrice($("pending-seats"), $("pending-price"));
      }

      function openSeatsEditor() {
        // A comped team has no subscription to prorate against, so the server
        // would 404 this. Say why instead of opening a form that cannot save.
        if (currentTeam && currentTeam.comp) {
          $("team-err").textContent =
            "Your seats come with your plan, so there's no subscription to change. Email " +
            BILLING_EMAIL + " if you need more.";
          return;
        }
        const now = Math.floor(Number(currentTeam && currentTeam.seats));
        $("seats-input").value = String(Number.isFinite(now) && now >= MIN_SEATS ? now : MIN_SEATS);
        $("seats-edit").hidden = false;
        updatePrice($("seats-input"), $("seats-price"), ", prorated today");
        $("seats-input").focus();
      }

      function closeSeatsEditor() {
        $("seats-edit").hidden = true;
      }

      async function loadTeam({ reconcile = false } = {}) {
        $("shadow-nav").hidden = false;
        const userId = window.Clerk.user?.id;
        // ?reconcile=1 makes the server ask Paddle directly instead of waiting on
        // a webhook. Costs a Paddle call, so it's for the first look after
        // checkout and the retry button — never for a plain read.
        const res = await api(reconcile ? "/v1/team?reconcile=1" : "/v1/team");
        if (!userId || window.Clerk.user?.id !== userId) return;
        let team = res.team;
        if (currentTeam?.orgId && currentTeam.orgId !== team?.orgId) {
          viewScroll.clear();
          currentView = null;
          lastPeopleRenderKey = null;
        }
        currentTeam = team || null;
        clearTeamRefreshNotice();
        if (!team) {
          showGate({title:"Business invitation required",sub:"Open the Business promo invitation provided to your organization to activate its 150-seat workspace."});
          return;
        }

        const isAdmin = team.role === "org:admin";
        if (!isAdmin) {
          // Seats, colleagues and what the team's extensions caught are the
          // admin's. There is still one thing that's theirs: getting the
          // extension onto this browser, which is what their seat pays for.
          showGate({
            title: team.name ? `Covered by ${team.name}` : "You're covered",
            sub: CFG.pilot
              ? "Your Developer Pro features are provided by your team. Load the local pilot extension supplied by your administrator and sign in with this account."
              : "Your Developer Pro features are provided by your team, so there's nothing to buy. Install the extension and sign in with this account.",
            member: true,
          });
          return;
        }
        $("gate").classList.add("hide");
        $("console").classList.remove("hide");
        // The console brings its own sidebar; two navs stacked is clutter. The
        // gate's wrapper goes with it: emptied it still spends its own padding,
        // which offsets the sticky sidebar and pushes its last row off screen.
        $("topbar").hidden = true;
        $("gate-wrap").hidden = true;

        const live = team.seats > 0;
        $("team-name").textContent = team.name || "Your team";
        $("team-sub").textContent = live
          ? `Business plan · ${team.seatsUsed} of ${team.seats} seats in use`
          : "Setting up";
        // No seats means no subscription reached us yet. Say so plainly rather
        // than showing someone "1 / 0" and a wall of zeros: the pending panel
        // stays above every view, and the three views that need a subscription
        // are locked until it clears.
        $("pending").hidden = live;
        if (!live) preparePendingBuy(team);
        seatsLive = live;
        syncNavSeats(team);
        syncNavLocks();
        // First paint honours a deep link (#/policy); later ones keep you where
        // you were, unless what you were reading has just been locked.
        // A URL chosen by the user or extension is authoritative on page load.
        // Without this ordering, an early render's in-memory Overview selection
        // overwrote direct links such as #/shadow after authentication settled.
        showView(requestedView || viewFromHash() || currentView || "overview", { replace: true });
        $("c-seats").textContent = fmt(team.seats);
        $("c-used").innerHTML = `${fmt(team.seatsUsed)} <small>/ ${fmt(team.seats)}</small>`;
        renderPeople(team);
        renderPolicyRollout(team);
        const available = `${fmt(team.seatsAvailable)} seats available`;
        if (!$("users-refreshed").textContent.includes(available)) $("users-refreshed").textContent = available;
        setPaywalled(live);

        // Only an admin gets here, and only a team with seats has anything to
        // show or configure — the loop above already hid both for the rest.
        if (live) {
          await Promise.all([loadMetrics(), loadSettings()]);
        } else {
          $("c-total").textContent = "—";
          $("c-actors").textContent = "—";
        }
      }

      let rosterBusy = false;
      let rolloutBusy = false;
      function handleTeamReadError(error) {
        if (error.code === 'admin_reauthentication_required' || error.name === 'AbortError') return;
        if ([401, 403].includes(error.status)) {
          clearTeamRefreshNotice();
          currentTeam = null;
          showGate({title: error.status === 401 ? 'Your session expired' : 'Team access unavailable', sub: explain(error)});
          return;
        }
        if (currentTeam && !$('console').classList.contains('hide')) {
          $('team-refresh-notice').hidden = false;
          scheduleTeamRetry();
        }
      }
      async function refreshPolicyRollout() {
        if (rolloutBusy || document.hidden || currentView !== "overview" || $("console").classList.contains("hide")) return;
        rolloutBusy = true;
        const scope = authScope();
        try {
          const result = await api("/v1/team");
          if (scope !== authScope()) return;
          if (result.team?.role !== "org:admin") {
            currentTeam = null;
            clearTeamRefreshNotice();
            showGate({title:'Team access unavailable',sub:'This account no longer has administrator access.'});
            return;
          }
          currentTeam = result.team;
          renderPolicyRollout(currentTeam);
          clearTeamRefreshNotice();
        } catch (error) {
          handleTeamReadError(error);
          if (![401, 403].includes(error.status)) $("policy-rollout-detail").textContent = "Could not refresh rollout status. Showing the last confirmed report; retrying automatically.";
        }
        finally { rolloutBusy = false; }
      }
      async function refreshUsers({ manual = false } = {}) {
        if (rosterBusy || invitesBusy || document.hidden || currentView !== "people" || document.querySelector("[data-confirmed]")) return;
        rosterBusy=true;
        const scope=authScope();
        try {
          const result=await api("/v1/team");
          if (scope!==authScope() || invitesBusy) return;
          if (result.team?.role !== "org:admin") { await loadTeam(); return; }
          currentTeam=result.team;renderPeople(currentTeam);syncNavSeats(currentTeam);clearTeamRefreshNotice();
          const available = `${fmt(currentTeam.seatsAvailable)} seats available`;
          if (manual) $("users-refreshed").textContent=`Updated ${new Date().toLocaleTimeString()} · ${available}`;
          else if (!$("users-refreshed").textContent.includes(available)) $("users-refreshed").textContent=available;
        } catch(e) { $("users-refreshed").textContent=explain(e); handleTeamReadError(e); }
        finally { rosterBusy=false; }
      }

      async function act(fn, ctx = {}) {
        $("team-err").textContent = "";
        try {
          await fn();
          if (ctx.done) notify("ok", ctx.done);
        } catch (e) {
          if (e.name === "AbortError") return;
          // The button is in the roster; the error line is up in the invite
          // panel. Pop it up as well so it is seen where the click happened.
          $("team-err").textContent = explain(e, ctx);
          notify("error", ctx.failed || "That didn't go through", explain(e, ctx));
          lastPeopleRenderKey = null;
          renderPeople(currentTeam);
          return;
        }
        try {
          await loadTeam();
        } catch (e) {
          handleTeamReadError(e);
        }
      }

      async function sendInvitations() {
        if (invitesBusy) return;
        const input = $("invite-email");
        const entries = input.value.split(/[,;\s]+/).filter(Boolean);
        const emails = [...new Set(entries.map((email) => email.toLowerCase()))];
        const invalid = emails.filter((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
        $("team-err").textContent = "";
        $("invite-progress").textContent = "";
        $("invite-results").hidden = true;
        if (!emails.length) {
          $("team-err").textContent = "Enter at least one email address.";
          input.focus();
          return;
        }
        if (invalid.length) {
          $("team-err").textContent = `${invalid.length === 1 ? "This doesn't look like an email address" : "These don't look like email addresses"}: ${invalid.join(", ")}. Fix or remove ${invalid.length === 1 ? "it" : "them"}, then send again.`;
          input.focus();
          return;
        }
        if (emails.length > 149) {
          $("team-err").textContent = "Enter no more than 149 different addresses at once.";
          input.focus();
          return;
        }

        invitesBusy = true;
        setPaywalled(seatsLive);
        $("invite").setAttribute("aria-busy", "true");
        let requested = 0;
        let alreadyInvited = 0;
        let alreadyMember = 0;
        let next = emails.length;
        const failed = [];
        try {
          // The existing endpoint checks admin access, reserves one seat and
          // creates one Clerk invitation per address. Serial requests avoid
          // contending with its organisation-wide seat lock.
          for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            $("invite-progress").textContent = emails.length === 1 ? `Inviting ${email}…` : `Inviting ${i + 1} of ${emails.length}: ${email}…`;
            try {
              const result = await api("/v1/team/invite", {
                method: "POST",
                body: JSON.stringify({ email, role: $("invite-role").value }),
              });
              if (result.alreadyInvited) alreadyInvited++;
              else requested++;
            } catch (err) {
              if (err.code === "already_member") {
                alreadyMember++;
                continue;
              }
              failed.push({ email, reason: explain(err) });
              // A full team, changed session, or busy service needs admin
              // attention. Preserve every unprocessed address for later.
              if (["seat_limit_reached", "team_busy", "unauthenticated", "forbidden", "admin_reauthentication_required", "invitation_pending_reconciliation"].includes(err.code) ||
                  [401, 403, 429].includes(err.status) || err.status >= 500 || err.name === "AbortError") {
                next = i + 1;
                break;
              }
            }
          }
          const remaining = [...failed.map(({ email }) => email), ...emails.slice(next)];
          input.value = remaining.join("\n");
          // Only what actually happened: six counters, five of them zero, is
          // a puzzle rather than an answer.
          const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
          const left = emails.length - next;
          const duplicates = entries.length - emails.length;
          const parts = [
            requested && count(requested, "invitation sent", "invitations sent"),
            alreadyInvited && count(alreadyInvited, "was already invited", "were already invited"),
            alreadyMember && count(alreadyMember, "is already a member", "are already members"),
            duplicates && count(duplicates, "duplicate skipped", "duplicates skipped"),
            failed.length && count(failed.length, "couldn't be sent", "couldn't be sent"),
            left && count(left, "not attempted", "not attempted"),
          ].filter(Boolean);
          $("invite-progress").textContent = failed.length ? "" : `${parts.join(" · ")}.`;
          $("invite-progress").className = !failed.length && requested ? "status ok" : "status";
          const results = $("invite-results");
          if (failed.length) {
            const title = count(failed.length, "invitation couldn't be sent", "invitations couldn't be sent");
            const kept = remaining.length === 1 ? "The address is still in the box" : "These addresses are still in the box";
            results.className = "alert";
            results.innerHTML =
              `<div><span class="alert-title">${esc(title)}</span>` +
              `<p>${esc(kept)} so you can correct ${remaining.length === 1 ? "it" : "them"} and send again.${
                left ? ` ${esc(count(left, "address was", "addresses were"))} not attempted.` : ""
              }${parts.length > 1 ? ` Otherwise: ${esc(parts.filter((part) => !part.includes("couldn't") && !part.includes("not attempted")).join(" · ") || "nothing sent")}.` : ""}</p>` +
              `<ul>${failed.map(({ email, reason }) => `<li><b>${esc(email)}</b>${esc(reason)}</li>`).join("")}</ul></div>`;
            notify("error", title, failed.length === 1 ? `${failed[0].email}: ${failed[0].reason}` : "The reason for each one is listed under the invite box.");
            input.focus();
          } else {
            results.innerHTML = "";
            if (requested) notify("ok", count(requested, "invitation sent", "invitations sent"), "Each person gets an email with a link to join.");
            else notify("info", "Nothing new to send", `${parts.join(" · ")}.`);
          }
          results.hidden = !failed.length;
          try {
            await loadTeam();
          } catch (err) {
            $("team-err").textContent = `The invitations were processed, but the user list didn't refresh. ${explain(err)}`;
          }
        } finally {
          invitesBusy = false;
          $("invite").removeAttribute("aria-busy");
          setPaywalled(seatsLive);
        }
      }

      function wire() {
        // Inert until a GET has told us what the current settings are.
        setSettingsEnabled(false);
        // One source of truth for the store link; the markup carries it too so
        // the GA install_click selector still matches before this runs.
        // SI_INSTALL_URL is whichever store this browser can install from —
        // Mozilla on Firefox, Chrome Web Store otherwise. Setting the href here
        // happens long after install-links.js ran, so take the value rather than
        // overwrite what it decided.
        $("member-install").href = window.SI_INSTALL_URL || EXTENSION_URL;
        $("member-store-action").hidden = Boolean(CFG.pilot);
        $("member-pilot-instructions").hidden = !CFG.pilot;

        // Activation, not purchase: the seats already belong to this account, so
        // this only names the organisation and asks the server to open it.
        $("comp-activate").addEventListener("click", async () => {
          const err = $("comp-err");
          const btn = $("comp-activate");
          err.textContent = "";
          const companyName = $("comp-company").value.trim();
          if (!companyName) {
            err.textContent = "Company name is required.";
            return;
          }
          btn.disabled = true;
          try {
            await api("/v1/team/claim", {
              method: "POST",
              body: JSON.stringify({ companyName }),
            });
            await loadTeam();
          } catch (e) {
            err.textContent = explain(e);
          } finally {
            btn.disabled = false;
          }
        });

        // Both buy forms are the same purchase: the gate's, and the one inside
        // the pending panel that rescues an abandoned checkout.
        $("buy").addEventListener("click", () =>
          runCheckout({
            companyName: $("company").value.trim(),
            seats: Math.floor(Number($("buy-seats").value)),
            errEl: $("gate-err"),
            btn: $("buy"),
          }),
        );
        $("pending-buy").addEventListener("click", () =>
          runCheckout({
            companyName: $("pending-company").value.trim(),
            seats: Math.floor(Number($("pending-seats").value)),
            errEl: $("pending-err"),
            btn: $("pending-buy"),
          }),
        );
        $("buy-seats").addEventListener("input", () => updatePrice($("buy-seats"), $("buy-price")));
        $("pending-seats").addEventListener("input", () =>
          updatePrice($("pending-seats"), $("pending-price")),
        );
        updatePrice($("buy-seats"), $("buy-price"));

        $("invite").addEventListener("click", sendInvitations);
        window.addEventListener("beforeunload", (event) => {
          if (!invitesBusy) return;
          event.preventDefault();
          event.returnValue = "";
        });

        // An inline control, not a prompt(): it can show the count you're
        // starting from and what the new one costs before you commit to it.
        $("seats-btn").addEventListener("click", openSeatsEditor);
        $("seats-cancel").addEventListener("click", closeSeatsEditor);
        $("seats-input").addEventListener("input", () =>
          updatePrice($("seats-input"), $("seats-price"), ", prorated today"),
        );
        $("seats-save").addEventListener("click", () => {
          const seats = Math.floor(Number($("seats-input").value));
          const range = seatsRangeError(seats);
          if (range) {
            $("team-err").textContent = range;
            return;
          }
          act(async () => {
            await api("/v1/team/seats", { method: "POST", body: JSON.stringify({ seats }) });
            closeSeatsEditor();
          }, { seats });
        });

        $("people").addEventListener("click", (e) => {
          const btn = e.target.closest?.("button");
          if (!btn) return;
          if (btn.dataset.resend) { btn.disabled=true; btn.setAttribute("aria-busy","true"); act(()=>api("/v1/team/invite/resend",{method:"POST",body:JSON.stringify({email:btn.dataset.resend})}),{done:`Invitation resent to ${btn.dataset.resend}`,failed:"The invitation wasn't resent"}); return; }
          if (btn.dataset.cancelPending) { btn.disabled=true; btn.setAttribute("aria-busy","true"); act(()=>api("/v1/team/invite/cancel-pending",{method:"POST",body:JSON.stringify({email:btn.dataset.cancelPending})}),{done:"Pending invitation cancelled",failed:"The invitation wasn't cancelled"}); return; }
          const { remove, revoke, who, confirmed, cancel } = btn.dataset;
          if (cancel) {
            renderPeople(currentTeam);
            return;
          }
          if (!remove && !revoke) return;
          if (!confirmed) {
            // Ask first, naming them: neither of these can be undone from here.
            askConfirm(btn.closest("td"), {
              question: remove
                ? `Remove ${who}? Their organization access will be revoked. Previously issued extension access expires separately.`
                : `Revoke the invitation for ${who}? They won't be able to join with it.`,
              verb: remove ? "Remove" : "Revoke",
              attr: remove ? "remove" : "revoke",
              value: remove || revoke,
              who,
            });
            return;
          }
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          if (remove) {
            act(() =>
              api("/v1/team/member/remove", {
                method: "POST",
                body: JSON.stringify({ userId: remove }),
              }),
              { done: `${who} was removed and their seat is free`, failed: `${who} wasn't removed` },
            );
          } else {
            act(() =>
              api("/v1/team/invite/revoke", {
                method: "POST",
                body: JSON.stringify({ invitationId: revoke }),
              }),
              { done: `Invitation for ${who} revoked`, failed: "The invitation wasn't revoked" },
            );
          }
        });

        // Its own error line: this button lives in the pending panel, and its
        // failure belongs next to it rather than in the roster below.
        $("recheck").addEventListener("click", async () => {
          $("pending-err").textContent = "";
          $("recheck").disabled = true;
          try {
            await api("/v1/team/reconcile", { method: "POST", body: "{}" });
            await loadTeam();
          } catch (e) {
            $("pending-err").textContent = explain(e, {
              fallback: ERROR_TEXT["reconcile failed"],
            });
          } finally {
            $("recheck").disabled = false;
          }
        });

        $("range").addEventListener("change", async () => {
          days = Number($("range").value) || 30;
          $("team-err").textContent = "";
          try {
            await loadMetrics();
          } catch (e) {
            $("team-err").textContent = explain(e, {
              fallback: "Couldn't load those figures. Try again in a moment.",
            });
          }
        });

        $("export").addEventListener("click", exportCsv);
        $("overview-export-pdf").addEventListener("click", exportPdf);

        $("alerts-save").addEventListener("click", () =>
          saveSettings($("alerts-status"), $("alerts-save")),
        );
        $("alerts-test").addEventListener("click", sendTestAlert);
        $("policy-save").addEventListener("click", () =>
          saveSettings($("policy-status"), $("policy-save")),
        );

        $("site-add").addEventListener("click", addBlockedSite);
        $("site-input").addEventListener("keydown", (e) => {
          if (e.key === "Enter") addBlockedSite();
        });
        $("pat-add").addEventListener("click", addPattern);
        // Ticked with nothing to replace the catalogue with? Say so on the spot,
        // not after a save that appears to have done something.
        $("pol-replace").addEventListener("change", syncReplaceWarning);

        $("site-list").addEventListener("click", (e) => {
          const i = e.target.getAttribute?.("data-site");
          if (i === null || i === undefined) return;
          const [gone] = settings.policy.blockedSites.splice(Number(i), 1);
          renderSites();
          flash($("policy-status"), `Removed ${gone}. Press Save changes to apply it.`, "ok");
        });

        $("pat-list").addEventListener("click", (e) => {
          const i = e.target.getAttribute?.("data-pattern");
          if (i === null || i === undefined) return;
          const [gone] = settings.policy.extraPatterns.splice(Number(i), 1);
          renderPatterns();
          flash(
            $("policy-status"),
            `Removed "${gone.label || gone.regex}". Press Save changes to apply it.`,
            "ok",
          );
        });

        new MutationObserver(() => {
          const host = $("shadow-root");
          if (host.shadowRoot) host.dataset.theme = document.documentElement.dataset.theme === "light" ? "white" : "secureintent";
        }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

        $("signout").addEventListener("click", () => { window.SIAdminAccess.clear(); window.Clerk.signOut(); });
        $("signout-side").addEventListener("click", () => { window.SIAdminAccess.clear(); window.Clerk.signOut(); });

        $("users-refresh").addEventListener("click", () => refreshUsers({ manual: true }));
        window.setInterval(refreshUsers, 5_000);
        window.setInterval(() => {
          if (!document.hidden && currentView === 'overview' && !$("console").classList.contains('hide')) loadMetrics();
        }, 5000);
        window.setInterval(refreshPolicyRollout, 15000);

        // Sidebar navigation. The anchors carry real hrefs so they can be
        // opened, copied and tabbed to like links; this only takes over to keep
        // the scroll position and focus sane, and to refuse a locked view.
        $("console-nav").addEventListener("click", (e) => {
          const item = e.target.closest?.(".navitem");
          if (!item) return;
          e.preventDefault();
          if (item.getAttribute("aria-disabled") === "true") return;
          showView(item.dataset.view, { focus: true });
        });
        const followRoute = () => {
          const v = viewFromHash();
          if (!v) return;
          requestedView = v;
          if (seatsLive && v !== currentView) showView(v);
        };
        window.addEventListener("hashchange", followRoute);
        window.addEventListener("popstate", followRoute);

        // Edits that never reach the server until Save. The dot in the sidebar
        // is the only thing that says so once you have walked to another view.
        ["alert-webhook", "alert-min", "pol-block", "pol-lock", "pol-replace"].forEach((id) => {
          $(id).addEventListener("input", syncDirty);
        });
      }

      // Which auth component is on screen, so Clerk's own change events don't
      // remount it under someone mid-way through typing a password.
      let authMounted = null;
      let renderedScope;
      let renderInFlight = null;
      let teamRetryTimer = null;
      let teamRetryDelay = 2000;

      function clearTeamRefreshNotice() {
        if (teamRetryTimer) clearTimeout(teamRetryTimer);
        teamRetryTimer = null;
        teamRetryDelay = 2000;
        $("team-refresh-notice").hidden = true;
      }
      function scheduleTeamRetry() {
        if (teamRetryTimer) return;
        const delay = teamRetryDelay;
        teamRetryDelay = Math.min(teamRetryDelay * 2, 30000);
        teamRetryTimer = setTimeout(() => {
          teamRetryTimer = null;
          if (window.Clerk.user) void render(true);
        }, delay);
      }

      async function render(forceRefresh = false) {
        const scope = authScope();
        if (renderInFlight) return renderInFlight;
        // Clerk emits updates while renewing tokens. A healthy dashboard does
        // not need a full roster reload on each emission; background reads keep
        // the live views fresh, and explicit retry forces a read when needed.
        if (forceRefresh !== true && currentTeam && renderedScope === scope) return;
        renderInFlight = renderInternal();
        try { await renderInFlight; }
        finally {
          renderInFlight = null;
          if (scope !== authScope()) location.reload();
        }
      }

      async function renderInternal() {
        const scope = authScope();
        if (renderedScope !== undefined && renderedScope !== scope) {
          // Discard the entire previous account's DOM and unsaved working copy.
          currentTeam = null; lastMetrics = null; settings = null; settingsLoaded = false;
          $("console").classList.add("hide"); $("shadow-nav").hidden = false;
          location.reload();
          return;
        }
        renderedScope = scope;
        const params = new URLSearchParams(location.search);
        const signedIn = !!window.Clerk.user;
        document.querySelectorAll("[data-team-intro]").forEach(el => el.hidden = signedIn);
        if (!signedIn) {
          // A new buyer arrives with no account at all, so sign-up has to work
          // from here: ?mode=signup mounts it, and the two components link to
          // each other rather than to a page that only ever shows sign-in.
          const signUpMode = params.get("mode") === "signup";
          const adminVerification = params.get('admin_verify') === '1';
          try {
            sessionStorage.setItem('si_admin_clerk_pending','1');
            if(/^#\/(overview|people|policy|alerts|shadow)$/.test(location.hash)) sessionStorage.setItem('si_admin_return_view',location.hash);
          } catch {}
          const want = signUpMode ? "signup" : "signin";
          showGate({
            title: adminVerification ? 'Verify your admin account with Clerk' : signUpMode ? "Create your account" : "Sign in to manage your team",
            sub: signUpMode
              ? "Use the business email address named in your organization invitation."
              : adminVerification ? 'Use your registered organisation email, then sign in with your password or an email code. Google and other sign-in options can\'t open the admin console.' : '',
            pitch: !adminVerification,
          });
          $("signout").hidden = true;
          if (authMounted === want) return; // already showing it — don't disturb the flow
          authMounted = want;
          $("clerk-auth").replaceChildren();
          // Come back HERE after signing in. Without these Clerk uses the
          // instance default (the landing page), which drops someone who was
          // half way through buying seats.
          // Clerk's standalone component uses the URL fragment for its own steps.
          // Restore the console view after sign-in instead of passing #/shadow to Clerk.
          const signInReturn = SI.page('team.html?admin_return=1');
          const common = {
            appearance: SI.appearance(),
            forceRedirectUrl: signInReturn,
            signInForceRedirectUrl: signInReturn,
            signUpForceRedirectUrl: signInReturn,
            afterSignInUrl: signInReturn,
            afterSignUpUrl: TEAM_PATH,
            fallbackRedirectUrl: signInReturn,
            signUpFallbackRedirectUrl: TEAM_PATH,
          };
          if (signUpMode) {
            window.Clerk.mountSignUp($("clerk-auth"), { ...common, signInUrl: TEAM_PATH });
          } else {
            window.Clerk.mountSignIn($("clerk-auth"), { ...common, signUpUrl: TEAM_SIGNUP_PATH,
              ...(adminVerification ? {withSignUp:false,transferable:false} : {}) });
          }
          return;
        }
        $("clerk-auth").replaceChildren();
        authMounted = null;
        $("signout").hidden = false;
        try {
          let requestedOrg=null;
          try { requestedOrg=sessionStorage.getItem('si_business_open_org'); } catch {}
          if (requestedOrg && /^org_[a-zA-Z0-9]+$/.test(requestedOrg)) {
            try { sessionStorage.removeItem('si_business_open_org'); } catch {}
            await window.Clerk.setActive({organization:requestedOrg});
          }
          let clerkPending=false;
          try { clerkPending=sessionStorage.getItem('si_admin_clerk_pending')==='1'; } catch {}
          const freshSession=Number(new Date(window.Clerk.session?.createdAt))>Date.now()-5*60_000;
          if(params.get('admin_return')==='1'||clerkPending||(freshSession&&!window.SIAdminAccess.headers()['X-SI-Admin-Access'])) {
            try {
              await window.SIAdminAccess.unlockWithClerk();
              let returnView='';
              try {
                returnView=sessionStorage.getItem('si_admin_return_view')||'';
                sessionStorage.removeItem('si_admin_return_view');
                sessionStorage.removeItem('si_admin_clerk_pending');
              } catch {}
              const explicitView = /^#\/(overview|people|policy|alerts|shadow)$/.test(location.hash) ? location.hash : '';
              history.replaceState(null,'',SI.page('team.html')+(explicitView || (/^#\/(overview|people|policy|alerts|shadow)$/.test(returnView)?returnView:'') || '#/overview'));
            } catch(error) {
              if(['forbidden','business_promo_required','business_organisation_required'].includes(error.code)) {
                try { sessionStorage.removeItem('si_admin_clerk_pending'); } catch {}
                history.replaceState(null,'',SI.page('team.html')+(location.hash||'#/overview'));
              } else {
                showAdminClerkGate({automatic:false,reason:error.message,retry:error.code==='network'});
                return;
              }
            }
          }
          const welcome = params.get("welcome") === "1";
          // `claim` is ours, set on the success URL we hand Paddle. `_ptxn` is
          // Paddle's: it sends people to this page to PAY, so an unclaimed one
          // means a checkout that was never finished — reopen the form.
          const claimId = params.get("claim");
          const resumeId = params.get("_ptxn");
          let claim = null;

          if (welcome && claimId) {
            $("gate-title").textContent = "Activating your seats…";
            $("gate-sub").textContent = "";
            claim = await api("/v1/team/reconcile", {
              method: "POST",
              body: JSON.stringify({ transactionId: claimId }),
            }).catch((e) => {
              console.error("[team] claim failed", e);
              return null;
            });
            history.replaceState(null, "", SI.page("team.html"));
          } else if (resumeId) {
            if (openCheckout(resumeId, null)) history.replaceState(null, "", SI.page("team.html"));
          }

          await loadTeam({ reconcile: welcome && !claimId });
          // Say which case this is rather than leaving someone guessing.
          if (claim && !claim.seats) explainPending(claim.transactionStatus);
        } catch (e) {
          if(e.code==='admin_reauthentication_required')return;
          if (e.name === 'AbortError') return;
          if ([401, 403].includes(e.status)) {
            clearTeamRefreshNotice();
            currentTeam = null;
            showGate({title: e.status === 401 ? 'Your session expired' : 'Team access unavailable', sub: explain(e)});
            return;
          }
          if (currentTeam && !$("console").classList.contains("hide")) {
            $("team-refresh-notice").hidden = false;
          } else {
            showGate({title: 'Connection interrupted', sub: 'We could not refresh your team right now. Retrying automatically.'});
            $("gate-retry").hidden = false;
          }
          scheduleTeamRetry();
        }
      }

      function initPaddle() {
        if (!window.Paddle || !CFG.paddleToken) {
          console.warn("[team] Paddle.js unavailable — checkout will fall back to a redirect.");
          return;
        }
        if (CFG.paddleEnv === "sandbox") window.Paddle.Environment.set("sandbox");
        window.Paddle.Initialize({
          token: CFG.paddleToken,
          eventCallback: (e) => {
            // Claim the moment payment completes; the redirect is the backup.
            if (e?.name === "checkout.completed") {
              const id = e?.data?.transaction_id;
              if (id) {
                api("/v1/team/reconcile", {
                  method: "POST",
                  body: JSON.stringify({ transactionId: id }),
                })
                  .catch(() => {})
                  .then(() => loadTeam());
              }
            }
          },
        });
      }

      async function start() {
        await window.Clerk.load({ appearance: SI.appearance() });
        initPaddle();
        wire();
        $("gate-retry").addEventListener('click', () => void render(true));
        $("team-refresh-now").addEventListener('click', () => void render(true));
        window.addEventListener('si-team-auth-required', () => { showGate({title:'Your session expired', sub:'Sign in again to continue.'}); render(true); });
        window.Clerk.addListener(render);
        render();
      }


      await start();

  } catch (error) {
    SI.showError(document.getElementById("gate-title"), error);
  }
})();
