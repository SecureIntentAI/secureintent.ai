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

      const ICON = { locked: LOCK_SVG };

      const NOTES = {
        detection: "Scans every paste on-device and warns before secrets reach the page.",
        anonymise: "Swap detected secrets for masked tokens so you can paste without leaking them.",
        rehydrate: "Restore the original secrets from masked tokens later in the same session.",
        ghost: "Strip secrets, IPs and emails from large logs before you paste them.",
        session_lock: "PIN-lock high-risk cloud consoles after inactivity or tab-away.",
        team_policy: "Push shared detection rules and settings across your whole team.",
        team_alerts: "Notify your security team when a teammate is caught pasting a secret.",
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
        // Team Policy Sync and Security-Team Alerts are shipped, so a Business Pro
        // account has them now — not "Soon". Lower tiers see them locked, the same
        // way the Pro toolkit reads on Free.
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
          team("team_alerts", "Security-Team Alerts"),
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
          : "You're also paying for Developer Pro yourself. Cancel it and you keep it until the period you've paid for ends — your team seat takes over from there.";
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
        $("team-sub").textContent = isAdmin
          ? "Business Pro · manage seats and policies in your dashboard"
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
            $("plan-sub").textContent = "Provided by your team";
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

      // Which Clerk component is currently mounted ('in' | 'signin' | 'signup').
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
        const want = signUpMode ? "signup" : "signin";
        if (mounted === want) return; // already showing it — don't disturb the flow
        mounted = want;
        $("clerk-auth").replaceChildren();
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
