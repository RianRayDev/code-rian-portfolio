(() => {
  const body = document.body;
  if (!body || !body.classList.contains("page-inner")) return;
  const main = document.querySelector("main");
  if (!main) return;

  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const isReduced = () => !!(mq && mq.matches);
  const hero = main.querySelector(":scope > section:first-child");
  const sections = Array.from(main.querySelectorAll(":scope > section")).filter((s) => s !== hero);
  const STAGGER = { step: 70, cap: 490 };
  const LAG = { max: 24, minWidth: 640, gain: 0.3, gainStep: 0.07, follow: 0.15, followStep: 0.017, depth: 5 };
  const LINKED = "[data-scroll-speed],[data-parallax],[data-lag],[data-scrub],[data-scroll-css],.rounded-wrap";
  const AUTO_LAG = "h2, .card, .plate, [data-lag-auto]";

  const staggerReveals = () => {
    const seen = new Set();
    document.querySelectorAll(".reveal").forEach((el) => {
      const parent = el.parentElement;
      if (!parent || seen.has(parent)) return;
      seen.add(parent);
      const group = Array.from(parent.children).filter((c) => c.classList.contains("reveal"));
      if (group.length < 2) return;
      group.forEach((item, i) => {
        if (item.style.getPropertyValue("--delay").trim()) return;
        item.style.setProperty("--delay", `${Math.min(i * STAGGER.step, STAGGER.cap)}ms`);
      });
    });
  };

  const animatesTransform = (cs) => {
    const props = cs.transitionProperty.split(",").map((p) => p.trim());
    const durations = cs.transitionDuration.split(",").map((d) => parseFloat(d) || 0);
    return props.some((p, i) => (p === "transform" || p === "all") && durations[i % durations.length] > 0);
  };

  const blocked = (el) => {
    if (hero && hero.contains(el)) return true;
    if (el.closest("[data-no-lag], nav, .menu-panel, [aria-hidden='true']")) return true;
    if (el.classList.contains("magnetic") || el.hasAttribute("data-parallax") || el.hasAttribute("data-scroll-speed")) return true;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "sticky" || cs.display === "contents") return true;
    return cs.transform !== "none" || animatesTransform(cs);
  };

  const tagParallax = () => {
    sections.forEach((section) => {
      section.querySelectorAll(".plate").forEach((plate) => {
        if (plate.hasAttribute("data-parallax-off")) return;
        const target = plate.querySelector(":scope > .plate__frame") || plate.querySelector(":scope > img, :scope > video, :scope > picture > img");
        if (!target || target.hasAttribute("data-parallax") || target.hasAttribute("data-scroll-speed")) return;
        target.setAttribute("data-parallax", "");
      });
    });
  };

  const tagLag = () => {
    document.querySelectorAll("[data-lag]").forEach((el) => {
      if (blocked(el)) el.removeAttribute("data-lag");
    });
    document.querySelectorAll("[data-lag]").forEach((el) => {
      if (el.parentElement && el.parentElement.closest("[data-lag]")) el.removeAttribute("data-lag");
    });
    sections.forEach((section) => {
      section.querySelectorAll(AUTO_LAG).forEach((el) => {
        if (el.hasAttribute("data-lag") || blocked(el)) return;
        if ((el.parentElement && el.parentElement.closest("[data-lag]")) || el.querySelector("[data-lag]")) return;
        el.setAttribute("data-lag", "");
      });
    });
    sections.forEach((section) => {
      if (section.matches(LINKED) || section.querySelector(LINKED)) return;
      const pool = Array.from(section.querySelectorAll(".container > *, .container > * > *"));
      const pick = pool.find((el) => !blocked(el) && !el.querySelector("[data-lag]") && !(el.parentElement && el.parentElement.closest("[data-lag]")));
      if (pick) pick.setAttribute("data-lag", "");
    });
  };

  const items = [];
  let enabled = false;
  let running = false;
  let lastY = null;
  let lastT = 0;

  const assignRows = () => {
    const byParent = new Map();
    items.forEach((it) => {
      const p = it.el.parentElement;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(it);
    });
    byParent.forEach((list) => {
      const sorted = list.map((it) => ({ it, top: it.el.offsetTop })).sort((a, b) => a.top - b.top);
      let row = -1;
      let rowTop = -Infinity;
      sorted.forEach(({ it, top }) => {
        if (top - rowTop > 2) {
          row += 1;
          rowTop = top;
        }
        const i = Math.min(row, LAG.depth);
        it.gain = LAG.gain + i * LAG.gainStep;
        it.follow = LAG.follow - i * LAG.followStep;
      });
    });
  };

  const clearAll = () => {
    items.forEach((it) => {
      if (it.off) it.el.style.transform = "";
      it.off = 0;
    });
  };

  const frame = (t) => {
    if (!enabled) {
      running = false;
      lastT = 0;
      return;
    }
    const dt = lastT ? Math.min(64, t - lastT) : 16.67;
    lastT = t;
    const y = window.scrollY;
    const d = lastY === null ? 0 : y - lastY;
    lastY = y;
    const jump = Math.abs(d) > window.innerHeight * 1.5;
    let busy = d !== 0;
    for (let k = 0; k < items.length; k += 1) {
      const it = items[k];
      if (!it.on) continue;
      let off = jump ? 0 : it.off + d * it.gain;
      if (off > LAG.max) off = LAG.max;
      else if (off < -LAG.max) off = -LAG.max;
      off -= off * (1 - Math.pow(1 - it.follow, dt / 16.67));
      if (Math.abs(off) < 0.05) off = 0;
      if (off !== it.off) {
        it.off = off;
        it.el.style.transform = off ? `translate3d(0, ${off.toFixed(2)}px, 0)` : "";
      }
      if (off) busy = true;
    }
    if (busy) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      lastT = 0;
    }
  };

  const wake = () => {
    if (!enabled || running) return;
    if (lastY === null) lastY = window.scrollY;
    running = true;
    requestAnimationFrame(frame);
  };

  const evaluate = () => {
    const want = items.length > 0 && !isReduced() && window.innerWidth >= LAG.minWidth;
    if (want) assignRows();
    if (want === enabled) return;
    enabled = want;
    lastY = window.scrollY;
    if (!enabled) clearAll();
  };

  const startLag = () => {
    document.querySelectorAll("[data-lag]").forEach((el) => {
      items.push({ el, off: 0, on: true, gain: LAG.gain, follow: LAG.follow });
    });
    if (!items.length) return;
    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const it = entry.target.__innerLag;
          if (!it) return;
          it.on = entry.isIntersecting;
          if (!it.on && it.off) {
            it.off = 0;
            it.el.style.transform = "";
          }
        });
      }, { rootMargin: "25% 0px 25% 0px" });
      items.forEach((it) => {
        it.el.__innerLag = it;
        near.observe(it.el);
      });
    }
    evaluate();
    let resizeQueued = false;
    window.addEventListener("resize", () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        evaluate();
      });
    });
    if (mq && mq.addEventListener) mq.addEventListener("change", evaluate);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("load", evaluate);
  };

  const revealSafety = () => {
    const pending = Array.from(document.querySelectorAll(".reveal:not(.is-in)"));
    pending.forEach((el) => {
      if (!el.getClientRects().length) el.classList.add("is-in");
    });
    if (isReduced() || !("IntersectionObserver" in window)) return;
    const tall = pending.filter((el) => !el.classList.contains("is-in") && el.offsetHeight > window.innerHeight * 0.85);
    if (!tall.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    tall.forEach((el) => io.observe(el));
  };

  const watchHero = () => {
    if (!hero || !hero.classList.contains("hero--inner") || !("ResizeObserver" in window)) return;
    let height = hero.offsetHeight;
    let queued = false;
    new ResizeObserver(() => {
      const next = hero.offsetHeight;
      if (Math.abs(next - height) < 2 || queued) return;
      height = next;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        window.dispatchEvent(new Event("resize"));
      });
    }).observe(hero);
  };

  const initCue = () => {
    document.querySelectorAll(".hero__cue").forEach((cue) => {
      cue.addEventListener("click", (e) => {
        const href = cue.getAttribute("href") || "";
        const target = href.length > 1 && href.startsWith("#") ? document.getElementById(href.slice(1)) : hero && hero.nextElementSibling;
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top, behavior: isReduced() ? "auto" : "smooth" });
      });
    });
  };

  staggerReveals();
  tagParallax();
  tagLag();

  const boot = () => {
    startLag();
    revealSafety();
    watchHero();
    initCue();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
