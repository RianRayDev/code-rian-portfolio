/* work-ts.js, work.html only.
   Smooth scroll for the in page jump links. Everything else on this page
   (reveals, counting numbers, hover) comes from ts.js and work-ts.css. */
(() => {
  "use strict";

  const still = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  document.querySelectorAll("a[data-work-jump]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = (link.getAttribute("href") || "").slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: still && still.matches ? "auto" : "smooth" });
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    });
  });
})();
