/* Shared by the browser and Worker. The phone metadata is bundled locally. */
((root) => {
  "use strict";
  const limits = Object.freeze({ name: 60, email: 254, message: 450, goals: 180, obstacles: 180, phone: 25 });
  function email(value) {
    if (typeof value !== "string") return false;
    const cleaned = value.trim();
    if (!cleaned || cleaned.length > limits.email || /\s/.test(cleaned)) return false;
    const pieces = cleaned.split("@");
    if (pieces.length !== 2) return false;
    const [local, domain] = pieces;
    if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    if (!/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local)) return false;
    const labels = domain.split(".");
    if (labels.length < 2 || labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return false;
    return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]) || /^xn--[a-z0-9-]+$/i.test(labels[labels.length - 1]);
  }
  function name(value) {
    if (typeof value !== "string" || value.trim().length > limits.name) return false;
    const words = value.trim().split(/\p{Zs}+/u);
    return words.length >= 2 && words.every((word) => /^\p{L}[\p{L}\p{M}.\u2019'-]*$/u.test(word));
  }
  function phone(value) {
    if (typeof value !== "string" || value.length > limits.phone || !/^\+[0-9() .-]+$/.test(value.trim())) return null;
    try {
      const parsed = root.libphonenumber?.parsePhoneNumberFromString(value.trim(), { extract: false });
      return parsed && parsed.isValid() ? parsed.number : null;
    } catch { return null; }
  }
  function text(value, maximum, required = false) {
    return typeof value === "string" && value.trim().length <= maximum && (!required || value.trim().length >= 2) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
  }
  function validateDetails(input, kind = "application") {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { field: "name", code: "invalid_input" };
    if (!name(input.name)) return { field: "name", code: "invalid_name" };
    if (!["", "Mr.", "Ms.", "Other"].includes(input.salutation ?? "")) return { field: "salutation", code: "invalid_salutation" };
    if (!email(input.email)) return { field: "email", code: "invalid_email" };
    if (!text(input.message ?? "", limits.message, kind === "contact")) return { field: "message", code: "invalid_message" };
    if (kind === "whatsapp") {
      if (!phone(input.phone)) return { field: "phone", code: "invalid_phone" };
      if (!text(input.goals ?? "", limits.goals)) return { field: "goals", code: "invalid_goals" };
      if (!text(input.obstacles ?? "", limits.obstacles)) return { field: "obstacles", code: "invalid_obstacles" };
    }
    return null;
  }
  const messages = Object.freeze({
    invalid_name: "Please enter your first and last name in at least two words.",
    invalid_salutation: "Please choose an option from Address or leave it blank.",
    invalid_email: "You've entered an invalid E-Mail address.",
    invalid_message: "Please enter a message within the character limit.",
    invalid_phone: "Enter a valid phone number with its country code, for example +49 151 23456789.",
    invalid_goals: "Please keep your goals within the character limit.",
    invalid_obstacles: "Please keep your obstacle within the character limit."
  });
  function setFieldError(field, code) {
    field.setCustomValidity(messages[code] || "Please check this field.");
    field.setAttribute("aria-invalid", "true");
  }
  root.CoachValidation = Object.freeze({ limits, email, name, phone, text, validateDetails, messages, setFieldError });
})(globalThis);
