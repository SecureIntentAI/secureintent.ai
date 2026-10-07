/* Ported from main commit 3612483; API contracts and DOM IDs retained. */
(async () => {
  const SI = window.SI;
  try {
    await SI.ready({ auth: true, billing: true });
const CFG = SI.config;

      const PLAN_LABEL = {
        developer: "Free",
        developer_pro: "Developer Pro",
        business_pro: "Business Pro",
      };

      // --- Creator attribution ---------------------------------------------
      // The landing page stores the first-touch creator in a cookie on
      // .secureintent.ai; read it here (and capture it directly, in case a creator
      // link points straight at this page) and replay it to the API once the user
      // is signed in. That POST is what joins a creator to a real account — and
      // therefore to any Paddle subscription that follows. The Chrome Web Store
      // drops query params, so this is the only end-to-end attribution we get.
      const ATTR = (function () {
        const KEY = "si_creator", MAX_AGE = 7776000; // 90d
        const readCookie = (name) => {
          const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
          try { return m ? decodeURIComponent(m[1]) : null; }
          catch { return null; }
        };
        const get = (name) => {
          try { return localStorage.getItem(name) || readCookie(name); }
          catch (e) { return readCookie(name); }
        };
        const set = (name, value) => {
          try { localStorage.setItem(name, value); } catch (e) {}
          // Domain attribute only on the real domain; a local copy on localhost
          // writes a host-only cookie so the same flow can be tested end to end.
          const scoped = /(^|\.)secureintent\.ai$/.test(location.hostname)
            ? ";domain=.secureintent.ai" : "";
          document.cookie = name + "=" + encodeURIComponent(value) + scoped +
            ";path=/;max-age=" + MAX_AGE + ";SameSite=Lax";
        };
        const p = new URLSearchParams(location.search);
        const creator = (p.get("ref") || p.get("utm_source") || "").trim();
        if (creator && !get(KEY)) {
          set(KEY, creator);
          set(KEY + "_medium", (p.get("utm_medium") || "creator").trim());
          set(KEY + "_campaign", (p.get("utm_campaign") || "").trim());
        }
        return {
          creator: get(KEY) || null,
          medium: get(KEY + "_medium") || null,
          campaign: get(KEY + "_campaign") || null,
          markSent() { try { localStorage.setItem(KEY + "_sent", "1"); } catch (e) {} },
          get sent() { try { return localStorage.getItem(KEY + "_sent") === "1"; } catch (e) { return false; } },
        };
      })();

      // Fire-and-forget: the server keeps the first creator it ever saw for this
      // user, so a duplicate call is harmless. The local flag just avoids a
      // pointless request on every page load.
      async function sendAttribution(token) {
        if (!ATTR.creator || ATTR.sent) return;
        try {
          const res = await SI.fetch(`${CFG.apiBase}/v1/attribution`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
              creator: ATTR.creator,
              medium: ATTR.medium,
              campaign: ATTR.campaign,
            }),
          });
          if (res.ok) ATTR.markSent();
        } catch (e) {
          console.error("[account] attribution failed", e);
        }
      }

      const $ = (id) => document.getElementById(id);
      const invitationParams = new URLSearchParams(location.search);
      const inviteStorageKey = "si:business-member-invite";
      const urlInvite = new URLSearchParams(location.hash.slice(1)).get("invite") || "";
      if (/^[a-f0-9]{64}$/.test(urlInvite)) {
        sessionStorage.setItem(inviteStorageKey, urlInvite);
        history.replaceState(null, "", location.pathname + location.search);
      }
      let inviteToken = sessionStorage.getItem(inviteStorageKey) || "";
      if (!/^[a-f0-9]{64}$/.test(inviteToken)) {
        inviteToken = "";
        sessionStorage.removeItem(inviteStorageKey);
      }
      let fromInvitation = invitationParams.get("joined") === "1" || !!inviteToken;
      let invitedOrg = /^org_[A-Za-z0-9_]+$/.test(invitationParams.get("org") || "")
        ? invitationParams.get("org") : null;
      let inviteError = "";
      let selectedInviteOrg = "";
      // An invitation found for this verified email when the link token was
      // lost (sign-up finished in another tab or device). Offered, never auto-joined.
      let pendingOffer = null;
      const pendingChecked = new Set();
      const INVITE_ERRORS = {
        invitation_email_mismatch: "Sign in with the exact work email named in your invitation.",
        invitation_unavailable: "This invitation has expired or was revoked. Ask your organisation administrator for a new one.",
        unauthenticated: "Your sign-in could not be confirmed yet. Refresh this page and retry.",
        authentication_unavailable: "Clerk could not confirm your session just now. Refresh this page and retry.",
        already_member: "This account already belongs to a Business workspace. Contact your administrator.",
        team_busy: "Your organisation is busy right now. Wait a moment and try again.",
      };
      const inviteErrorText = (code) => INVITE_ERRORS[code] ||
        "We couldn't confirm the invitation. Retry the account check or contact your administrator.";
      let policyNoticeBusy = false;
      let policyNoticeKey = "";

      async function loadPolicyNotice() {
        if (policyNoticeBusy || !window.Clerk.user || !window.Clerk.session) return;
        policyNoticeBusy = true;
        const userId = window.Clerk.user.id;
        try {
          const token = await window.Clerk.session.getToken();
          if (!token) return;
          const response = await SI.fetch(`${CFG.apiBase}/v1/business/connection/policy-status`, {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          });
          if (!response.ok) {
            if (response.status === 403 || response.status === 401) $("policy-update").hidden = true;
            return;
          }
          const policy = await response.json();
          if (window.Clerk.user?.id !== userId || !policy.orgId || !policy.version) {
            $("policy-update").hidden = true;
            return;
          }
          const key = `si:policy-notice:${userId}:${policy.orgId}:${policy.version}`;
          policyNoticeKey = key;
          if (localStorage.getItem(key) === "seen" && policy.status === "applied") {
            $("policy-update").hidden = true;
            return;
          }
          const controls = policy.controls || {};
          const parts = [controls.blockInsteadOfWarn ? "Sensitive pastes are blocked" : "Sensitive pastes show a warning",
            controls.requireSessionLock ? "Session Lock is required" : "Session Lock is optional"];
          if (controls.blockedSiteCount) {
            const sites = Array.isArray(controls.blockedSites) ? controls.blockedSites.slice(0, 3).join(", ") : "";
            parts.push(`${controls.blockedSiteCount} destination${controls.blockedSiteCount === 1 ? " is" : "s are"} restricted${sites ? `, including ${sites}` : ""}`);
          }
          if (controls.aiServiceRuleCount) parts.push(`${controls.aiServiceRuleCount} AI tool${controls.aiServiceRuleCount === 1 ? "" : "s"} have paste rules`);
          $("policy-update-title").textContent = `${policy.orgName || "Your organisation"} updated its protection policy`;
          const when = policy.updatedAt && !Number.isNaN(Date.parse(policy.updatedAt))
            ? ` on ${new Date(policy.updatedAt).toLocaleString()}` : "";
          const state = policy.status === "applied" ? "Your connected extensions reported the current revision."
            : policy.status === "offline" ? "Your extensions have not checked in recently; they will update when connected."
            : policy.status === "not_connected" ? "Sign in to the extension with this account to apply the policy."
            : "Your extension has not confirmed this revision yet.";
          $("policy-update-body").textContent = `Revision ${policy.version}${when}. ${parts.length ? `Current controls: ${parts.join("; ")}. ` : ""}${state}`;
          $("policy-update-dismiss").hidden = policy.status !== "applied";
          $("policy-update").hidden = false;
        } catch {
          // A failed status read must never be presented as an applied policy.
        } finally { policyNoticeBusy = false; }
      }

      function renderInvitation(entitlement, unavailable = false) {
        if (!fromInvitation) return;
        const banner = $("joined");
        const install = $("joined-install");
        const accept = $("joined-accept");
        banner.hidden = false;
        install.hidden = true;
        accept.hidden = true;
        if (pendingOffer) {
          $("joined-title").textContent = `You're invited to join ${pendingOffer.companyName}`;
          $("joined-sub").textContent = inviteError ||
            "Join to get Business protection from your organisation. Its administrator will see that you joined and whether your extension is connected.";
          accept.textContent = `Join ${pendingOffer.companyName}`;
          accept.hidden = false;
          return;
        }
        if (unavailable) {
          $("joined-title").textContent = "We couldn't confirm your invitation yet";
          $("joined-sub").textContent = "Retry your account check before installing the extension.";
          return;
        }
        if (inviteError) {
          $("joined-title").textContent = "Invitation could not be activated";
          $("joined-sub").textContent = inviteError;
          return;
        }
        const org = entitlement?.source === "org_seat" ? entitlement.org : null;
        if (!org || (invitedOrg && org.id !== invitedOrg) || ["org:admin", "admin"].includes(org.role)) {
          $("joined-title").textContent = "Invitation not active for this account";
          $("joined-sub").textContent = "Sign in with the exact email that was invited, then accept the invitation. If you just joined, retry the account check.";
          return;
        }
        $("joined-title").textContent = `You're covered by ${org.name || "your organisation"}`;
        $("joined-sub").textContent = CFG.pilot
          ? "Load the pilot extension supplied by SecureIntent, then sign in with this same account."
          : "Install the extension and sign in with this same account to start protection.";
        if (!CFG.pilot) {
          install.href = window.SI_INSTALL_URL || install.href;
          install.hidden = false;
        }
      }

      // Remember whether the "What's included" section is expanded (default: shown).
      (function setupFeatureToggle() {
        const el = $("features");
        if (!el) return;
        el.open = localStorage.getItem("si_features_open") !== "closed";
        el.addEventListener("toggle", () => {
          localStorage.setItem("si_features_open", el.open ? "open" : "closed");
        });
      })();

      // Feature matrix (mirrors the extension popup). Everything listed is live:
      // the Pro toolkit is locked on Free and active on Pro, and the two team
      // features are locked below Business Pro and active on it.
      const CHECK_SVG =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.4 12.2l2.4 2.4 4.8-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const LOCK_SVG =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" stroke-width="1.6"/></svg>';
      const HELP_SVG =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M9.6 9.4a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 1.9-2.2 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor"/></svg>';

      const SOON_SVG =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      const ICON = { locked: LOCK_SVG, soon: SOON_SVG };

      const NOTES = {
        detection: "Scans every paste on-device and warns before secrets reach the page.",
        anonymise: "Swap detected secrets for masked tokens so you can paste without leaking them.",
        rehydrate: "Restore the original secrets from masked tokens later in the same session.",
        ghost: "Strip secrets, IPs and emails from large logs before you paste them.",
        session_lock: "PIN-lock high-risk cloud consoles after inactivity or tab-away.",
        team_policy: "Push shared detection rules and settings across your whole team.",
        team_alerts: "Coming with the SecureIntent desktop app: notify your security team when a teammate pastes a secret.",
      };

      function featureRows(plan) {
        const isFree = plan === "developer";
        const anon = isFree
          ? { key: "anonymise", label: "Anonymise & Paste", state: "usage", detail: "—" }
          : { key: "anonymise", label: "Anonymise & Paste", state: "active", detail: "Unlimited" };
        const toolkit = (key, label) =>
          isFree
            ? { key, label, state: "locked", detail: "Pro" }
            : { key, label, state: "active", detail: "Active" };
        // Team Policy Sync is shipped, so a Business Pro account has it now. Lower
        // tiers see it locked, the same way the Pro toolkit reads on Free.
        // Security-Team Alerts arrive with the desktop app: "Coming soon" for all.
        const team = (key, label) =>
          plan === "business_pro"
            ? { key, label, state: "active", detail: "Active" }
            : { key, label, state: "locked", detail: "Business Pro" };
        return [
          { key: "detection", label: "Detection & warnings", state: "active", detail: "Active" },
          anon,
          toolkit("rehydrate", "Rehydrate vault"),
          toolkit("ghost", "Ghost Log Sanitiser"),
          toolkit("session_lock", "Session Lock"),
          team("team_policy", "Team Policy Sync"),
          { key: "team_alerts", label: "Security-Team Alerts", state: "soon", detail: "Coming soon" },
        ];
      }

      function renderFeatures(plan) {
        $("feature-list").innerHTML = featureRows(plan)
          .map((r) => {
            const note = NOTES[r.key] ?? "";
            return (
              `<li class="feat feat--${r.state}" data-key="${r.key}">` +
              `<span class="feat-ic">${ICON[r.state] ?? CHECK_SVG}</span>` +
              `<span class="feat-label">${r.label}</span>` +
              `<button type="button" class="feat-help" aria-label="${note}">${HELP_SVG}<span class="feat-tip" role="tooltip">${note}</span></button>` +
              `<span class="feat-state">${r.detail}</span></li>`
            );
          })
          .join("");
      }

      function setAnonDetail(text) {
        const el = document.querySelector('#feature-list .feat[data-key="anonymise"] .feat-state');
        if (el) el.textContent = text;
      }

      /**
       * The team block. Three states, because all three need a way forward:
       * an admin manages it, a member is told where their Pro comes from, and
       * someone with no team gets the route to buying seats.
       */
      const fmtDate = (iso) => {
        if (!iso) return null;
        try {
          return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } catch (e) {
          return null;
        }
      };

      /**
       * Someone whose employer gave them a seat may still be paying for their own
       * plan. Only they can cancel it — their admin can't, and shouldn't even be
       * told about it — so the offer belongs here.
       */
      function renderOverlap(personal, source) {
        const box = $("overlap");
        box.classList.remove("overlap--error"); // clear a previous failure
        if (!personal || source !== "org_seat") {
          box.hidden = true;
          return;
        }
        box.hidden = false;
        const ends = fmtDate(personal.currentPeriodEnd);
        if (personal.cancelScheduled) {
          $("overlap-title").textContent = "Your personal subscription is set to end";
          $("overlap-body").textContent = ends
            ? `It stays active until ${ends}, then your team seat covers you. Nothing else to do.`
            : "It stays active until the end of the period you've paid for, then your team seat covers you.";
          $("overlap-cancel").hidden = true;
          return;
        }
        $("overlap-cancel").hidden = false;
        $("overlap-title").textContent = "Your team already covers you";
        $("overlap-body").textContent = ends
          ? `You're also paying for Developer Pro yourself. Cancel it and it keeps working until ${ends}, then your team seat takes over.`
          : "You're also paying for Developer Pro yourself. Cancel it and you keep it until the period you've paid for ends. Your team seat takes over from there.";
      }

      async function cancelPersonal() {
        const btn = $("overlap-cancel");
        btn.disabled = true;
        btn.textContent = "Cancelling…";
        try {
          const token = await window.Clerk.session.getToken({ template: CFG.jwtTemplate });
          const res = await SI.fetch(`${CFG.apiBase}/v1/billing/cancel`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { endsAt } = await res.json();
          renderOverlap({ cancelScheduled: true, currentPeriodEnd: endsAt }, "org_seat");
        } catch (e) {
          console.error("[account] cancel failed", e);
          // Say it where they're looking, and colour it as the failure it is —
          // a console message is not a user-visible answer.
          $("overlap-title").textContent = "Couldn't cancel your subscription";
          $("overlap-body").textContent =
            "Couldn't cancel just now. Try again, or email billing@secureintent.ai.";
          $("overlap").classList.add("overlap--error");
        } finally {
          btn.disabled = false;
          btn.textContent = "Cancel my subscription";
        }
      }

      function renderTeam(entitlement) {
        const card = $("team-card");
        const cta = $("team-cta");
        const retry = $("team-retry");
        // /v1/team is an admin console endpoint and requires fresh Clerk
        // reauthentication. The signed entitlement already identifies the
        // caller's active organization and role without exposing the roster.
        const team = entitlement?.source === "org_seat" ? entitlement.org : null;
        const isAdmin = team && ["org:admin", "admin"].includes(team.role);
        $("nav-team").hidden = !isAdmin;
        card.hidden = false;
        retry.hidden = true;
        if (!team) {
          $("team-name").textContent = "Protecting a team?";
          $("team-sub").textContent =
            "One subscription, a seat per person, and a view of what's being stopped.";
          cta.textContent = "Buy seats";
          cta.classList.remove("hide");
          return;
        }
        $("team-name").textContent = team.name || "Your team";
        const n = Number(team.seats);
        const seats = n > 0 ? `${n.toLocaleString()} ${n === 1 ? "seat" : "seats"} · ` : "";
        $("team-sub").textContent = isAdmin
          ? `${seats}Business Pro · you manage this organisation`
          : "Developer Pro · provided by your organization";
        cta.textContent = "Manage team";
        cta.classList.toggle("hide", !isAdmin);
      }

      function showTeamUnavailable() {
        $("team-card").hidden = false;
        $("team-name").textContent = "Couldn't load your team";
        $("team-sub").textContent = "We couldn't confirm your account right now. Please retry.";
        $("team-cta").classList.add("hide");
        $("team-retry").hidden = false;
      }

      /**
       * The one message slot for billing trouble. `retry` is for states the user
       * can re-run (the plan fetch); a failed action just gets told.
       */
      function showPlanNotice(title, body, opts) {
        $("plan-notice-title").textContent = title;
        $("plan-notice-body").textContent = body;
        $("plan-retry").hidden = opts?.retry !== true;
        $("plan-notice").hidden = false;
      }

      const hidePlanNotice = () => {
        $("plan-notice").hidden = true;
      };

      /**
       * We asked and didn't get an answer. Unknown is not Free: render nothing
       * that could be mistaken for a plan, least of all an Upgrade button in
       * front of someone who is already paying.
       */
      function showPlanUnavailable() {
        $("plan-name").textContent = "Unavailable";
        $("plan-name").classList.remove("pro");
        $("plan-sub").hidden = true;
        $("upgrade").hidden = true;
        $("manage").hidden = true;
        $("lifetime-badge").hidden = true;
        $("overlap").hidden = true;
        // A locked-looking checklist is a downgrade too — show none of it.
        $("features").hidden = true;
        $("feature-list").replaceChildren();
        showPlanNotice(
          "Couldn't load your plan",
          "We couldn't confirm your account right now. Your access has not been changed; retry the check.",
          { retry: true },
        );
      }

      let planInFlight = false;
      let planRetryTimer = null;
      let planRetryDelay = 2000;
      let lastGoodUserId = null;
      function schedulePlanRetry() {
        if (planRetryTimer) return;
        const delay = planRetryDelay;
        planRetryDelay = Math.min(planRetryDelay * 2, 30000);
        planRetryTimer = setTimeout(() => {
          planRetryTimer = null;
          if (window.Clerk.user) void loadPlan();
        }, delay);
      }
      // Best effort: a failed lookup simply shows the normal account page.
      async function findPendingInvitation() {
        try {
          const signInToken = await window.Clerk.session.getToken();
          if (!signInToken) return;
          const res = await SI.fetch(`${CFG.apiBase}/v1/business-member/pending`, {
            headers: { Authorization: `Bearer ${signInToken}` }, cache: "no-store",
          });
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          const offer = Array.isArray(data.invitations) ? data.invitations[0] : null;
          if (offer && /^[a-f0-9-]{36}$/.test(offer.invitationId) && typeof offer.companyName === "string") {
            pendingOffer = { invitationId: offer.invitationId, orgId: offer.orgId, companyName: offer.companyName };
            fromInvitation = true;
          }
        } catch {
          // Never block the account page on this check.
        }
      }

      async function acceptPendingInvitation() {
        if (!pendingOffer) return;
        const button = $("joined-accept");
        button.disabled = true;
        inviteError = "";
        try {
          const signInToken = await window.Clerk.session.getToken();
          if (!signInToken) throw new Error("Clerk session token unavailable");
          const res = await SI.fetch(`${CFG.apiBase}/v1/business-member/accept`, {
            method: "POST", headers: { Authorization: `Bearer ${signInToken}`, "content-type": "application/json" },
            body: JSON.stringify({ invitationId: pendingOffer.invitationId }), cache: "no-store",
          });
          const outcome = await res.json().catch(() => ({}));
          if (res.ok) {
            invitedOrg = outcome.orgId || pendingOffer.orgId;
            pendingOffer = null;
            await loadPlan();
            return;
          }
          if (outcome.error === "invitation_unavailable" || outcome.error === "already_member") pendingOffer = null;
          inviteError = inviteErrorText(outcome.error);
        } catch {
          inviteError = "We couldn't reach SecureIntent to join just now. Check your connection and try again.";
        } finally {
          button.disabled = false;
        }
        renderInvitation(null);
      }
      $("joined-accept").addEventListener("click", acceptPendingInvitation);

      async function loadPlan() {
        if (planInFlight) return;
        planInFlight = true;
        const userId = window.Clerk.user?.id;
        const retry = $("plan-retry");
        retry.disabled = true;
        if (planRetryTimer) clearTimeout(planRetryTimer);
        planRetryTimer = null;
        try {
          if (inviteToken) {
            // Acceptance needs Clerk's session ID. The default session token
            // carries it; the custom entitlement template may omit it.
            const signInToken = await window.Clerk.session.getToken();
            if (!signInToken) throw new Error("Clerk session token unavailable");
            const accepted = await SI.fetch(`${CFG.apiBase}/v1/business-member/accept`, {
              method: "POST", headers: { Authorization: `Bearer ${signInToken}`, "content-type": "application/json" },
              body: JSON.stringify({ inviteToken }), cache: "no-store",
            });
            const outcome = await accepted.json().catch(() => ({}));
            if (accepted.ok) {
              invitedOrg = outcome.orgId;
              // Joined: nothing left to look up. A failed token still falls
              // through to the email lookup, which finds a resent invitation.
              if (userId) pendingChecked.add(userId);
              inviteToken = "";
              sessionStorage.removeItem(inviteStorageKey);
              inviteError = "";
              history.replaceState(null, "", location.pathname + location.search);
            } else {
              console.warn("[account] invitation activation failed", {
                status: accepted.status,
                error: typeof outcome.error === "string" ? outcome.error : "unknown",
              });
              if (outcome.error === "invitation_unavailable") {
                inviteToken = "";
                sessionStorage.removeItem(inviteStorageKey);
              }
              inviteError = inviteErrorText(outcome.error);
            }
          }
          if (!inviteToken && userId && !pendingChecked.has(userId)) {
            pendingChecked.add(userId);
            await findPendingInvitation();
          }
          // A recipient with several organisations may not have the invited
          // one selected in Clerk. Switching is safe: Clerk checks membership.
          if (fromInvitation && invitedOrg && window.Clerk.organization?.id !== invitedOrg &&
              !invitedOrg.startsWith("org_si_") &&
              selectedInviteOrg !== `${userId}:${invitedOrg}`) {
            selectedInviteOrg = `${userId}:${invitedOrg}`;
            await window.Clerk.setActive({ organization: invitedOrg }).catch(() => {});
          }
          const token = await window.Clerk.session.getToken({ template: CFG.jwtTemplate });
          sendAttribution(token); // fire-and-forget; never blocks the plan render
          const res = await SI.fetch(`${CFG.apiBase}/v1/entitlement`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          // A non-200 says nothing about this account. Falling through to the
          // default plan would quietly show a paying customer "Free".
          if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
          const data = await res.json();
          if (!userId || window.Clerk.user?.id !== userId) return;
          hidePlanNotice();
          $("features").hidden = false;
          renderOverlap(data?.personalSubscription, data?.entitlement?.source);
          const plan = data?.entitlement?.plan ?? "developer";
          const source = data?.entitlement?.source;
          const status = data?.entitlement?.status;
          const isFree = plan === "developer";
          const isLifetime = source === "lifetime";
          // A seat is billed to the company, not to this person: there is no
          // personal subscription behind it, so neither upgrading nor managing
          // billing belongs here. The team console owns that.
          const isTeamSeat = source === "org_seat";
          // A work-domain grant is free and has no Paddle subscription behind it,
          // so /v1/billing/portal has nothing to open. Offering "Manage
          // subscription" here is a button that can only 404.
          const isBusinessEmail = source === "business_email";
          const displayPlan = isTeamSeat && !["org:admin", "admin"].includes(data?.entitlement?.org?.role)
            ? "developer_pro" : plan;
          $("plan-name").textContent = PLAN_LABEL[displayPlan] ?? displayPlan;
          $("plan-name").classList.toggle("pro", !isFree);
          // Lifetime users have nothing to manage; paid users do; free users upgrade.
          $("upgrade").hidden = !isFree || isTeamSeat;
          $("manage").hidden = isFree || isLifetime || isTeamSeat || isBusinessEmail;
          $("lifetime-badge").hidden = !isLifetime;
          if (isTeamSeat) {
            const org = data?.entitlement?.org;
            $("plan-sub").textContent = ["org:admin", "admin"].includes(org?.role)
              ? `Administrator of ${org?.name || "your organisation"}`
              : "Provided by your team";
            $("plan-sub").hidden = false;
          } else if (isBusinessEmail) {
            const domain = data?.entitlement?.businessDomain;
            $("plan-sub").textContent = domain
              ? `Included with ${domain} · nothing to bill`
              : "Included with your work email · nothing to bill";
            $("plan-sub").hidden = false;
          } else if (isLifetime) {
            $("plan-sub").textContent = "Access: Lifetime";
            $("plan-sub").hidden = false;
          } else if (!isFree && status) {
            $("plan-sub").textContent = `Subscription: ${status}`;
            $("plan-sub").hidden = false;
          } else {
            $("plan-sub").hidden = true;
          }
          // Render the full feature matrix; free plans then fill in the live
          // Anonymise & Paste allowance from the usage endpoint.
          // The member-facing plan name is Developer Pro, while their signed
          // organization seat also enables policy sync and team alerts.
          renderFeatures(plan);
          if (isFree) loadUsage(token);
          renderTeam(data?.entitlement);
          renderInvitation(data?.entitlement);
          if (data?.entitlement?.source === "org_seat") void loadPolicyNotice();
          else $("policy-update").hidden = true;
          lastGoodUserId = userId;
          planRetryDelay = 2000;
        } catch (e) {
          console.error("[account] loadPlan failed", e);
          if (window.Clerk.user?.id !== userId) return;
          if (lastGoodUserId === userId && ![401, 403].includes(e.status)) {
            showPlanNotice("Connection interrupted", "Showing the last confirmed account details. Retrying automatically.", { retry: true });
          } else {
            showPlanUnavailable();
            showTeamUnavailable();
            renderInvitation(null, true);
          }
          if (![401, 403].includes(e.status)) schedulePlanRetry();
        } finally {
          retry.disabled = false;
          planInFlight = false;
          if (window.Clerk.user && window.Clerk.user.id !== userId) queueMicrotask(loadPlan);
        }
      }

      async function loadUsage(token) {
        try {
          const res = await SI.fetch(`${CFG.apiBase}/v1/usage`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (!res.ok) return;
          const u = await res.json();
          setAnonDetail(u.unlimited ? "Unlimited" : `${u.remaining} / ${u.limit} left`);
        } catch (e) {
          console.error("[account] loadUsage failed", e);
        }
      }

      async function openPortal() {
        const btn = $("manage");
        btn.disabled = true;
        try {
          const token = await window.Clerk.session.getToken({ template: CFG.jwtTemplate });
          const res = await SI.fetch(`${CFG.apiBase}/v1/billing/portal`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { url } = await res.json();
          if (!url) throw new Error("no portal url");
          hidePlanNotice();
          SI.openBilling(url);
        } catch (e) {
          console.error("[account] openPortal failed", e);
          // A button that does nothing at all reads as a broken product. Say it.
          showPlanNotice(
            "Couldn't open billing",
            "We couldn't reach the billing portal just now. Try again, or email billing@secureintent.ai.",
          );
        } finally {
          btn.disabled = false;
        }
      }

      function openCheckout() {
        if (!window.Paddle) { showPlanNotice("Checkout unavailable", "Please refresh and try again, or contact billing@secureintent.ai."); return; }
        const user = window.Clerk.user;
        if (!user) return;
        const email = user.primaryEmailAddress?.emailAddress;
        window.Paddle.Checkout.open({
          items: [{ priceId: CFG.priceId, quantity: 1 }],
          customData: { clerk_user_id: user.id },
          customer: email ? { email } : undefined,
          settings: { displayMode: "overlay", theme: document.documentElement.dataset.theme || "dark", allowLogout: false },
        });
      }

      function resumePendingTxn() {
        const ptxn = new URLSearchParams(location.search).get("_ptxn");
        if (ptxn && window.Paddle) window.Paddle.Checkout.open({ transactionId: ptxn });
      }

      // ---------------------------------------------------------------------
      // One-code team join (no Clerk screens). Invitation link -> name ->
      // Continue with Google, or one emailed code -> signed in with a one-time
      // ticket from our API, the seat already accepted. Owning the invited inbox
      // is what the code proves; the backend re-checks everything.
      const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      const join = { step: "loading", company: "", email: "", error: "", firstName: "", lastName: "", password: "", password2: "", busy: false, resendAt: 0, timer: null };
      const JOIN_ERRORS = {
        invitation_expired: "This invitation has expired. Ask your administrator to send a new one.",
        invitation_unavailable: "This invitation is no longer valid. Ask your administrator to send a new one.",
        invitation_already_accepted: "You've already joined with this invitation. Sign in to continue.",
        name_required: "Enter your first name.",
        password_short: "Choose a password of at least 8 characters.",
        password_mismatch: "The passwords don't match.",
        too_soon: "A code was just sent. You can ask for another in a moment.",
        too_many: "Too many codes were sent. Wait an hour, then try again.",
        invalid_code: "That code isn't right. Check the email and try again.",
        too_many_attempts: "Too many wrong codes. Ask for a new code.",
        code_expired: "That code has expired or was already used. Ask for a new code.",
        send_failed: "We couldn't send the email just now. Try again in a minute.",
        recipient_denied: "This address can't receive codes in this environment.",
        already_member: "This email already belongs to another SecureIntent team. Contact your administrator.",
        team_busy: "Your team is busy right now. Wait a moment and try again.",
        google_unavailable: "Google sign-in isn't available right now. Use Email me a code instead.",
      };
      const joinError = (code) => JOIN_ERRORS[code] || "Something went wrong. Try again in a moment.";
      async function joinApi(step, extra = {}) {
        const res = await SI.fetch(`${CFG.apiBase}/v1/business-member/join/${step}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inviteToken, ...extra }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || "unavailable"), { code: data.error, retryAfter: data.retryAfter });
        return data;
      }
      function joinResendLeft() {
        return Math.max(0, Math.ceil((join.resendAt - Date.now()) / 1000));
      }
      function renderJoin() {
        const box = $("clerk-auth");
        box.classList.add("is-join");
        const err = join.error ? `<p class="join-error" role="alert">${esc(join.error)}</p>` : "";
        const signInLink = `<p class="utility-note join-alt">Already have a SecureIntent account? <a href="account.html?mode=signin" data-join-signin>Sign in</a></p>`;
        if (join.step === "loading") {
          $("auth-title").textContent = "Your invitation";
          $("auth-sub").textContent = "Checking your invitation…";
          box.innerHTML = "";
          return;
        }
        if (join.step === "blocked") {
          $("auth-title").textContent = "Your invitation";
          $("auth-sub").textContent = "";
          box.innerHTML = `${err}<a class="button join-wide" href="account.html?mode=signin" data-join-signin>Sign in</a>`;
          return;
        }
        $("auth-title").textContent = `Join ${join.company}`;
        if (join.step === "details") {
          $("auth-sub").textContent = "You've been invited to SecureIntent Business. Confirm your details to activate your seat.";
          box.innerHTML = `<form class="utility-form join-form" data-join-form="details" novalidate>
            <label for="join-email">Work email</label>
            <input id="join-email" type="email" value="${esc(join.email)}" readonly aria-readonly="true">
            <div class="join-names">
              <div><label for="join-first">First name</label><input id="join-first" autocomplete="given-name" maxlength="60" required value="${esc(join.firstName)}"></div>
              <div><label for="join-last">Last name</label><input id="join-last" autocomplete="family-name" maxlength="60" value="${esc(join.lastName)}"></div>
            </div>
            <label for="join-password">Password</label>
            <div class="join-password">
              <input id="join-password" type="password" autocomplete="new-password" minlength="8" maxlength="72" placeholder="At least 8 characters">
              <button class="text-action" type="button" data-join-reveal aria-controls="join-password" aria-pressed="false">Show</button>
            </div>
            <label for="join-password2">Confirm password</label>
            <div class="join-password">
              <input id="join-password2" type="password" autocomplete="new-password" maxlength="72">
              <button class="text-action" type="button" data-join-reveal aria-controls="join-password2" aria-pressed="false">Show</button>
            </div>
            ${err}
            <button class="button join-wide" type="submit" ${join.busy ? "disabled" : ""}>${join.busy ? "Sending…" : "Email me a code →"}</button>
            <div class="join-or" aria-hidden="true"><span>or</span></div>
            <button class="button secondary join-wide join-google" type="button" data-join-google ${join.busy ? "disabled" : ""}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </button>
            <p class="utility-note">Google works when your Google account is ${esc(join.email)}. Next time, sign in with this email and password, or with Google.</p>
          </form>${signInLink}`;
          if ($("join-password")) $("join-password").value = join.password;
          if ($("join-password2")) $("join-password2").value = join.password2;
          return;
        }
        if (join.step === "code") {
          const left = joinResendLeft();
          $("auth-sub").textContent = `We emailed a 6-digit code to ${join.email}. Enter it to activate your seat.`;
          box.innerHTML = `<form class="utility-form join-form" data-join-form="code" novalidate>
            <label for="join-code">Verification code</label>
            <input id="join-code" class="join-code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" placeholder="••••••" required>
            ${err}
            <button class="button join-wide" type="submit" ${join.busy ? "disabled" : ""}>${join.busy ? "Checking…" : "Verify and join"}</button>
            <div class="join-actions">
              <button class="text-action" type="button" data-join-resend ${left || join.busy ? "disabled" : ""}>${left ? `Resend code in ${left}s` : "Resend code"}</button>
              <button class="text-action" type="button" data-join-back>Change details</button>
            </div>
          </form>`;
          return;
        }
        if (join.step === "signing-in") {
          $("auth-sub").textContent = "Code confirmed. Signing you in and activating your seat…";
          box.innerHTML = `${err}`;
        }
      }
      function joinTick() {
        clearInterval(join.timer);
        join.timer = setInterval(() => {
          if (join.step !== "code") return clearInterval(join.timer);
          const btn = document.querySelector("[data-join-resend]");
          if (!btn) return;
          const left = joinResendLeft();
          btn.textContent = left ? `Resend code in ${left}s` : "Resend code";
          btn.disabled = !!left || join.busy;
          if (!left) clearInterval(join.timer);
        }, 1000);
      }
      async function startJoin() {
        mounted = "join";
        join.step = "loading";
        renderJoin();
        try {
          const info = await joinApi("inspect");
          join.company = info.companyName || "your team";
          join.email = info.email || "";
          join.step = "details";
          join.error = "";
        } catch (e) {
          join.step = "blocked";
          join.error = joinError(e.code);
          if (e.code !== "invitation_already_accepted") {
            // A dead link should not keep steering this browser into the join card.
            sessionStorage.removeItem(inviteStorageKey);
          }
        }
        renderJoin();
      }
      async function sendJoinCode() {
        join.firstName = ($("join-first")?.value ?? join.firstName).trim();
        join.lastName = ($("join-last")?.value ?? join.lastName).trim();
        if ($("join-password")) join.password = $("join-password").value;
        if ($("join-password2")) join.password2 = $("join-password2").value;
        if (!join.firstName) { join.error = joinError("name_required"); renderJoin(); $("join-first")?.focus(); return; }
        if (join.password.length < 8) { join.error = joinError("password_short"); renderJoin(); $("join-password")?.focus(); return; }
        if (join.password !== join.password2) { join.error = joinError("password_mismatch"); renderJoin(); $("join-password2")?.focus(); return; }
        join.busy = true; join.error = ""; renderJoin();
        try {
          const res = await joinApi("start", { firstName: join.firstName, lastName: join.lastName });
          join.step = "code";
          join.resendAt = Date.now() + (Number(res.retryAfter) || 30) * 1000;
        } catch (e) {
          join.error = joinError(e.code);
          if (e.code === "too_soon") { join.step = "code"; join.resendAt = Date.now() + (Number(e.retryAfter) || 30) * 1000; join.error = ""; }
        } finally {
          join.busy = false;
          renderJoin();
          if (join.step === "code") { $("join-code")?.focus(); joinTick(); }
        }
      }
      async function verifyJoinCode() {
        const code = ($("join-code")?.value || "").replace(/\D/g, "");
        if (code.length !== 6) { join.error = "Enter the 6-digit code from the email."; renderJoin(); $("join-code")?.focus(); return; }
        join.busy = true; join.error = ""; renderJoin();
        try {
          const res = await joinApi("verify", { code });
          join.step = "signing-in";
          renderJoin();
          const attempt = await window.Clerk.client.signIn.create({ strategy: "ticket", ticket: res.ticket });
          if (attempt.status !== "complete") throw Object.assign(new Error("ticket"), { code: "unavailable" });
          await window.Clerk.setActive({ session: attempt.createdSessionId });
          // Clerk's listener now renders the signed-in account with the joined team.
          void saveJoinPassword();
        } catch (e) {
          join.busy = false;
          if (join.step === "signing-in") {
            // The seat is accepted; only the automatic sign-in failed.
            join.step = "blocked";
            join.error = "Your seat is active, but we couldn't sign you in automatically. Sign in with your work email to continue.";
          } else {
            join.error = joinError(e.code);
          }
          renderJoin();
          if (join.step === "code") $("join-code")?.focus();
          return;
        }
        join.busy = false;
      }
      /**
       * The password goes from this browser straight to Clerk, never to our API.
       * An account that already has a password keeps it. A refusal (too weak,
       * found in a breach) leaves the member signed in with a way to fix it.
       */
      async function saveJoinPassword() {
        const password = join.password;
        join.password = "";
        join.password2 = "";
        const user = window.Clerk.user;
        if (!password || !user) return;
        let note = "";
        if (user.passwordEnabled) {
          note = "This email already had a SecureIntent password, so we kept it. Use that password to sign in next time.";
        } else {
          try {
            await user.updatePassword({ newPassword: password });
          } catch (e) {
            const reason = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || "";
            note = `You're in, but your password wasn't saved${reason ? `: ${reason}` : "."} Set one under Security in your profile below.`;
          }
        }
        if (!note) return;
        const box = document.createElement("p");
        box.className = "join-password-note";
        box.setAttribute("role", "status");
        box.textContent = note;
        $("account")?.prepend(box);
      }
      async function joinWithGoogle() {
        join.busy = true; join.error = ""; renderJoin();
        try {
          // Back on this page, the invitation is still in this tab and the
          // signed-in account accepts it (the Google email must match).
          await window.Clerk.client.signIn.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: SI.authReturn("account.html?sso-callback=1"),
            redirectUrlComplete: SI.authReturn("account.html"),
          });
        } catch {
          join.busy = false;
          join.error = joinError("google_unavailable");
          renderJoin();
        }
      }
      document.addEventListener("submit", (event) => {
        const form = event.target.closest?.("[data-join-form]");
        if (!form) return;
        event.preventDefault();
        if (join.busy) return;
        if (form.dataset.joinForm === "details") void sendJoinCode();
        else void verifyJoinCode();
      });
      document.addEventListener("click", (event) => {
        const reveal = event.target.closest?.("[data-join-reveal]");
        if (reveal) {
          const input = $(reveal.getAttribute("aria-controls"));
          const show = input.type === "password";
          input.type = show ? "text" : "password";
          reveal.textContent = show ? "Hide" : "Show";
          reveal.setAttribute("aria-pressed", String(show));
          return;
        }
        const el = event.target.closest?.("[data-join-google],[data-join-resend],[data-join-back]");
        if (!el || join.busy) return;
        if (el.hasAttribute("data-join-google")) void joinWithGoogle();
        else if (el.hasAttribute("data-join-resend")) void sendJoinCode();
        else if (el.hasAttribute("data-join-back")) { join.step = "details"; join.error = ""; renderJoin(); $("join-password")?.focus(); }
      });

      // Which Clerk component is currently mounted ('in' | 'signin' | 'signup' | 'join').
      // Clerk.addListener fires render() on every state change (incl. mid-flow,
      // e.g. the email-verification step). Re-mounting each time would tear down
      // the in-progress flow, so we mount a given state ONCE and skip if unchanged.
      let mounted = null;
      let profileUser = null;

      function render() {
        $("loading").hidden = true;
        const signedIn = !!window.Clerk.user;
        $("account").hidden = !signedIn;
        document.querySelector(".account-app").classList.toggle("is-signed-in", signedIn);
        $("signout-top").hidden = !signedIn;
        $("auth").hidden = signedIn;

        if (signedIn) {
          $("plan-who").textContent =
            window.Clerk.user.primaryEmailAddress?.emailAddress ??
            window.Clerk.user.fullName ??
            "Your account";
          if (mounted !== "in" || profileUser !== window.Clerk.user.id) {
            if (mounted === "signin") window.Clerk.unmountSignIn?.($("clerk-auth"));
            if (mounted === "signup") window.Clerk.unmountSignUp?.($("clerk-auth"));
            if (profileUser) window.Clerk.unmountUserProfile?.($("clerk-profile"));
            $("clerk-profile").replaceChildren();
            profileUser = window.Clerk.user.id;
            mounted = "in";
            window.Clerk.mountUserProfile($("clerk-profile"), { appearance: SI.appearance() });
            resumePendingTxn();
          }
          if (fromInvitation) {
            $("joined").hidden = false;
          }
          loadPlan();
          return;
        }

        // Signed out: keep sign-in AND sign-up on this page (don't fall back to
        // Clerk's hosted Account Portal). Mode chosen from ?mode=signup; the two
        // components cross-link via signInUrl / signUpUrl.
        const authParams = new URLSearchParams(location.search);
        const signUpMode = authParams.get("mode") === "signup" || authParams.get("__clerk_status") === "sign_up" ||
          (fromInvitation && authParams.get("mode") !== "signin");
        $("nav-team").hidden = true;
        $("joined").hidden = true;
        if (profileUser) {
          window.Clerk.unmountUserProfile?.($("clerk-profile"));
          $("clerk-profile").replaceChildren();
          profileUser = null;
        }
        // An invitation link gets our one-code join card, not Clerk's forms,
        // unless the person chose "Sign in" with an existing account.
        if (inviteToken && authParams.get("mode") !== "signin") {
          if (mounted !== "join") void startJoin();
          return;
        }
        const want = signUpMode ? "signup" : "signin";
        if (mounted === want) return; // already showing it — don't disturb the flow
        mounted = want;
        $("clerk-auth").replaceChildren();
        $("clerk-auth").classList.remove("is-join");
        const common = {
          appearance: SI.appearance(),
          afterSignInUrl: SI.authReturn("account.html"),
          afterSignUpUrl: SI.authReturn("account.html"),
          forceRedirectUrl: SI.authReturn("account.html"),
          signInForceRedirectUrl: SI.authReturn("account.html"),
          signUpForceRedirectUrl: SI.authReturn("account.html"),
        };
        if (signUpMode) {
          $("auth-title").textContent = "Create account";
          $("auth-sub").textContent = fromInvitation
            ? "Use the exact email address invited by your organisation."
            : "Start protecting your prompts in seconds.";
          window.Clerk.mountSignUp($("clerk-auth"), { ...common,
            signInUrl: SI.authReturn(fromInvitation ? "account.html?mode=signin" : "account.html") });
        } else {
          $("auth-title").textContent = "Sign in";
          $("auth-sub").textContent = fromInvitation
            ? "Use the exact email address invited by your organisation."
            : "Unlock Pro features and manage your account.";
          window.Clerk.mountSignIn($("clerk-auth"), {
            ...common,
            signUpUrl: SI.authReturn("account.html?mode=signup"),
          });
        }
      }

      async function main() {
        try {
          await window.Clerk.load({ appearance: SI.appearance() });

          if (window.Paddle && CFG.paddleToken) {
            if (CFG.paddleEnv === "sandbox") window.Paddle.Environment.set("sandbox");
            window.Paddle.Initialize({
              token: CFG.paddleToken,
              eventCallback: (e) => {
                if (e?.name === "checkout.completed") setTimeout(loadPlan, 3000);
              },
            });
          } else {
            console.warn("[account] Paddle client token not set — upgrade disabled.");
          }

          $("upgrade").addEventListener("click", openCheckout);
          $("manage").addEventListener("click", openPortal);
          $("plan-retry").addEventListener("click", loadPlan);
          $("team-retry").addEventListener("click", loadPlan);
          $("overlap-cancel").addEventListener("click", cancelPersonal);
          $("signout-top").addEventListener("click", () => window.Clerk.signOut());
          $("policy-update-dismiss").addEventListener("click", () => {
            if (policyNoticeKey) localStorage.setItem(policyNoticeKey, "seen");
            $("policy-update").hidden = true;
          });
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden && window.Clerk.user) void loadPolicyNotice();
          });
          setInterval(() => { if (!document.hidden && window.Clerk.user) void loadPolicyNotice(); }, 60000);
          // Returning from "Continue with Google" on the join card.
          if (new URLSearchParams(location.search).has("sso-callback")) {
            try {
              await window.Clerk.handleRedirectCallback({
                signInForceRedirectUrl: SI.authReturn("account.html"),
                signUpForceRedirectUrl: SI.authReturn("account.html"),
              });
            } catch (e) {
              console.error("[account] Google sign-in did not complete", e?.message || e);
            }
          }
          render();
          window.Clerk.addListener(render);
        } catch (e) {
          console.error("[account] init failed", e);
          $("loading").textContent = "Failed to load. Please refresh.";
        }
      }


      await main();

  } catch (error) {
    SI.showError(document.getElementById("loading"), error);
  }
})();
