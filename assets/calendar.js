(() => {
  "use strict";
  class CoachCalendar {
    constructor(host, onSelect) {
      this.host = host; this.onSelect = onSelect; this.original = host.innerHTML;
      this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      this.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      this.offset = 0; this.slots = []; this.selected = null; this.selectedDay = null; this.generation = 0; this.ready = false;
    }
    async load(force = false) {
      if (window.CoachAPI.preview || (this.ready && !force)) return;
      const generation = ++this.generation;
      try {
        const status = await window.CoachAPI.getStatus();
        if (generation !== this.generation) return;
        if (!status.calendar) return;
        this.ready = true;
        this.render("Loading availability…");
        const start = new Date(this.month.getFullYear(), this.month.getMonth(), 1).toISOString();
        const end = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1).toISOString();
        const result = await window.CoachAPI.availability(start, end, this.timeZone);
        if (generation !== this.generation) return;
        this.slots = result.slots;
        if (!this.slots.includes(this.selected)) { this.selected = null; this.onSelect(null); }
        const firstDay = this.slots[0] && this.dayKey(this.slots[0]);
        if (!this.selectedDay || !this.slots.some((slot) => this.dayKey(slot) === this.selectedDay)) this.selectedDay = firstDay || null;
        this.render();
      } catch (error) {
        if (generation !== this.generation) return;
        this.selected = null; this.onSelect(null);
        this.render(error.message || "Availability could not be loaded.", true);
      }
    }
    dayKey(value) {
      const date = new Date(value);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
    render(message = "", retry = false) {
      this.host.innerHTML = '<div class="live-calendar"><div><div class="live-calendar-toolbar"><button class="calendar-month-arrow" type="button" aria-label="Previous month">‹</button><span class="calendar-month-title"></span><button class="calendar-month-arrow" type="button" aria-label="Next month">›</button></div><div class="live-calendar-weekdays" aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="live-calendar-days" aria-label="Available dates"></div></div><div class="calendar-times" aria-live="polite"></div></div><p class="calendar-timezone"></p>';
      this.host.querySelector(".calendar-month-title").textContent = this.month.toLocaleDateString("en", { month: "long", year: "numeric" });
      this.host.querySelector(".calendar-timezone").textContent = `Times in ${this.timeZone.replaceAll("_", " ")}.`;
      const arrows = this.host.querySelectorAll(".calendar-month-arrow");
      arrows[0].disabled = this.offset <= 0; arrows[1].disabled = this.offset >= 11;
      arrows.forEach((button, index) => button.addEventListener("click", () => {
        this.offset += index === 0 ? -1 : 1;
        this.month.setMonth(this.month.getMonth() + (index === 0 ? -1 : 1));
        this.selected = null; this.selectedDay = null; this.slots = []; this.onSelect(null); this.load(true);
      }));
      const days = this.host.querySelector(".live-calendar-days");
      const leading = (this.month.getDay() + 6) % 7;
      for (let i = 0; i < leading; i++) days.append(document.createElement("span"));
      const last = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= last; day++) {
        const date = new Date(this.month.getFullYear(), this.month.getMonth(), day);
        const key = this.dayKey(date), button = document.createElement("button");
        button.type = "button"; button.className = "calendar-day"; button.textContent = String(day);
        button.disabled = !!message || !this.slots.some((slot) => this.dayKey(slot) === key);
        button.setAttribute("aria-label", date.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
        button.setAttribute("aria-pressed", String(key === this.selectedDay));
        button.classList.toggle("is-selected", key === this.selectedDay);
        button.addEventListener("click", () => { this.selectedDay = key; this.render(); const active = [...this.host.querySelectorAll(".calendar-day")].find((item) => item.getAttribute("aria-pressed") === "true"); active?.focus({ preventScroll: true }); });
        days.append(button);
      }
      const times = this.host.querySelector(".calendar-times");
      if (message || !this.slots.length) {
        const status = document.createElement("p"); status.className = "calendar-status"; status.setAttribute("role", "status"); status.textContent = message || "No available times this month. Try the next month."; times.append(status);
        if (retry) { const button = document.createElement("button"); button.type = "button"; button.className = "button button-secondary"; button.textContent = "Try again"; button.addEventListener("click", () => this.load(true)); times.append(button); }
      } else {
        const heading = document.createElement("p"); heading.className = "calendar-times-title"; heading.textContent = "Choose a time"; times.append(heading);
        this.slots.filter((slot) => this.dayKey(slot) === this.selectedDay).forEach((slot) => {
          const button = document.createElement("button"); button.type = "button"; button.className = "calendar-time-button";
          button.textContent = new Date(slot).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          button.setAttribute("aria-pressed", String(slot === this.selected)); button.classList.toggle("is-selected", slot === this.selected);
          button.addEventListener("click", () => { this.selected = slot; this.onSelect({ start: slot, timeZone: this.timeZone }); this.render(); [...this.host.querySelectorAll(".calendar-time-button")].find((item) => item.getAttribute("aria-pressed") === "true")?.focus({ preventScroll: true }); });
          times.append(button);
        });
      }
    }
    reset() {
      this.generation++; this.ready = false; this.selected = null; this.selectedDay = null; this.slots = []; this.offset = 0;
      this.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      this.host.innerHTML = this.original;
      this.onSelect(null);
    }
  }
  window.CoachCalendar = CoachCalendar;
})();
