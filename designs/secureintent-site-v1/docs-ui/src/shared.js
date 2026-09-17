import "./polish.js";

const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");
function updateTheme(theme) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#050608" : "#ffffff");
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute(
      "aria-label",
      `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
    );
    button.setAttribute(
      "title",
      `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
    );
  });
}
updateTheme(root.dataset.theme || (media.matches ? "dark" : "light"));
document.querySelectorAll("[data-theme-toggle]").forEach((button) =>
  button.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("si_site_theme", theme);
    } catch {
      /* Session-only preference is still usable. */
    }
    updateTheme(theme);
  }),
);
media.addEventListener("change", (event) => {
  let saved;
  try {
    saved = localStorage.getItem("si_site_theme");
  } catch {
    /* Storage may be disabled. */
  }
  if (saved !== "light" && saved !== "dark")
    updateTheme(event.matches ? "dark" : "light");
});
window.addEventListener("storage", (event) => {
  if (event.key === "si_site_theme")
    updateTheme(
      event.newValue === "dark" || event.newValue === "light"
        ? event.newValue
        : media.matches
          ? "dark"
          : "light",
    );
});

export async function copyText(text, button, label = "Copied") {
  const original = button.innerHTML;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = label;
    button.dataset.copyState = "copied";
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.className = "manual-copy";
    field.setAttribute("aria-label", "Copy this text manually");
    button.after(field);
    field.focus();
    field.select();
    button.textContent = "Select and copy below";
    field.addEventListener("blur", () => field.remove(), { once: true });
  }
  setTimeout(() => {
    if (button.isConnected) {
      button.innerHTML = original;
      delete button.dataset.copyState;
    }
  }, 2200);
}
