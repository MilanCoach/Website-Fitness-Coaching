(() => {
  "use strict";
  const form = document.getElementById("newsletter-form");
  if (!form) return;
  const input = document.getElementById("newsletter-email");
  const button = document.getElementById("newsletter-submit");
  const error = document.getElementById("newsletter-error");
  const confirmation = document.getElementById("newsletter-confirmation");
  const status = document.getElementById("newsletter-status");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let busy = false;
  let requestId = null;
  let timers = [];
  let generation = 0;
  const after = (milliseconds, action) => timers.push(setTimeout(action, milliseconds));
  function clearError() {
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  }
  function restore() {
    input.value = "";
    form.dataset.state = "restoring";
    form.classList.remove("is-confirming");
    confirmation.setAttribute("aria-hidden", "true");
    input.removeAttribute("aria-hidden");
    after(reduced.matches ? 0 : 2000, () => {
      form.dataset.state = "idle";
      input.readOnly = false;
      input.tabIndex = 0;
      button.disabled = false;
      button.removeAttribute("aria-label");
      busy = false;
      requestId = null;
      status.textContent = "";
    });
  }
  input.addEventListener("input", () => {
    window.CoachUI?.hideNewsletterCue();
    if (!busy) { clearError(); requestId = null; }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    window.CoachUI?.hideNewsletterCue();
    if (busy) return;
    clearError();
    input.value = input.value.trim();
    if (!window.CoachValidation.email(input.value)) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = "You've entered an invalid E-Mail address.";
      input.focus({ preventScroll: true });
      return;
    }
    busy = true;
    const submittedGeneration = ++generation;
    form.dataset.state = "submitting";
    form.setAttribute("aria-busy", "true");
    button.disabled = true;
    input.readOnly = true;
    requestId ||= window.CoachAPI.requestId();
    try {
      await window.CoachAPI.subscribe({ email: input.value, website: form.elements.website.value }, requestId);
      if (submittedGeneration !== generation) return;
      form.removeAttribute("aria-busy");
      form.dataset.state = "confirming";
      input.tabIndex = -1;
      input.setAttribute("aria-hidden", "true");
      confirmation.setAttribute("aria-hidden", "false");
      button.setAttribute("aria-label", "Confirmation E-Mail requested");
      status.textContent = "Please check your E-Mail to confirm your subscription.";
      form.classList.add("is-confirming");
      after(reduced.matches ? 0 : 1000, () => {
        form.dataset.state = "success";
        after(2500, restore);
      });
    } catch (failure) {
      if (submittedGeneration !== generation) return;
      form.removeAttribute("aria-busy");
      form.dataset.state = "idle";
      error.textContent = failure.message;
      if (failure.code === "invalid_email") input.setAttribute("aria-invalid", "true");
      busy = false;
      button.disabled = false;
      input.readOnly = false;
    }
  });
  window.addEventListener("pagehide", () => {
    generation++;
    timers.forEach(clearTimeout); timers = [];
    form.classList.remove("is-confirming"); form.dataset.state = "idle"; form.removeAttribute("aria-busy");
    confirmation.setAttribute("aria-hidden", "true"); input.removeAttribute("aria-hidden");
    input.value = ""; input.readOnly = false; input.tabIndex = 0;
    button.disabled = false; button.removeAttribute("aria-label"); busy = false; requestId = null;
  });
})();
