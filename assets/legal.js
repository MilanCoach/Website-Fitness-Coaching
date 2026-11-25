(() => {
  "use strict";
  const toggleAll = document.querySelector("[data-accordion-toggle]") || document.getElementById("expand-all-privacy");
  const group = toggleAll?.getAttribute("aria-controls");
  const container = (group && document.getElementById(group)) || document;
  const details = [...container.querySelectorAll(".privacy-accordion")];
  function updateToggle() {
    const allOpen = details.length > 0 && details.every((item) => item.open);
    toggleAll.textContent = allOpen ? "Collapse all" : "Expand all";
    toggleAll.setAttribute("aria-expanded", String(allOpen));
  }
  if (toggleAll) {
    toggleAll.addEventListener("click", () => {
      const shouldOpen = !details.every((item) => item.open);
      details.forEach((item) => { item.open = shouldOpen; });
      updateToggle();
    });
    details.forEach((item) => item.addEventListener("toggle", updateToggle));
    updateToggle();
  }
  const time = document.getElementById("privacy-updated");
  const dateString = window.COACHING_SITE?.privacyLastUpdated;
  if (time && /^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) {
    const date = new Date(`${dateString}T12:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateString) {
      time.dateTime = dateString;
      time.textContent = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
    }
  }
})();
