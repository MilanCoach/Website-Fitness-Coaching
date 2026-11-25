(() => {
  "use strict";
  const form = document.getElementById("contact-form");
  if (!form) return;
  const feedback = document.getElementById("contact-feedback");
  const send = document.getElementById("contact-send");
  let busy = false;
  let requestId = null;
  let resetVersion = 0;
  form.addEventListener("input", () => { if (!busy) { requestId = null; feedback.textContent = ""; } });
  form.addEventListener("reset", () => { requestId = null; resetVersion++; });
  window.addEventListener("pagehide", () => { resetVersion++; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    feedback.textContent = "";
    const data = { name: form.elements.name.value.trim(), salutation: form.elements.salutation.value, email: form.elements.email.value.trim(), message: form.elements.message.value.trim(), website: form.elements.website.value };
    const issue = window.CoachValidation.validateDetails(data, "contact");
    if (issue) {
      const field = form.elements[issue.field];
      window.CoachValidation.setFieldError(field, issue.code);
      field.reportValidity();
      return;
    }
    busy = true;
    send.disabled = true;
    send.setAttribute("aria-busy", "true");
    requestId ||= window.CoachAPI.requestId();
    const submittedVersion = resetVersion;
    try {
      const result = await window.CoachAPI.contact(data, requestId);
      if (submittedVersion !== resetVersion) return;
      const unchanged = ["name", "salutation", "email", "message"].every((key) => form.elements[key].value.trim() === data[key]);
      if (!result.preview && unchanged) window.dispatchEvent(new CustomEvent("coaching:contact-sent"));
      if (!unchanged) requestId = null;
      if (result.preview) {
        feedback.dataset.kind = "success";
        feedback.textContent = "Message ready.";
      } else {
        feedback.dataset.kind = "success";
        feedback.textContent = unchanged ? "Your message has been sent. Thank you for getting in touch." : "Your previous message was sent. Your new edits have been kept.";
      }
    } catch (error) {
      if (submittedVersion !== resetVersion) return;
      feedback.dataset.kind = "error";
      feedback.textContent = error.message;
    } finally {
      busy = false;
      send.disabled = false;
      send.removeAttribute("aria-busy");
    }
  });
})();
