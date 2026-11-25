(() => {
  "use strict";
  const defaults = { name: 60, email: 254, message: 450, goals: 180, obstacles: 180, phone: 25 };
  const limits = { ...defaults, ...(window.COACHING_SITE?.fieldLimits || {}) };
  document.querySelectorAll('select[name="salutation"]').forEach((field) => {
    field.addEventListener("change", () => {
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
  });
  document.querySelectorAll("[data-field-limit]").forEach((field) => {
    const configured = Number(limits[field.dataset.fieldLimit]);
    const maximum = Number.isInteger(configured) && configured > 0 ? configured : defaults[field.dataset.fieldLimit];
    if (!maximum) return;
    const label = field.dataset.fieldLabel || field.name;
    field.maxLength = maximum;
    field.placeholder = `${label} (character limit: ${maximum})`;
    if (field.tagName === "INPUT") {
      const wrapper = document.createElement("div");
      wrapper.className = "ghost-input-wrapper";
      field.before(wrapper);
      wrapper.append(field);
      const ghost = document.createElement("span");
      ghost.className = "field-ghost";
      ghost.setAttribute("aria-hidden", "true");
      const fieldName = document.createElement("span");
      fieldName.className = "field-ghost-label";
      fieldName.textContent = label;
      const fieldLimit = document.createElement("span");
      fieldLimit.className = "field-ghost-limit";
      fieldLimit.textContent = `(character limit: ${maximum})`;
      ghost.append(fieldName, fieldLimit);
      wrapper.append(ghost);
    }
    const hint = document.createElement("span");
    hint.id = `${field.id}-limit-hint`;
    hint.className = "sr-only";
    hint.textContent = `Character limit: ${maximum}.`;
    field.insertAdjacentElement("afterend", hint);
    const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    descriptions.add(hint.id);
    field.setAttribute("aria-describedby", [...descriptions].join(" "));
    field.addEventListener("input", () => {
      if (field.value.length > maximum) field.value = field.value.slice(0, maximum);
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
    field.addEventListener("invalid", () => field.setAttribute("aria-invalid", "true"));
  });
})();
