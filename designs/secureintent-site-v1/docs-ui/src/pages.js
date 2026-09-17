import "./shared.js";

const params = new URLSearchParams(location.search);
const planNames = {
  developer: "Developer Pro",
  business: "Business Pro",
  free: "Free",
};
const plan = document.querySelector(".selected-plan");
if (plan && planNames[params.get("plan")]) {
  plan.textContent = `Selected plan: ${planNames[params.get("plan")]}`;
  plan.hidden = false;
}
const topic = document.querySelector("#contact-topic");
if (
  topic &&
  [...topic.options].some((option) => option.value === params.get("topic"))
)
  topic.value = params.get("topic");

document.querySelectorAll("[data-support-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const topic = form.querySelector('select').selectedOptions[0].textContent;
    const body = `Name: ${data.get('name')}\nReply email: ${data.get('email')}\n\n${data.get('message')}`;
    const url = 'mailto:info@secureintent.ai?subject=' + encodeURIComponent('SecureIntent — ' + topic) + '&body=' + encodeURIComponent(body);
    window.location.href = url;
    status.textContent = 'Review the draft in your email app and press Send. If no app opened, email info@secureintent.ai directly.';
    status.classList.add("visible");
  });
  // The generated HTML starts disabled: there is no native GET submission
  // with email/message fields if JavaScript is unavailable or has not loaded.
  form.querySelector('button[type="submit"]').disabled = false;
});
