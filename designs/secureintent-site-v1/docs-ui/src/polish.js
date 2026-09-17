const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const seen = new WeakSet();
const running = new Map();
let observer;

// Content is visible by default, including when scripts fail or motion is off.
// Only compositor-friendly, one-time animations are added after intersection.
const targets = [
  ...document.querySelectorAll(
    ".section-heading, .feature, .video-feature, .security-layout, .testimonial, .pricing-grid, .faq-section, .final-cta, .doc-card, .account-card, .contact-card, .install-preview-card",
  ),
];

function cancelMotion(element) {
  running.get(element)?.cancel();
  running.delete(element);
}
function setupReveals() {
  observer?.disconnect();
  for (const element of running.keys()) cancelMotion(element);
  if (
    reducedMotion.matches ||
    !("IntersectionObserver" in window) ||
    !Element.prototype.animate
  )
    return;
  observer = new IntersectionObserver(
    (entries) => {
      let delay = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        const element = entry.target;
        seen.add(element);
        observer.unobserve(element);
        if (element.contains(document.activeElement)) continue;
        const animation = element.animate(
          [{ transform: "translateY(9px)" }, { transform: "translateY(0)" }],
          { duration: 440, delay, easing: "cubic-bezier(.22, 1, .36, 1)" },
        );
        running.set(element, animation);
        animation.finished.then(
          () => running.delete(element),
          () => running.delete(element),
        );
        delay = Math.min(delay + 45, 90);
      }
    },
    { threshold: 0.08 },
  );
  targets.forEach((element) => {
    if (!seen.has(element)) observer.observe(element);
  });
}
setupReveals();
reducedMotion.addEventListener("change", setupReveals);
document.addEventListener("focusin", (event) => {
  for (const element of running.keys())
    if (element.contains(event.target)) cancelMotion(element);
});
window.addEventListener("pagehide", () => {
  observer?.disconnect();
  for (const element of running.keys()) cancelMotion(element);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) setupReveals();
});

const sections = ["product", "security", "pricing"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const navLinks = [...document.querySelectorAll(".desktop-nav a[href^='#']")];
const isDocs = document.body.classList.contains("docs-page");
let scrollQueued = false;
function updateReadingPosition() {
  scrollQueued = false;
  if (sections.length) {
    let current;
    for (const section of sections)
      if (section.getBoundingClientRect().top <= 190) current = section.id;
    for (const link of navLinks) {
      if (link.hash === "#" + current)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  if (isDocs) {
    const length = document.documentElement.scrollHeight - innerHeight;
    document.body.style.setProperty(
      "--reading-progress",
      length > 0 ? String(Math.min(1, Math.max(0, scrollY / length))) : "0",
    );
  }
}
function scheduleReadingUpdate() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(updateReadingPosition);
}
if (sections.length || isDocs) {
  window.addEventListener("scroll", scheduleReadingUpdate, { passive: true });
  window.addEventListener("resize", scheduleReadingUpdate, { passive: true });
  document.fonts?.ready.then(scheduleReadingUpdate);
  updateReadingPosition();
}
