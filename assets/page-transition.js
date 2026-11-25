(() => {
  "use strict";

  const marker = "#_page-transition";
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const arrivalURL = new URL(location.href);
  const arriving = arrivalURL.hash === marker || arrivalURL.hash.startsWith(marker + "#");

  if (arriving) {
    // A fragment carries the transition across documents, including file URLs.
    arrivalURL.hash = arrivalURL.hash.slice(marker.length);
    history.replaceState(history.state, "", arrivalURL);
    if (!reducedMotion.matches) root.setAttribute("data-page-arriving", "");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const brand = document.querySelector("#site-header .brand-mark");
    root.removeAttribute("data-page-arriving");
    if (!brand) return;

    const cover = document.createElement("div");
    cover.className = "page-transition";
    cover.setAttribute("aria-hidden", "true");
    cover.hidden = true;
    cover.append(brand.cloneNode(true));
    document.body.append(cover);

    function resetCover() {
      cover.hidden = true;
      cover.classList.remove("is-arriving");
    }

    if (arriving && !reducedMotion.matches) {
      cover.classList.add("is-arriving");
      cover.hidden = false;
    }

    cover.addEventListener("animationend", (event) => {
      if (event.animationName === "page-cover-out") resetCover();
    });

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || reducedMotion.matches) return;
      const link = event.target instanceof Element && event.target.closest("a[href]");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      const current = new URL(location.href);
      if (destination.origin !== current.origin || destination.protocol !== current.protocol || destination.pathname === current.pathname) return;
      if (!destination.pathname.startsWith(new URL(".", current).pathname) || !destination.pathname.endsWith(".html")) return;

      event.preventDefault();
      if (!cover.hidden) return;
      cover.hidden = false;
      destination.hash = marker + destination.hash;
      window.setTimeout(() => location.assign(destination.href), 1000);
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) resetCover();
    });
  });
})();
