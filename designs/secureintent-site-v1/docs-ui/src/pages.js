import "./shared.js";

const params = new URLSearchParams(location.search);
const planNames = {
  developer: "Developer Pro",
  business: "Business Pro",
  free: "Free",
};
const plan = document.querySelector(".selected-plan");
if (plan && planNames[params.get("plan")]) {
  plan.textContent = `Selected plan: ${planNames[params.get("plan")]} · preview only`;
  plan.hidden = false;
}
const topic = document.querySelector("#contact-topic");
if (
  topic &&
  [...topic.options].some((option) => option.value === params.get("topic"))
)
  topic.value = params.get("topic");

document.querySelectorAll("[data-preview-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    status.textContent =
      form.dataset.previewForm === "account"
        ? "Preview complete. Authentication is not connected. No account was created and no email was sent."
        : "Preview complete. Your request was not sent. Connect a support service before publishing.";
    status.classList.add("visible");
    // Do not retain even the sample form data after a preview action.
    form.reset();
  });
  // The generated HTML starts disabled: there is no native GET submission
  // with email/message fields if JavaScript is unavailable or has not loaded.
  form.querySelector('button[type="submit"]').disabled = false;
});
