import { copyText } from "./shared.js";
import { docs, docLink, pageText } from "./content/docs.js";
import { icon, escapeHtml } from "./icons.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const page = docs.find((doc) => doc.slug === document.body.dataset.docSlug);
const search = $(".search-dialog");
const drawer = $(".docs-nav-dialog");
const input = $("#docs-search");
const results = $("#search-results");
const searchIndex = docs.map((doc) => ({ ...doc, text: pageText(doc) }));
let lastTrigger;

function showDialog(dialog, trigger) {
  document.querySelectorAll("dialog[open]").forEach((other) => other.close());
  lastTrigger = trigger;
  dialog.showModal();
  document.body.classList.add("modal-open");
}
for (const dialog of [search, drawer]) {
  dialog.addEventListener("close", () => {
    if (!document.querySelector("dialog[open]")) {
      document.body.classList.remove("modal-open");
      lastTrigger?.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
}

function renderResults() {
  const query = input.value.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const matches = searchIndex
    .filter((doc) =>
      words.every((word) => doc.text.toLowerCase().includes(word)),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(query)) -
        Number(a.title.toLowerCase().includes(query)),
    )
    .slice(0, 9);
  $(".search-result-count").textContent = query
    ? `${matches.length}${matches.length === 9 ? "+" : ""} matching ${matches.length === 1 ? "page" : "pages"}`
    : "Explore the documentation";
  results.innerHTML = matches.length
    ? matches
        .map((doc) => {
          let excerpt = doc.description;
          if (
            query &&
            !`${doc.title} ${doc.description}`.toLowerCase().includes(query)
          ) {
            const index = doc.text.toLowerCase().indexOf(words[0]);
            if (index >= 0)
              excerpt = `${index > 45 ? "…" : ""}${doc.text.slice(Math.max(0, index - 45), index + 125)}…`;
          }
          return `<a class="search-result" href="${docLink(doc.slug)}">${icon(doc.icon)}<span><small>${escapeHtml(doc.group)}</small><strong>${escapeHtml(doc.title)}</strong><span>${escapeHtml(excerpt)}</span></span>${icon("arrow")}</a>`;
        })
        .join("")
    : `<div class="search-empty">${icon("search")}<h3>No pages found</h3><p>Try “privacy”, “anonymize”, or “browser”.</p><a href="/designs/secureintent-site-v1/docs/resources/troubleshooting/">Explore troubleshooting ${icon("arrow")}</a></div>`;
}
function openSearch(trigger) {
  showDialog(search, trigger);
  input.value = "";
  renderResults();
  input.focus();
}
$$("[data-open-search]").forEach((button) =>
  button.addEventListener("click", () => openSearch(button)),
);
$("[data-close-search]").addEventListener("click", () => search.close());
input.addEventListener("input", renderResults);
search.addEventListener("keydown", (event) => {
  // A native search input consumes Escape to clear its value. Close the
  // command dialog explicitly so one Escape always dismisses it.
  if (event.key === "Escape") {
    event.preventDefault();
    search.close();
    return;
  }
  const links = [...results.querySelectorAll("a")];
  const focused = links.indexOf(document.activeElement);
  if (event.key === "ArrowDown" && links.length) {
    event.preventDefault();
    links[(focused + 1) % links.length].focus();
  } else if (event.key === "ArrowUp" && links.length) {
    event.preventDefault();
    if (focused === 0) input.focus();
    else links[focused === -1 ? links.length - 1 : focused - 1].focus();
  } else if (
    event.key === "Enter" &&
    document.activeElement === input &&
    links.length
  ) {
    event.preventDefault();
    links[0].click();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (search.open) search.close();
    else openSearch($("[data-open-search]"));
  }
});
if (/Mac|iPhone|iPad/.test(navigator.platform))
  $(".docs-search-trigger kbd").textContent = "⌘ K";

$("[data-open-nav]").addEventListener("click", (event) =>
  showDialog(drawer, event.currentTarget),
);
$("[data-close-nav]").addEventListener("click", () => drawer.close());
matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
  if (event.matches && drawer.open) drawer.close();
});

$$("[data-copy-code]").forEach((button) =>
  button.addEventListener("click", async () => {
    await copyText(
      button.closest(".doc-code").querySelector("code").textContent,
      button,
    );
    $(".screen-reader-status").textContent =
      "Code copy action completed. If your browser blocked copying, use the selected text field.";
  }),
);
$("[data-copy-page]")?.addEventListener("click", async (event) => {
  await copyText(pageText(page), event.currentTarget);
  $(".screen-reader-status").textContent =
    "Page copy action completed. If your browser blocked copying, use the selected text field.";
});

const feedbackKey = `secureintent-doc-feedback:${page.slug}`;
function setFeedback(value, announce = false) {
  $$("[data-feedback]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.feedback === value),
    ),
  );
  if (announce)
    $(".feedback-status").textContent =
      "Thanks. Your selection is saved in this tab only; nothing was sent.";
}
try {
  setFeedback(sessionStorage.getItem(feedbackKey));
} catch {
  /* Feedback remains usable with storage disabled. */
}
$$("[data-feedback]").forEach((button) =>
  button.addEventListener("click", () => {
    try {
      sessionStorage.setItem(feedbackKey, button.dataset.feedback);
    } catch {
      /* Session storage is optional. */
    }
    setFeedback(button.dataset.feedback, true);
  }),
);

const sections = $$(".doc-section");
const tocLinks = $$(".docs-toc nav a, .mobile-toc nav a");
let scrollQueued = false;
function updateToc() {
  let active = sections[0]?.id;
  for (const section of sections)
    if (section.getBoundingClientRect().top < 210) active = section.id;
  for (const link of tocLinks) {
    const selected = link.hash === `#${active}`;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  scrollQueued = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(updateToc);
    }
  },
  { passive: true },
);
updateToc();
