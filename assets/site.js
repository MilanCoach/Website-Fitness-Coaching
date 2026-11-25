(() => {
  "use strict";

  const settings = window.COACHING_SITE || {};
  const isHome = document.body.dataset.page === "home";
  const isApplication = document.body.dataset.page === "application";
  const homeHref = isHome ? "#home" : "index.html#home";
  const methodHref = isHome ? "#how-i-coach" : "index.html#how-i-coach";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  let contactIsOpen = false;

  // Shared header and footer: editing these templates updates every page.
  header.innerHTML = `
    <div class="header-inner wide-container">
      <a class="brand" href="${homeHref}" data-scroll="home" aria-label="Home">
        <span class="brand-mark" data-brand-initials></span>
        <span class="brand-name" data-brand-name></span>
      </a>
      <nav class="desktop-navigation" aria-label="Main navigation">
        <a class="text-control" href="${methodHref}" data-scroll="how-i-coach">How I coach</a>
        <a class="text-control" href="faq.html">FAQ</a>
        <button class="text-control" type="button" data-open-contact>Contact me</button>
        <a class="text-control" href="#newsletter" data-scroll="newsletter">Newsletter</a>
      </nav>
      <div class="header-actions">
        <button class="language-control" type="button" aria-label="Language: English" aria-disabled="true" title="English">
          EN <svg viewBox="0 0 10 7" aria-hidden="true"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
        <a class="button button-primary" href="application.html">Apply</a>
        <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="mobile-navigation">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <nav class="mobile-navigation" id="mobile-navigation" aria-label="Mobile navigation" hidden>
      <a class="text-control" href="${methodHref}" data-scroll="how-i-coach">How I coach</a>
      <a class="text-control" href="faq.html">FAQ</a>
      <button class="text-control" type="button" data-open-contact>Contact me</button>
      <a class="text-control" href="#newsletter" data-scroll="newsletter">Newsletter</a>
    </nav>`;

  const externalIcon = `<svg class="external-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  footer.innerHTML = `
    <span class="newsletter-cue" id="newsletter-cue" aria-hidden="true" hidden>
      <svg viewBox="0 0 116 144" fill="none">
        <path d="M14 8C54 14 91 47 84 84C80 106 66 119 52 135" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M11 12C51 18 85 46 81 82C79 104 63 122 52 134M48 112Q47 127 50 136Q64 132 75 125" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
        <path d="M51 111Q47 128 51 136Q65 133 77 124" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <div class="footer-inner wide-container">
      <div class="footer-details">
        <p class="copyright" data-copyright></p>
        <div class="footer-links-and-socials">
          <nav class="footer-navigation" aria-label="Footer navigation">
            <a href="${homeHref}" data-scroll="home">Home</a>
            <a href="faq.html">FAQ</a>
            <button class="text-control" type="button" data-open-contact>Contact me</button>
            <a href="legal-notice.html">Legal notice</a>
            <a href="privacy-policy.html">Privacy policy</a>
          </nav>
          <div class="social-links" aria-label="Social media">
            <a class="social-link" data-social="youtube" aria-label="YouTube — link not added yet" aria-disabled="true" title="YouTube">
              <svg class="social-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg>${externalIcon}
            </a>
            <a class="social-link" data-social="instagram" aria-label="Instagram — link not added yet" aria-disabled="true" title="Instagram">
              <svg class="social-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>${externalIcon}
            </a>
            <a class="social-link" data-social="tiktok" aria-label="TikTok — link not added yet" aria-disabled="true" title="TikTok">
              <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 2c.3 2.5 1.7 4.1 4.1 4.3v3.3a9.5 9.5 0 0 1-4.1-1.1v7.7a6.1 6.1 0 1 1-6.3-6.1h1v3.4a2.9 2.9 0 1 0 2 2.7V2h3.3Z" fill="currentColor"/></svg>${externalIcon}
            </a>
          </div>
        </div>
      </div>
      <section class="newsletter" id="newsletter" aria-labelledby="newsletter-heading" tabindex="-1">
        <h2 id="newsletter-heading">Newsletter</h2>
        <form class="newsletter-form" id="newsletter-form" novalidate data-state="idle">
          <div class="newsletter-row">
            <div class="newsletter-field-wrap">
              <label class="sr-only" for="newsletter-email">Your E-Mail</label>
              <input id="newsletter-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="Your E-Mail" aria-describedby="newsletter-error newsletter-description">
              <span class="newsletter-confirmation" id="newsletter-confirmation" aria-hidden="true">Check your E-Mail!</span>
            </div>
            <button class="button button-primary newsletter-submit" id="newsletter-submit" type="submit"><span class="newsletter-button-label">Sign Up</span><svg class="newsletter-button-check" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <p class="newsletter-error" id="newsletter-error" role="alert"></p>
          <input class="bot-field" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
          <span class="sr-only" id="newsletter-status" role="status"></span>
        </form>
        <p class="newsletter-description" id="newsletter-description">I frequently send extra articles, examples and guides via my newsletter for topics that don't make it into videos. Not spam, not useless.</p>
      </section>
    </div>`;

  if (isApplication) {
    header.innerHTML = `
      <div class="application-header-inner">
        <a class="brand" href="index.html#home" aria-label="Home"><span class="brand-mark" data-brand-initials></span><span class="brand-name" data-brand-name></span></a>
        <a class="text-control application-return" href="index.html#home">Return</a>
        <button class="language-control" type="button" aria-label="Language: English" aria-disabled="true" title="English">EN <svg viewBox="0 0 10 7" aria-hidden="true"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>
      </div>`;
    footer.innerHTML = `<nav class="application-footer-nav" aria-label="Application footer"><a href="legal-notice.html">Legal notice</a><a href="privacy-policy.html" target="_blank" rel="noopener" aria-label="Privacy policy (opens in a new tab)">Privacy policy</a><button class="text-control" type="button" data-open-contact>Contact me</button></nav>`;
  }

  header.querySelector("[data-brand-initials]").textContent = settings.initials || "M.G.";
  header.querySelector("[data-brand-name]").textContent = settings.name || "Milan Grubor";
  const copyright = footer.querySelector("[data-copyright]");
  if (copyright) copyright.textContent = settings.copyright || "© 2026 M. G. Milan Grubor. All rights reserved.";
  footer.querySelectorAll("[data-social]").forEach((link) => {
    const url = settings.socials?.[link.dataset.social];
    if (!url || !/^https?:\/\//i.test(url)) return;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.removeAttribute("aria-disabled");
    link.setAttribute("aria-label", `${link.title} (opens in a new tab)`);
  });

  // Shared contact dialog. Delivery is handled in contact.js.
  document.getElementById("contact-root").innerHTML = `
    <div class="contact-overlay" id="contact-overlay" hidden>
      <section class="contact-panel" id="contact-panel" role="dialog" aria-modal="false" aria-labelledby="contact-heading" tabindex="-1">
        <button class="close-contact" type="button" aria-label="Close contact form" data-close-contact>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
        <h2 id="contact-heading">Contact me</h2>
        <form id="contact-form" autocomplete="off" novalidate>
          <div class="name-address-row">
            <div class="contact-field">
              <label for="contact-name">First- and Last Name</label>
              <input id="contact-name" name="name" type="text" autocomplete="off" required data-field-limit="name" data-field-label="First- and Last Name">
            </div>
            <div class="contact-field">
              <label for="contact-salutation">Address <span class="sr-only">(optional)</span></label>
              <select id="contact-salutation" name="salutation">
                <option value=""></option>
                <option value="Mr.">Mr.</option>
                <option value="Ms.">Ms.</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div class="contact-field">
            <label for="contact-email">Email</label>
            <input id="contact-email" name="email" type="email" autocomplete="off" inputmode="email" required data-field-limit="email" data-field-label="Email">
          </div>
          <div class="contact-field">
            <label for="contact-message">Your Message</label>
            <textarea id="contact-message" name="message" required aria-describedby="contact-privacy" data-field-limit="message" data-field-label="Your Message"></textarea>
          </div>
          <p class="contact-privacy form-privacy-disclosure" id="contact-privacy">You can read how your information is handled in the <a href="privacy-policy.html" target="_blank" rel="noopener" aria-label="Privacy policy (opens in a new tab)">privacy policy</a>.<br>(Please do not send sensitive data via this form)</p>
          <p class="contact-feedback" id="contact-feedback" role="status"></p>
          <input class="bot-field" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="contact-bottom">
            <p class="contact-response-note">I’ll reply to the email address you enter here.</p>
            <div class="contact-actions">
              <button class="button button-secondary" id="delete-contact" type="button">Delete</button>
              <button class="button button-primary" id="contact-send" type="submit">Send</button>
            </div>
          </div>
        </form>
      </section>
    </div>`;

  const menuToggle = header.querySelector(".menu-toggle");
  const mobileNavigation = document.getElementById("mobile-navigation");
  function closeMenu() {
    if (!mobileNavigation || !menuToggle) return;
    mobileNavigation.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
  }
  menuToggle?.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") !== "true";
    mobileNavigation.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  document.addEventListener("pointerdown", (event) => {
    if (!header.contains(event.target)) closeMenu();
  });
  const desktopBreakpoint = window.matchMedia("(min-width: 901px)");
  desktopBreakpoint.addEventListener("change", () => {
    if (desktopBreakpoint.matches) closeMenu();
  });

  // The homepage footer pushes the header upward; it never fades its opacity.
  function updateHeader() {
    let progress = 0;
    if (isHome && !contactIsOpen) {
      const rect = footer.getBoundingClientRect();
      const visible = Math.max(0, Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top));
      const collisionHeight = Math.min(rect.height, window.innerHeight - header.offsetHeight);
      progress = Math.min(1, visible / Math.max(1, collisionHeight));
    }
    const fullyHidden = progress >= 0.999;
    if (fullyHidden && header.contains(document.activeElement)) {
      document.getElementById("newsletter")?.focus({ preventScroll: true });
    }
    header.style.setProperty("--header-lift", `${progress * 100}%`);
    header.toggleAttribute("data-fully-hidden", fullyHidden);
    header.toggleAttribute("data-over-hero", isHome && window.scrollY < (document.querySelector(".hero")?.offsetHeight || 0));
    header.inert = fullyHidden;
    if (fullyHidden) header.setAttribute("aria-hidden", "true");
    else header.removeAttribute("aria-hidden");
  }
  let headerFrame = 0;
  window.addEventListener("scroll", () => {
    if (headerFrame) return;
    headerFrame = requestAnimationFrame(() => {
      headerFrame = 0;
      updateHeader();
    });
  }, { passive: true });
  window.addEventListener("resize", updateHeader);
  new ResizeObserver(updateHeader).observe(footer);

  // The 10-second retention is memory-only. Closing starts a fresh deadline.
  // An explicit deadline also catches expired drafts if a background tab's
  // timeout has been delayed. Reopening before expiry cancels that deadline.
  const contactOverlay = document.getElementById("contact-overlay");
  const contactPanel = document.getElementById("contact-panel");
  const contactForm = document.getElementById("contact-form");
  const backgroundElements = [document.getElementById("main-content")];
  const draftLifetime = 10_000;
  let draftExpiresAt = 0;
  let draftTimer = 0;
  let previousFocus = null;

  function clearContactDraft() {
    window.clearTimeout(draftTimer);
    draftTimer = 0;
    draftExpiresAt = 0;
    contactForm.reset();
    contactForm.querySelectorAll("input, textarea, select").forEach((field) => { field.setCustomValidity(""); field.removeAttribute("aria-invalid"); });
    document.getElementById("contact-feedback").textContent = "";
  }
  function expireDraftIfNeeded() {
    if (!contactIsOpen && draftExpiresAt && Date.now() >= draftExpiresAt) clearContactDraft();
  }
  function openContact() {
    if (contactIsOpen) return;
    expireDraftIfNeeded();
    window.clearTimeout(draftTimer);
    draftTimer = 0;
    draftExpiresAt = 0;
    previousFocus = document.activeElement;
    closeMenu();
    contactIsOpen = true;
    contactOverlay.hidden = false;
    document.body.classList.add("contact-is-open");
    backgroundElements.forEach((element) => { element.inert = true; });
    updateHeader();
    positionContactDialog();
    document.getElementById("contact-name").focus({ preventScroll: true });
  }
  function closeContact(discard = false, restoreFocus = true, fromChrome = false) {
    if (!contactIsOpen) return;
    contactIsOpen = false;
    contactOverlay.hidden = true;
    document.body.classList.remove("contact-is-open");
    backgroundElements.forEach((element) => { element.inert = false; });
    if (discard) {
      clearContactDraft();
    } else {
      window.clearTimeout(draftTimer);
      draftExpiresAt = Date.now() + draftLifetime;
      draftTimer = window.setTimeout(expireDraftIfNeeded, draftLifetime);
    }
    if (fromChrome) requestAnimationFrame(updateHeader);
    else updateHeader();
    if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest("[inert]")) {
      previousFocus.focus({ preventScroll: true });
    }
  }
  document.querySelectorAll("[data-open-contact]").forEach((button) => button.addEventListener("click", openContact));
  document.querySelector("[data-close-contact]").addEventListener("click", () => closeContact());
  document.getElementById("delete-contact").addEventListener("click", () => closeContact(true));
  contactOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === contactOverlay) closeContact();
  });
  document.addEventListener("visibilitychange", expireDraftIfNeeded);
  window.addEventListener("pageshow", expireDraftIfNeeded);
  window.addEventListener("coaching:contact-sent", clearContactDraft);
  document.addEventListener("click", (event) => {
    if (!contactIsOpen || !(event.target instanceof Element)) return;
    const control = event.target.closest("a, button, input");
    if (!control || !(header.contains(control) || footer.contains(control))) return;
    if (control.matches("[data-open-contact], .menu-toggle, [aria-disabled='true'], [target='_blank']")) return;
    closeContact(false, false, true);
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (contactIsOpen) closeContact();
      else if (mobileNavigation && !mobileNavigation.hidden) { closeMenu(); menuToggle.focus(); }
      return;
    }
    if (!contactIsOpen || event.key !== "Tab") return;
    const selector = "button:not(:disabled):not([aria-disabled='true']), input:not(:disabled):not([tabindex='-1']), textarea:not(:disabled), select:not(:disabled), a[href]";
    const focusables = [header, contactPanel, footer].flatMap((area) => [...area.querySelectorAll(selector)]).filter((element) => {
      const rect = element.getBoundingClientRect();
      const reachable = contactPanel.contains(element) || (rect.bottom > 0 && rect.top < window.innerHeight);
      return rect.width > 0 && rect.height > 0 && reachable && !element.closest("[hidden], [inert]");
    });
    if (!focusables.length) return;
    const current = focusables.indexOf(document.activeElement);
    const next = event.shiftKey ? (current <= 0 ? focusables.length - 1 : current - 1) : (current + 1) % focusables.length;
    event.preventDefault();
    focusables[next].focus({ preventScroll: !contactPanel.contains(focusables[next]) });
  });

  // Scroll navigation, then exactly three one-second newsletter jumps.
  // A stable scroll position is observed before the cue starts. User scrolling
  // cancels the pending cue rather than triggering it at the wrong location.
  const newsletterCue = document.getElementById("newsletter-cue");
  let cueTimer = 0;
  let activeScroll = null;
  function hideNewsletterCue() {
    if (!newsletterCue) return;
    window.clearTimeout(cueTimer);
    newsletterCue.hidden = true;
    newsletterCue.classList.remove("is-jumping");
  }
  function showNewsletterCue() {
    if (!newsletterCue) return;
    hideNewsletterCue();
    positionNewsletterCue();
    newsletterCue.hidden = false;
    if (!reducedMotion.matches) newsletterCue.classList.add("is-jumping");
    cueTimer = window.setTimeout(hideNewsletterCue, 3_000);
  }
  function positionNewsletterCue() {
    if (!newsletterCue) return;
    const newsletter = document.getElementById("newsletter").getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const center = newsletter.left + newsletter.width * (mobile ? .76 : .5);
    newsletterCue.style.setProperty("--newsletter-cue-left", `${center - footerBounds.left}px`);
  }
  window.addEventListener("resize", positionNewsletterCue);
  newsletterCue?.addEventListener("animationend", hideNewsletterCue);

  function positionContactDialog() {
    if (!contactIsOpen) return;
    const footerBounds = footer.getBoundingClientRect();
    const footerVisible = Math.max(0, Math.min(window.innerHeight, footerBounds.bottom) - Math.max(0, footerBounds.top));
    const safeTop = header.offsetHeight + 16;
    const safeBottom = window.innerHeight - footerVisible - 16;
    const maximum = Math.max(180, safeBottom - safeTop);
    contactOverlay.style.setProperty("--contact-max-height", `${maximum}px`);
    const height = contactPanel.getBoundingClientRect().height;
    const centred = (window.innerHeight - height) / 2;
    const top = Math.max(safeTop, Math.min(centred, safeBottom - height));
    contactOverlay.style.setProperty("--contact-top", `${top}px`);
  }
  window.addEventListener("resize", positionContactDialog);
  new ResizeObserver(positionContactDialog).observe(contactPanel);

  function scrollAndWait(top, onSettled, slowSection = "") {
    if (activeScroll) activeScroll.abort();
    const operation = new AbortController();
    activeScroll = operation;
    hideNewsletterCue();
    const target = Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
    const startedAt = performance.now();
    let lastPosition = window.scrollY;
    let stableSince = startedAt;
    const cancel = () => operation.abort();
    window.addEventListener("wheel", cancel, { passive: true, signal: operation.signal });
    window.addEventListener("touchstart", cancel, { passive: true, signal: operation.signal });
    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancel();
    }, { signal: operation.signal });
    const initial = window.scrollY;
    const distance = Math.abs(target - initial);
    let duration = 0;
    if (!reducedMotion.matches && distance > 2) {
      if (slowSection === "newsletter") duration = Math.min(2300, 500 + distance * .35);
      if (slowSection === "who-i-coach") duration = 1350;
    }
    function observeScroll(now) {
      if (operation.signal.aborted) return;
      const position = window.scrollY;
      if (Math.abs(position - lastPosition) > 0.5) stableSince = now;
      lastPosition = position;
      if (Math.abs(position - target) <= 2 && now - stableSince >= 120) {
        operation.abort();
        activeScroll = null;
        if (onSettled) onSettled();
      } else if (now - startedAt < 8_000) {
        requestAnimationFrame(observeScroll);
      } else {
        operation.abort();
        activeScroll = null;
      }
    }
    if (duration) {
      function animateScroll(now) {
        if (operation.signal.aborted) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress < .5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
        window.scrollTo({ top: initial + (target - initial) * eased, behavior: "instant" });
        if (progress < 1) requestAnimationFrame(animateScroll);
        else { lastPosition = window.scrollY; stableSince = now; requestAnimationFrame(observeScroll); }
      }
      requestAnimationFrame(animateScroll);
    } else {
      window.scrollTo({ top: target, behavior: reducedMotion.matches ? "instant" : "smooth" });
      requestAnimationFrame(observeScroll);
    }
  }
  function goToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    closeMenu();
    let top = 0;
    if (id === "newsletter") {
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      const newsletterTop = target.getBoundingClientRect().top + window.scrollY;
      top = Math.min(bottom, newsletterTop - (isHome ? 16 : header.offsetHeight + 16));
    }
    else if (id !== "home") top = target.getBoundingClientRect().top + window.scrollY - header.offsetHeight - 30;
    scrollAndWait(top, () => {
      if (id === "newsletter") {
        target.focus({ preventScroll: true });
        showNewsletterCue();
      } else if (id !== "home") {
        target.focus({ preventScroll: true });
      } else {
        document.getElementById("main-content").focus({ preventScroll: true });
      }
    }, id);
  }
  document.querySelectorAll("[data-scroll]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const id = link.dataset.scroll;
      if (!document.getElementById(id)) return;
      event.preventDefault();
      goToSection(id);
    });
  });

  // Optional local images: paths are supplied once in site.config.js.
  document.querySelectorAll("[data-media]").forEach((slot) => {
    const media = slot.dataset.media === "portrait" ? settings.portrait : settings.coachingImages?.[Number(slot.dataset.mediaIndex)];
    if (!media?.src) return;
    const image = document.createElement("img");
    image.alt = media.alt || "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("load", () => {
      slot.classList.add("has-image");
      slot.removeAttribute("role");
      slot.removeAttribute("aria-label");
    });
    image.addEventListener("error", () => image.remove());
    image.src = media.src;
    slot.append(image);
  });

  const hero = document.querySelector(".hero");
  const video = document.getElementById("hero-video");
  const videoToggle = document.getElementById("video-toggle");
  if (hero && settings.heroPoster) {
    hero.style.setProperty("--hero-poster", `url(${JSON.stringify(settings.heroPoster)})`);
    hero.classList.add("has-poster", "has-media");
    video.poster = settings.heroPoster;
  }
  if (hero && settings.heroVideo) {
    video.hidden = false;
    video.muted = true;
    video.src = settings.heroVideo;
    const updateVideoButton = () => { videoToggle.textContent = video.paused ? "Play video" : "Pause video"; };
    video.addEventListener("loadeddata", () => {
      hero.classList.add("has-media");
      videoToggle.hidden = false;
      updateVideoButton();
    });
    video.addEventListener("play", updateVideoButton);
    video.addEventListener("pause", updateVideoButton);
    video.addEventListener("error", () => {
      video.hidden = true;
      videoToggle.hidden = true;
      if (!settings.heroPoster) hero.classList.remove("has-media");
    });
    videoToggle.addEventListener("click", () => {
      if (video.paused) video.play().catch(updateVideoButton);
      else video.pause();
    });
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) video.pause();
    });
    if (!reducedMotion.matches) video.play().catch(updateVideoButton);
  }

  function handleInitialHash() {
    const id = window.location.hash.slice(1);
    if (id === "newsletter" || (isHome && ["home", "who-i-coach", "how-i-coach"].includes(id))) goToSection(id);
    updateHeader();
  }
  if (document.readyState === "complete") handleInitialHash();
  else window.addEventListener("load", handleInitialHash, { once: true });
  updateHeader();
  window.CoachUI = {
    hideNewsletterCue() {
      // Typing can begin during the final settling frames. Cancel the pending
      // cue and its focus callback as well as an arrow that is already visible.
      activeScroll?.abort();
      activeScroll = null;
      hideNewsletterCue();
    },
    updateHeader
  };
})();
