(() => {
  "use strict";
  const card = document.getElementById("application-card");
  if (!card) return;
  const stages = [...card.querySelectorAll("[data-stage]")];
  const detailsForm = document.getElementById("application-details");
  const whatsappForm = document.getElementById("whatsapp-request");
  const phone = document.getElementById("application-phone");
  const tabs = [...card.querySelectorAll("[role='tab']")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let currentStage = "details";
  let selectedMethod = null;
  let changingStage = false;
  let transitionToken = 0;
  let activeAnimations = [];
  let selectedSlot = null;
  let submitting = false;
  let requestId = null;
  let submissionGeneration = 0;
  const V = window.CoachValidation;
  const API = window.CoachAPI;
  const bookButton = document.getElementById("book-call");
  const requestButton = document.getElementById("request-contact");
  const feedback = document.createElement("p");
  feedback.className = "application-feedback";
  feedback.setAttribute("role", "alert");
  feedback.hidden = true;
  document.querySelector(".method-bottom").prepend(feedback);
  const honeypot = document.createElement("input");
  honeypot.name = "website"; honeypot.className = "bot-field"; honeypot.tabIndex = -1;
  honeypot.autocomplete = "off"; honeypot.setAttribute("aria-hidden", "true");
  detailsForm.append(honeypot);
  const calendarUI = new window.CoachCalendar(document.getElementById("call-calendar"), (slot) => { selectedSlot = slot; bookButton.disabled = !slot || submitting; });
  const confirmationHeading = document.getElementById("confirmation-heading");
  const confirmationNote = card.querySelector(".confirmation-note");
  card.dataset.stage = currentStage;

  async function changeStage(name) {
    if (changingStage || name === currentStage) return;
    changingStage = true;
    card.setAttribute("aria-busy", "true");
    const token = ++transitionToken;
    const outgoing = stages.find((stage) => stage.dataset.stage === currentStage);
    const incoming = stages.find((stage) => stage.dataset.stage === name);
    try {
      if (!reducedMotion.matches) {
        const leaving = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "ease-out", fill: "forwards" });
        activeAnimations.push(leaving);
        await leaving.finished;
      }
      if (token !== transitionToken) return;
      outgoing.hidden = true;
      activeAnimations.forEach((animation) => animation.cancel());
      activeAnimations = [];
      card.classList.toggle("is-confirmed", name === "complete");
      incoming.hidden = false;
      incoming.scrollTop = 0;
      currentStage = name;
      card.dataset.stage = name;
      const focus = name === "details" ? document.getElementById("application-name") : name === "method" ? document.getElementById("contact-method-heading") : document.getElementById("confirmation-heading");
      focus.focus({ preventScroll: true });
      if (!reducedMotion.matches) {
        const entering = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        activeAnimations.push(entering);
        await entering.finished;
      }
    } catch (error) {
      // A navigation/reset can cancel an in-flight entrance animation.
      if (error.name !== "AbortError") throw error;
    } finally {
      if (token === transitionToken) {
        activeAnimations.forEach((animation) => animation.cancel());
        activeAnimations = [];
        changingStage = false;
        card.removeAttribute("aria-busy");
      }
    }
  }

  function detailsAreValid() {
    const name = document.getElementById("application-name");
    const email = document.getElementById("application-email");
    name.value = name.value.trim();
    email.value = email.value.trim();
    const invalid = V.validateDetails(details());
    if (invalid) V.setFieldError(document.getElementById(`application-${invalid.field}`), invalid.code);
    return detailsForm.reportValidity();
  }
  function details() {
    const { name, salutation, email, message } = detailsForm.elements;
    return { name: name.value.trim(), salutation: salutation.value, email: email.value.trim(), message: message.value.trim(), website: honeypot.value };
  }
  detailsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!submitting && detailsAreValid()) changeStage("method");
  });
  document.getElementById("application-previous").addEventListener("click", () => changeStage("details"));

  function selectMethod(method) {
    if (submitting) return;
    selectedMethod = method;
    card.dataset.method = method;
    tabs.forEach((tab) => {
      const selected = tab.dataset.method === method;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.getElementById("method-choice-intro").hidden = true;
    document.getElementById("call-panel").hidden = method !== "call";
    document.getElementById("whatsapp-panel").hidden = method !== "whatsapp";
    document.getElementById("book-call").hidden = method !== "call";
    document.getElementById("request-contact").hidden = method !== "whatsapp";
    feedback.hidden = true;
    if (method === "call") calendarUI.load();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectMethod(tab.dataset.method));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== null) {
        event.preventDefault();
        tabs.forEach((item, itemIndex) => { item.tabIndex = itemIndex === next ? 0 : -1; });
        tabs[next].focus();
      }
    });
  });

  phone.addEventListener("input", () => {
    phone.setCustomValidity("");
    phone.removeAttribute("aria-invalid");
  });
  card.addEventListener("input", () => { if (!submitting) { requestId = null; feedback.hidden = true; } });
  async function submitRequest(method, payload) {
    const generation = ++submissionGeneration;
    submitting = true;
    card.setAttribute("aria-busy", "true");
    requestButton.disabled = true; bookButton.disabled = true;
    document.getElementById("application-previous").disabled = true;
    tabs.forEach((tab) => { tab.disabled = true; });
    feedback.hidden = true;
    requestId ||= API.requestId();
    try {
      const result = await (method === "call" ? API.book(payload, requestId) : API.requestContact(payload, requestId));
      if (generation !== submissionGeneration) return;
      const isCall = method === "call";
      const emailFailed = result.confirmationEmail === false;
      confirmationHeading.textContent = isCall ? "Booking confirmed" : emailFailed ? "Request received" : "Check your email!";
      confirmationNote.hidden = !!result.preview;
      confirmationNote.textContent = isCall ? "Your booking email contains the call details." : "I will get in touch via WhatsApp.";
      if (isCall && result.confirmationEmailPending) {
        confirmationNote.textContent = "Your call is booked. Your confirmation email with the call details will follow shortly.";
      } else if (isCall && emailFailed) {
        confirmationNote.textContent = "Your call is booked. I couldn’t send the confirmation email.";
        const detailsLink = document.createElement("a");
        detailsLink.href = result.zoomUrl || `mailto:${result.contactEmail}`;
        detailsLink.textContent = result.zoomUrl ? "Copy or open your Zoom link" : "Email me for the call details";
        confirmationNote.append(document.createElement("br"), detailsLink);
      }
      await changeStage("complete");
    } catch (error) {
      if (generation !== submissionGeneration) return;
      feedback.textContent = error.message; feedback.dataset.kind = "error"; feedback.hidden = false;
      if (error.field) {
        const field = document.getElementById(`application-${error.field}`);
        if (field) { V.setFieldError(field, error.code); field.reportValidity(); }
      }
      if (error.code === "slot_unavailable") { selectedSlot = null; requestId = null; calendarUI.load(true); }
    } finally {
      if (generation === submissionGeneration) {
        submitting = false; card.removeAttribute("aria-busy");
        requestButton.disabled = false; bookButton.disabled = !selectedSlot;
        document.getElementById("application-previous").disabled = false;
        tabs.forEach((tab) => { tab.disabled = false; });
      }
    }
  }
  whatsappForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (selectedMethod !== "whatsapp" || changingStage || submitting) return;
    phone.setCustomValidity("");
    for (const field of whatsappForm.querySelectorAll("textarea")) field.value = field.value.trim();
    const payload = { ...details(), phone: phone.value, goals: document.getElementById("application-goals").value, obstacles: document.getElementById("application-obstacles").value };
    const invalid = V.validateDetails(payload, "whatsapp");
    if (invalid) V.setFieldError(document.getElementById(`application-${invalid.field}`), invalid.code);
    if (!whatsappForm.reportValidity()) return;
    if (invalid) return;
    payload.phone = V.phone(phone.value);
    submitRequest("whatsapp", payload);
  });
  bookButton.addEventListener("click", () => { if (selectedMethod === "call" && selectedSlot && !submitting && !changingStage && detailsAreValid()) submitRequest("call", { ...details(), ...selectedSlot }); });

  function resetApplication() {
    transitionToken += 1;
    activeAnimations.forEach((animation) => animation.cancel());
    activeAnimations = [];
    changingStage = false;
    currentStage = "details";
    selectedMethod = null;
    submissionGeneration++;
    submitting = false; requestId = null; selectedSlot = null;
    calendarUI.reset();
    feedback.hidden = true;
    requestButton.disabled = false;
    document.getElementById("application-previous").disabled = false;
    tabs.forEach((tab) => { tab.disabled = false; });
    detailsForm.reset();
    whatsappForm.reset();
    card.querySelectorAll("input, textarea, select").forEach((field) => field.setCustomValidity(""));
    card.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
    card.classList.remove("is-confirmed");
    card.removeAttribute("aria-busy");
    card.dataset.stage = "details";
    delete card.dataset.method;
    stages.forEach((stage) => { stage.hidden = stage.dataset.stage !== "details"; });
    tabs.forEach((tab) => { tab.setAttribute("aria-selected", "false"); tab.tabIndex = 0; });
    for (const id of ["call-panel", "whatsapp-panel", "book-call", "request-contact"]) document.getElementById(id).hidden = true;
    document.getElementById("method-choice-intro").hidden = false;
  }
  // Leaving the page clears both tabs, including when the browser uses bfcache.
  window.addEventListener("pagehide", resetApplication);
  window.addEventListener("pageshow", (event) => { if (event.persisted) resetApplication(); });
})();
