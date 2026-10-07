(() => {
  "use strict";

  const still = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const chips = Array.from(document.querySelectorAll("[data-wf-jump]"));
  if (!chips.length) return;

  const targetOf = (chip) => {
    const id = (chip.getAttribute("href") || "").slice(1);
    return id ? document.getElementById(id) : null;
  };

  chips.forEach((chip) => {
    chip.addEventListener("click", (event) => {
      const target = targetOf(chip);
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: still && still.matches ? "auto" : "smooth" });
      if (history.replaceState) history.replaceState(null, "", "#" + target.id);
    });
  });

  const groups = chips.map(targetOf).filter(Boolean);
  let queued = false;

  const mark = () => {
    queued = false;
    const line = window.innerHeight * 0.4;
    let active = null;
    groups.forEach((group) => {
      const box = group.getBoundingClientRect();
      if (box.top <= line && box.bottom > line) active = group;
    });
    chips.forEach((chip) => {
      if (active && targetOf(chip) === active) chip.setAttribute("aria-current", "location");
      else chip.removeAttribute("aria-current");
    });
  };

  const queue = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(mark);
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  mark();
})();
