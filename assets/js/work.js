(() => {
  const roots = Array.from(document.querySelectorAll("[data-tcar]"));
  if (!roots.length) return;
  const START = 6;

  const setup = (root) => {
    const viewport = root.querySelector(".tcar__viewport");
    const track = root.querySelector(".tcar__track");
    const slides = Array.from(root.querySelectorAll(".tcar__slide"));
    const prev = root.querySelector(".tcar__prev");
    const next = root.querySelector(".tcar__next");
    const dots = Array.from(root.querySelectorAll(".tcar__dot"));
    const label = root.querySelector(".tcar__label");
    const status = root.querySelector(".tcar__status");
    const last = slides.length - 1;
    if (!viewport || !track || last < 1) return;
    let index = 0;
    let drag = null;
    let warmed = false;

    const warm = () => {
      if (warmed) return;
      warmed = true;
      slides.forEach((slide) => {
        slide.querySelectorAll("img").forEach((img) => {
          const pre = new Image();
          pre.decoding = "async";
          pre.src = img.currentSrc || img.src;
        });
      });
    };

    const paint = (announce) => {
      track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
      slides.forEach((slide, i) => slide.setAttribute("aria-hidden", i === index ? "false" : "true"));
      dots.forEach((dot, i) => {
        const on = i === index;
        if (on) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
        dot.tabIndex = on ? 0 : -1;
      });
      if (prev) prev.setAttribute("aria-disabled", index === 0 ? "true" : "false");
      if (next) next.setAttribute("aria-disabled", index === last ? "true" : "false");
      const text = slides[index].getAttribute("data-label") || "";
      if (label) {
        label.textContent = text;
        label.hidden = !text;
      }
      if (announce && status) {
        status.textContent = `Screenshot ${index + 1} of ${last + 1}${text ? `, ${text}` : ""}`;
      }
    };

    const go = (target, announce) => {
      const n = Math.max(0, Math.min(last, target));
      const changed = n !== index;
      index = n;
      paint(announce && changed);
    };

    if (prev) prev.addEventListener("click", () => go(index - 1, true));
    if (next) next.addEventListener("click", () => go(index + 1, true));
    dots.forEach((dot, i) => dot.addEventListener("click", () => go(i, true)));

    root.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      let target = null;
      if (event.key === "ArrowRight") target = index + 1;
      else if (event.key === "ArrowLeft") target = index - 1;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = last;
      if (target === null) return;
      event.preventDefault();
      go(target, true);
      if (dots.includes(document.activeElement)) dots[index].focus();
    });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      warm();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, live: false, w: viewport.clientWidth };
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.live) {
        if (Math.abs(dx) < START && Math.abs(dy) < START) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag = null;
          return;
        }
        drag.live = true;
        track.classList.add("is-dragging");
        if (event.pointerType === "mouse" && viewport.setPointerCapture) {
          try {
            viewport.setPointerCapture(event.pointerId);
          } catch (error) {
            drag.captured = false;
          }
        }
      }
      drag.dx = dx;
      const edge = (index === 0 && dx > 0) || (index === last && dx < 0);
      const shift = edge ? dx * 0.3 : dx;
      track.style.transform = `translate3d(calc(${-index * 100}% + ${shift}px), 0, 0)`;
    });

    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const held = drag;
      drag = null;
      track.classList.remove("is-dragging");
      if (!held.live) return;
      const limit = Math.min(80, held.w * 0.15);
      let target = index;
      if (held.dx <= -limit) target = index + 1;
      else if (held.dx >= limit) target = index - 1;
      go(target, true);
    };

    viewport.addEventListener("pointerup", finish);
    viewport.addEventListener("pointercancel", finish);

    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          warm();
          near.disconnect();
        }
      }, { rootMargin: "900px 0px" });
      near.observe(root);
    } else {
      warm();
    }

    paint(false);
  };

  roots.forEach(setup);

  const touch = window.matchMedia("(max-width: 700px), (pointer: coarse)");
  const sync = () => {
    roots.forEach((root) => {
      const wrap = root.querySelector(".tcar__dots");
      if (wrap) wrap.inert = touch.matches;
    });
  };
  sync();
  if (touch.addEventListener) touch.addEventListener("change", sync);
})();
