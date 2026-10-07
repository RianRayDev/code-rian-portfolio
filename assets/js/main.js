(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const params = new URLSearchParams(window.location.search);
  let seen = false;
  try {
    seen = sessionStorage.getItem("rian-preloader") === "1";
  } catch (e) {
    seen = false;
  }
  const skipPreload = reduced || seen || params.get("noload") === "1";
  if (skipPreload) root.classList.add("no-preload");

  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const lerp = (a, b, t) => a + (b - a) * t;

  let lenis = null;

  const initScroll = () => {
    const hasGsap = typeof window.gsap !== "undefined";
    const hasST = hasGsap && typeof window.ScrollTrigger !== "undefined";
    if (hasST) gsap.registerPlugin(ScrollTrigger);

    if (!reduced && typeof window.Lenis !== "undefined") {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (hasGsap) {
        if (hasST) lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (time) => {
          lenis.raf(time);
          requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
      }
    }

    if (hasST && !reduced) {
      document.querySelectorAll("[data-scroll-speed]").forEach((el) => {
        const speed = parseFloat(el.dataset.scrollSpeed) || 0;
        const trigger = el.closest("section") || el;
        gsap.to(el, {
          yPercent: speed * 10,
          ease: "none",
          scrollTrigger: { trigger, start: "top top", end: "bottom top", scrub: true }
        });
      });

      document.querySelectorAll("[data-parallax]").forEach((el) => {
        gsap.fromTo(el, { yPercent: -6 }, {
          yPercent: 6,
          ease: "none",
          scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true }
        });
      });

      document.querySelectorAll(".rounded-wrap").forEach((el) => {
        gsap.fromTo(el, { height: "10vh" }, {
          height: "0vh",
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
        });
      });

      document.querySelectorAll(".hero__curve").forEach((el) => {
        gsap.fromTo(el, { height: "0vh" }, {
          height: "12vh",
          ease: "none",
          scrollTrigger: { trigger: el.closest(".hero"), start: "top top", end: "bottom top", scrub: true }
        });
      });
    }

    if (!reduced && !touch) {
      let blur = 0;
      let target = 0;
      let running = false;
      let lastY = lenis ? lenis.scroll : window.scrollY;
      const step = () => {
        target = lerp(target, 0, 0.12);
        blur = lerp(blur, target, 0.25);
        if (blur < 0.05 && target < 0.05) {
          blur = 0;
          root.style.setProperty("--curve-blur", "0px");
          running = false;
          return;
        }
        root.style.setProperty("--curve-blur", `${blur.toFixed(2)}px`);
        requestAnimationFrame(step);
      };
      const onScroll = () => {
        const y = lenis ? lenis.scroll : window.scrollY;
        const dy = Math.abs(y - lastY);
        lastY = y;
        target = Math.min(14, Math.max(target, dy * 0.22));
        if (!running) {
          running = true;
          requestAnimationFrame(step);
        }
      };
      if (lenis) lenis.on("scroll", onScroll);
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  };

  const initProgress = () => {
    const bar = document.querySelector(".progress");
    if (!bar) return;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = lenis ? lenis.scroll : window.scrollY;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    if (lenis) lenis.on("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  };

  const initReveal = () => {
    const items = document.querySelectorAll(".reveal, .stripe");
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    items.forEach((el) => io.observe(el));
  };

  const initMagnetic = () => {
    if (reduced || isTouch) return;
    document.querySelectorAll(".magnetic").forEach((el) => {
      const strength = parseFloat(el.dataset.strength) || 25;
      const strengthText = parseFloat(el.dataset.strengthText) || 12;
      const text = el.querySelector(".btn-round__text, .btn-pill__text, .menu-btn__lines");
      const hasGsap = typeof window.gsap !== "undefined";
      const move = (target, x, y, duration) => {
        if (!target) return;
        if (hasGsap) {
          gsap.to(target, { x, y, duration, ease: duration > 1 ? "elastic.out(1, 0.3)" : "power4.out" });
        } else {
          target.style.transition = `transform ${duration}s cubic-bezier(.7,0,.3,1)`;
          target.style.transform = `translate(${x}px, ${y}px)`;
        }
      };
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        move(el, dx * strength * 2, dy * strength * 2, 1);
        move(text, dx * strengthText * 2, dy * strengthText * 2, 1);
      });
      el.addEventListener("mouseleave", () => {
        move(el, 0, 0, 1.5);
        move(text, 0, 0, 1.5);
      });
    });
  };

  const initMenu = () => {
    const btn = document.querySelector(".menu-btn");
    const panel = document.querySelector(".menu-panel");
    const overlay = document.querySelector(".menu-overlay");
    if (!btn || !panel) return;
    const staggered = panel.querySelectorAll(".menu-panel__label, .menu-panel .stripe, .menu-panel__links li, .menu-panel__socials li");
    staggered.forEach((el, i) => {
      el.setAttribute("data-mi", "");
      el.style.setProperty("--mi", String(i));
    });
    const setOpen = (open) => {
      root.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      panel.inert = !open;
      panel.setAttribute("aria-hidden", String(!open));
      if (lenis) {
        if (open) lenis.stop();
        else lenis.start();
      }
    };
    setOpen(false);
    btn.addEventListener("click", () => setOpen(!root.classList.contains("menu-open")));
    if (overlay) overlay.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    const onScroll = () => {
      const y = lenis ? lenis.scroll : window.scrollY;
      btn.classList.toggle("is-visible", y > 100);
    };
    if (lenis) lenis.on("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  };

  const initMarquee = () => {
    const track = document.querySelector(".hero__marquee-track");
    const hero = document.querySelector(".hero");
    if (!track || !hero || reduced) return;
    const base = 1.6;
    let x = 0;
    let dir = 1;
    let boost = 0;
    let half = 0;
    let inView = true;
    let running = false;
    let lastY = lenis ? lenis.scroll : window.scrollY;
    const measure = () => {
      half = track.scrollWidth / 2;
    };
    const onScroll = () => {
      const y = lenis ? lenis.scroll : window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (dy > 0.5) dir = 1;
      else if (dy < -0.5) dir = -1;
      boost = Math.min(18, boost + Math.abs(dy) * 0.12);
    };
    const frame = () => {
      if (!inView || document.hidden) {
        running = false;
        return;
      }
      boost = lerp(boost, 0, 0.06);
      x -= dir * (base + boost);
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      track.style.transform = `translate3d(${x}px, 0, 0)`;
      requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };
    measure();
    window.addEventListener("resize", measure);
    if (lenis) lenis.on("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) start();
    });
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
        if (inView) start();
      }, { threshold: 0 });
      io.observe(hero);
    }
    start();
  };

  const initDots = () => {
    const canvas = document.querySelector(".hero__dots");
    const hero = document.querySelector(".hero");
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    const gap = 28;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let running = false;
    let inView = true;
    const mouse = { x: -9999, y: -9999 };
    const ripples = [];
    const resize = () => {
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / gap) + 1;
      rows = Math.ceil(h / gap) + 1;
      draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      const offX = (w % gap) / 2;
      const offY = (h % gap) / 2;
      let live = false;
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        if (now - ripples[i].t > 900) ripples.splice(i, 1);
      }
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = offX + c * gap;
          const y = offY + r * gap;
          const dx = x - mouse.x;
          const dy = y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          let lift = Math.max(0, 1 - d / 140);
          lift = lift * lift;
          for (const rp of ripples) {
            const age = (now - rp.t) / 900;
            const radius = age * 320;
            const rd = Math.abs(Math.sqrt((x - rp.x) ** 2 + (y - rp.y) ** 2) - radius);
            const ring = Math.max(0, 1 - rd / 34) * (1 - age);
            if (ring > lift) lift = ring;
            live = true;
          }
          const alpha = 0.16 + lift * 0.6;
          const size = 1.1 + lift * 1.9;
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return live;
    };
    const frame = () => {
      const live = draw();
      if (!live || !inView || document.hidden) {
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    const wake = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };
    hero.addEventListener("mousemove", (e) => {
      const b = hero.getBoundingClientRect();
      mouse.x = e.clientX - b.left;
      mouse.y = e.clientY - b.top;
      if (!running) requestAnimationFrame(draw);
    });
    hero.addEventListener("mouseleave", () => {
      mouse.x = -9999;
      mouse.y = -9999;
      requestAnimationFrame(draw);
    });
    hero.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, button")) return;
      const b = hero.getBoundingClientRect();
      ripples.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() });
      wake();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(hero);
    }
    window.addEventListener("resize", resize);
    resize();
  };

  const initVignette = () => {
    const hero = document.querySelector(".hero");
    if (!hero || !document.querySelector(".hero__vignette")) return;
    let last = -1;
    const update = () => {
      const y = lenis ? lenis.scroll : window.scrollY;
      const span = Math.max(1, hero.offsetHeight * 0.75);
      const v = Math.min(1, Math.max(0, y / span));
      const rounded = Math.round(v * 200) / 200;
      if (rounded === last) return;
      last = rounded;
      hero.style.setProperty("--vig", String(rounded));
    };
    if (lenis) lenis.on("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  };

  const initStory = () => {
    const section = document.querySelector("[data-story]");
    if (!section || reduced) return;
    const viewport = section.querySelector(".story__viewport");
    const track = section.querySelector(".story__track");
    const slides = Array.from(track.querySelectorAll(".story__slide"));
    const layers = section.querySelectorAll(".story__bg-layer");
    const navBtns = Array.from(section.querySelectorAll("[data-go]"));
    const counter = section.querySelector("[data-story-current]");
    const headEl = section.querySelector(".story__head");
    if (!slides.length) return;
    let x = 0;
    let target = 0;
    let active = 0;
    let layerOn = 0;
    let running = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;
    let scrollP = 0;
    const gap = () => parseFloat(getComputedStyle(track).gap) || 0;
    const step = () => slides[0].getBoundingClientRect().width + gap();
    const maxX = () => step() * (slides.length - 1);
    const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
    const range = () => Math.max(1, section.offsetHeight - window.innerHeight);
    const top = () => section.getBoundingClientRect().top + scrollY();
    const measure = () => {
      if (!headEl) return;
      const rect = headEl.getBoundingClientRect();
      const cs = getComputedStyle(headEl);
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      const left = rect.left + padLeft;
      const width = rect.width - padLeft - padRight;
      section.style.setProperty("--story-pad", `${left}px`);
      section.style.setProperty("--story-slide-w", `${width}px`);
    };
    const setBg = (i) => {
      const src = slides[i].dataset.bg;
      if (!src) return;
      const next = layerOn === 0 ? 1 : 0;
      layers[next].style.backgroundImage = `url("${src}")`;
      layers[next].classList.add("is-on");
      layers[layerOn].classList.remove("is-on");
      layerOn = next;
    };
    layers[0].style.backgroundImage = `url("${slides[0].dataset.bg}")`;
    const setActive = (i) => {
      if (i === active) return;
      active = i;
      slides.forEach((s, k) => s.classList.toggle("is-active", k === i));
      navBtns.forEach((b, k) => b.classList.toggle("is-active", k === i));
      if (counter) counter.textContent = String(i + 1).padStart(2, "0");
      setBg(i);
    };
    const render = () => {
      const s = step();
      track.style.transform = `translate3d(${-x}px, 0, 0)`;
      slides.forEach((slide, k) => {
        const offset = Math.max(-1, Math.min(1, (k * s - x) / s));
        const media = slide.querySelector(".story__media");
        const img = slide.querySelector(".story__img");
        const caption = slide.querySelector(".story__caption");
        if (media && img) {
          const mw = media.clientWidth;
          const mh = media.clientHeight;
          const maxOffX = mw * 0.13 * 0.8;
          const maxOffY = mh * 0.08 * 0.8;
          const px = offset * maxOffX;
          const py = (scrollP - 0.5) * 2 * maxOffY;
          const scale = 1 + Math.min(1, Math.abs(offset)) * 0.05;
          img.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
          if (caption) caption.style.transform = `translate3d(${(offset * mw * 0.03).toFixed(2)}px, 0, 0)`;
        }
      });
      layers.forEach((l) => l.style.setProperty("--bg-x", `${(-x * 0.02).toFixed(2)}px`));
      setActive(Math.round(Math.max(0, Math.min(slides.length - 1, x / s))));
    };
    const frame = () => {
      x = lerp(x, target, dragging ? 0.4 : 0.12);
      render();
      if (Math.abs(target - x) < 0.1) {
        x = target;
        render();
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    const wake = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };
    const fromScroll = () => {
      const p = Math.max(0, Math.min(1, (scrollY() - top()) / range()));
      scrollP = p;
      target = p * maxX();
      wake();
    };
    const scrollToX = (px, immediate) => {
      const p = Math.max(0, Math.min(1, px / maxX()));
      const y = top() + p * range();
      if (lenis) lenis.scrollTo(y, { immediate: !!immediate, duration: immediate ? 0 : 1.1 });
      else window.scrollTo({ top: y, behavior: immediate ? "auto" : "smooth" });
    };
    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startScroll = scrollY();
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      moved += Math.abs(e.movementX || 0);
      const dx = e.clientX - startX;
      const y = startScroll - dx * (range() / maxX()) * 1.1;
      if (lenis) lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
      fromScroll();
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove("is-dragging");
      const idx = Math.round(target / step());
      scrollToX(idx * step(), false);
    };
    viewport.addEventListener("pointerup", release);
    viewport.addEventListener("pointercancel", release);
    viewport.addEventListener("click", (e) => {
      if (moved > 6) e.preventDefault();
    }, true);
    viewport.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const y = scrollY() + e.deltaX * (range() / maxX());
      if (lenis) lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
      fromScroll();
    }, { passive: false });
    navBtns.forEach((b) => b.addEventListener("click", () => scrollToX(parseInt(b.dataset.go, 10) * step(), false)));
    if (lenis) lenis.on("scroll", fromScroll);
    window.addEventListener("scroll", fromScroll, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      fromScroll();
    });
    measure();
    fromScroll();
  };

  const initHoverList = () => {
    const list = document.querySelector(".work-list");
    const preview = document.querySelector(".hover-preview");
    const cursor = document.querySelector(".hover-cursor");
    if (!list || !preview || isTouch) return;
    const track = preview.querySelector(".hover-preview__track");
    const videos = preview.querySelectorAll("video");
    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const img = { x: mouse.x, y: mouse.y };
    const cur = { x: mouse.x, y: mouse.y };
    let running = false;
    let active = false;

    const loop = () => {
      img.x = lerp(img.x, mouse.x, 0.08);
      img.y = lerp(img.y, mouse.y, 0.08);
      cur.x = lerp(cur.x, mouse.x, 0.16);
      cur.y = lerp(cur.y, mouse.y, 0.16);
      preview.style.left = `${img.x}px`;
      preview.style.top = `${img.y}px`;
      if (cursor) {
        cursor.style.left = `${cur.x}px`;
        cursor.style.top = `${cur.y}px`;
      }
      const settled = !active && Math.abs(img.x - mouse.x) < 0.5 && Math.abs(img.y - mouse.y) < 0.5;
      if (settled) {
        running = false;
        return;
      }
      requestAnimationFrame(loop);
    };
    const start = () => {
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    };

    window.addEventListener("mousemove", (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (active) start();
    });

    list.querySelectorAll(".work-row").forEach((row, index) => {
      row.addEventListener("mouseenter", (e) => {
        if (!active) {
          mouse.x = e.clientX;
          mouse.y = e.clientY;
          img.x = mouse.x;
          img.y = mouse.y;
          cur.x = mouse.x;
          cur.y = mouse.y;
        }
        active = true;
        preview.classList.add("is-active");
        if (cursor) cursor.classList.add("is-active");
        track.style.transform = `translateY(${index * -100}%)`;
        videos.forEach((v, i) => {
          if (i === index) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          } else {
            v.pause();
          }
        });
        start();
      });
    });

    list.addEventListener("mouseleave", () => {
      active = false;
      preview.classList.remove("is-active");
      if (cursor) cursor.classList.remove("is-active");
      videos.forEach((v) => v.pause());
    });
  };

  const initTileVideos = () => {
    const tiles = document.querySelectorAll(".tile");
    if (!tiles.length) return;
    const play = (v) => {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    if (isTouch || window.matchMedia("(max-width: 800px)").matches) {
      if (!("IntersectionObserver" in window)) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const v = entry.target;
          if (entry.isIntersecting && v.offsetParent !== null && !reduced) play(v);
          else v.pause();
        });
      }, { threshold: 0.5 });
      tiles.forEach((t) => {
        const v = t.querySelector("video");
        if (v) io.observe(v);
      });
      return;
    }
    tiles.forEach((t) => {
      const v = t.querySelector("video");
      if (!v) return;
      t.addEventListener("mouseenter", () => play(v));
      t.addEventListener("mouseleave", () => v.pause());
    });
  };

  const initCopy = () => {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      const label = btn.querySelector(".btn-pill__text");
      const original = label ? label.textContent : "";
      btn.addEventListener("click", async () => {
        const value = btn.dataset.copy;
        let ok = false;
        try {
          await navigator.clipboard.writeText(value);
          ok = true;
        } catch (e) {
          const area = document.createElement("textarea");
          area.value = value;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          try {
            ok = document.execCommand("copy");
          } catch (err) {
            ok = false;
          }
          area.remove();
        }
        if (label) {
          label.textContent = ok ? "Copied" : value;
          setTimeout(() => {
            label.textContent = original;
          }, 1500);
        }
      });
    });
  };

  const initClock = () => {
    const clocks = document.querySelectorAll("[data-clock]");
    if (!clocks.length) return;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    const tick = () => {
      const text = `${fmt.format(new Date())} GMT+8`;
      clocks.forEach((c) => {
        if (c.textContent !== text) c.textContent = text;
      });
    };
    tick();
    setInterval(tick, 1000);
  };

  const initForm = () => {
    const form = document.querySelector("[data-mail-form]");
    if (!form) return;
    const status = form.querySelector(".form__status");
    const linkedin = "https://linkedin.com/in/rian-ray-de-asis-84b869264";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const email = String(data.get("email") || "").trim();
      const message = String(data.get("message") || "").trim();
      const composed = `${message}\n\n${name}\n${email}`;
      try {
        await navigator.clipboard.writeText(composed);
      } catch (err) {
        const area = document.createElement("textarea");
        area.value = composed;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
        } catch (copyErr) {
          copyErr;
        }
        area.remove();
      }
      window.open(linkedin, "_blank", "noopener");
      if (status) status.textContent = "Message copied. Paste it on LinkedIn.";
    });
  };

  const tiltButton = (btn) => {
    if (reduced || isTouch || btn.querySelector(".btn-round__tilt")) return;
    const wrap = document.createElement("span");
    wrap.className = "btn-round__tilt";
    while (btn.firstChild) wrap.appendChild(btn.firstChild);
    btn.appendChild(wrap);
    const sheen = document.createElement("span");
    sheen.className = "btn-round__sheen";
    sheen.setAttribute("aria-hidden", "true");
    wrap.appendChild(sheen);
    const setTilt = (rx, ry) => {
      wrap.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      sheen.style.setProperty("--mx", `${px * 100}%`);
      sheen.style.setProperty("--my", `${py * 100}%`);
      btn.classList.add("is-tilting");
      setTilt((0.5 - py) * 26, (px - 0.5) * 26);
    });
    btn.addEventListener("mouseleave", () => {
      btn.classList.remove("is-tilting");
      setTilt(0, 0);
    });
  };

  const initTilt = () => {
    document.querySelectorAll(".btn-round--blue").forEach((btn) => {
      if (!btn.closest(".contact")) tiltButton(btn);
    });
  };

  const initBackToTop = () => {
    document.querySelectorAll(".contact__arrow").forEach((arrow) => {
      arrow.setAttribute("role", "button");
      arrow.setAttribute("tabindex", "0");
      arrow.setAttribute("aria-label", "Back to top");
      const go = () => {
        if (lenis) lenis.scrollTo(0);
        else window.scrollTo({ top: 0, behavior: "smooth" });
      };
      arrow.addEventListener("click", go);
      arrow.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    });
  };

  const spinAvatar = (avatar) => {
    const title = avatar.closest(".contact__title");
    if (reduced || !title) return;
    let angle = 0;
    let speed = 0;
    let targetSpeed = 0;
    let running = false;
    const frame = () => {
      speed = lerp(speed, targetSpeed, 0.06);
      angle += speed;
      avatar.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      if (targetSpeed === 0 && speed < 0.02) {
        speed = 0;
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!running) {
        running = true;
        requestAnimationFrame(frame);
      }
    };
    title.addEventListener("mouseenter", () => {
      targetSpeed = 6;
      wake();
    });
    title.addEventListener("mouseleave", () => {
      targetSpeed = 0;
      wake();
    });
  };

  const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  let threePromise = null;

  const loadThree = () => {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = THREE_SRC;
      script.async = true;
      script.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error("three.js missing")));
      script.onerror = () => reject(new Error("three.js failed to load"));
      document.head.appendChild(script);
    });
    return threePromise;
  };

  const hasWebGL = () => {
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") || probe.getContext("webgl");
      if (!gl) return false;
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  };

  const makeTicker = () => {
    const items = new Set();
    let running = false;
    let last = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      let live = false;
      items.forEach((item) => {
        if (!item.visible()) return;
        item.tick(dt, now / 1000);
        live = true;
      });
      if (!live || document.hidden) {
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    const wake = () => {
      if (running || document.hidden) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", wake);
    return {
      add: (item) => {
        items.add(item);
        wake();
      },
      wake
    };
  };

  const watchVisible = (el, ticker) => {
    const state = { on: true };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        state.on = entries[0].isIntersecting;
        if (state.on) ticker.wake();
      }, { threshold: 0 }).observe(el);
    }
    return state;
  };

  const makeRenderer = (THREE, canvas) => {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    return renderer;
  };

  const fitRenderer = (renderer, el, onFit) => {
    const fit = () => {
      const w = Math.max(1, Math.round(el.clientWidth));
      const h = Math.max(1, Math.round(el.clientHeight));
      renderer.setSize(w, h, false);
      if (onFit) onFit(w);
    };
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(el);
    else window.addEventListener("resize", fit);
  };

  const makeCoin = (THREE, avatar, ticker) => {
    const title = avatar.closest(".contact__title");
    const img = avatar.querySelector("img");
    const section = avatar.closest("section") || avatar;
    const canvas = document.createElement("canvas");
    canvas.className = "avatar__coin";
    canvas.setAttribute("aria-hidden", "true");
    avatar.appendChild(canvas);
    const renderer = makeRenderer(THREE, canvas);
    fitRenderer(renderer, avatar);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    const radius = 1;
    const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.12, 64, 1);
    geo.rotateX(Math.PI / 2);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      const nz = nor.getZ(i);
      if (Math.abs(nz) > 0.5) {
        const x = nz > 0 ? pos.getX(i) : -pos.getX(i);
        uv.setXY(i, x / (2 * radius) + 0.5, pos.getY(i) / (2 * radius) + 0.5);
      }
    }
    uv.needsUpdate = true;
    const tex = new THREE.TextureLoader().load(img.currentSrc || img.src, () => {
      renderer.render(scene, camera);
      avatar.classList.add("is-3d");
      ticker.wake();
    });
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.repeat.set(0.4167, 0.4167);
    tex.offset.set(0.296, 0.483);
    const teal = new THREE.Color("#67A6B6").convertSRGBToLinear();
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 });
    const rim = new THREE.MeshStandardMaterial({ color: teal, metalness: 0.6, roughness: 0.35 });
    const coin = new THREE.Mesh(geo, [rim, face, face]);
    scene.add(coin);
    const ghostBase = [0.34, 0.2, 0.1];
    const ghosts = ghostBase.map((base) => {
      const mats = [rim.clone(), face.clone(), face.clone()];
      mats.forEach((m) => {
        m.transparent = true;
        m.depthWrite = false;
        m.opacity = 0;
      });
      const mesh = new THREE.Mesh(geo, mats);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      return { mesh, mats, base };
    });
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(2.4, 1.8, 2.2);
    scene.add(key);
    const TAU = Math.PI * 2;
    const maxSpeed = TAU / 0.9;
    let rot = 0;
    let speed = 0;
    let hover = false;
    let settle = null;
    let lastRot = "";
    const wrapDeg = (r) => {
      const d = ((r * 180) / Math.PI) % 360;
      return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
    };
    title.addEventListener("mouseenter", () => {
      hover = true;
      settle = null;
      ticker.wake();
    });
    title.addEventListener("mouseleave", () => {
      hover = false;
      const base = speed < 1.5 ? Math.round(rot / TAU) : Math.ceil((rot + speed * 0.25) / TAU);
      const to = base * TAU;
      const dur = Math.min(2.2, Math.max(0.6, (Math.abs(to - rot) * 2) / Math.max(speed, 0.5)));
      settle = { from: rot, to, v0: speed, dur, t: 0 };
      ticker.wake();
    });
    const vis = watchVisible(section, ticker);
    const tick = (dt, t) => {
      if (hover) {
        speed = lerp(speed, maxSpeed, 1 - Math.exp(-dt * 2.4));
        rot += speed * dt;
      } else if (settle) {
        settle.t += dt;
        const u = Math.min(1, settle.t / settle.dur);
        const u2 = u * u;
        const u3 = u2 * u;
        const next = (2 * u3 - 3 * u2 + 1) * settle.from + (u3 - 2 * u2 + u) * settle.dur * settle.v0 + (-2 * u3 + 3 * u2) * settle.to;
        speed = dt > 0 ? (next - rot) / dt : 0;
        rot = next;
        if (u >= 1) {
          rot = 0;
          speed = 0;
          settle = null;
        }
      }
      const swayY = Math.sin(t * 0.7) * 0.055;
      const swayX = Math.sin(t * 0.53) * 0.035;
      coin.rotation.set(swayX, rot + swayY, 0);
      const blur = Math.min(1, Math.abs(speed) / maxSpeed);
      ghosts.forEach((g, k) => {
        const o = g.base * blur;
        g.mesh.visible = o > 0.01;
        g.mats.forEach((m) => {
          m.opacity = o;
        });
        g.mesh.rotation.set(swayX, rot + swayY - speed * 0.018 * (k + 1), 0);
      });
      renderer.render(scene, camera);
      const r = wrapDeg(rot + swayY).toFixed(1);
      if (r !== lastRot) {
        lastRot = r;
        canvas.dataset.rot = r;
        canvas.dataset.speed = speed.toFixed(2);
      }
    };
    ticker.add({ visible: () => vis.on && avatar.classList.contains("is-3d"), tick });
  };

  const NOISE_GLSL = `
uniform float uTime;
uniform float uAmp;
vec4 nzPerm(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float nzSnoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = nzPerm(nzPerm(nzPerm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * vec3(2.0, 0.5, 1.0) - vec3(0.0, 1.0, 0.0);
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec3 nzDisplace(vec3 p) {
  vec3 n = normalize(p);
  float d = nzSnoise(n * 1.2 + vec3(uTime * 0.6, uTime * 0.4, -uTime * 0.5)) * 0.8 + nzSnoise(n * 2.2 - vec3(uTime * 0.3)) * 0.2;
  return n * (1.0 + d * uAmp);
}
`;

  const makeOrb = (THREE, btn, ticker) => {
    const section = btn.closest("section") || btn;
    const canvas = document.createElement("canvas");
    canvas.className = "btn-round__orb";
    canvas.setAttribute("aria-hidden", "true");
    btn.insertBefore(canvas, btn.firstChild);
    const renderer = makeRenderer(THREE, canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    fitRenderer(renderer, btn, (w) => {
      camera.position.z = w < 170 ? 4.25 : 4.9;
    });
    const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.035 } };
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#67A6B6").convertSRGBToLinear(),
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.1
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uAmp = uniforms.uAmp;
      shader.vertexShader = NOISE_GLSL + shader.vertexShader
        .replace("#include <beginnormal_vertex>", `
vec3 nzP0 = nzDisplace(position);
vec3 nzN = normalize(position);
vec3 nzT = normalize(cross(nzN, abs(nzN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
vec3 nzB = cross(nzN, nzT);
vec3 nzPa = nzDisplace(nzN + nzT * 0.01);
vec3 nzPb = nzDisplace(nzN + nzB * 0.01);
vec3 objectNormal = normalize(cross(nzPa - nzP0, nzPb - nzP0));
`)
        .replace("#include <begin_vertex>", "vec3 transformed = nzP0;");
    };
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 28), mat);
    scene.add(orb);
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const key = new THREE.DirectionalLight(0xfff2e2, 1.05);
    key.position.set(-2, 2.6, 3);
    scene.add(key);
    const rimLight = new THREE.DirectionalLight(0x67a6b6, 2.6);
    rimLight.position.set(2.8, -1.6, -2.4);
    scene.add(rimLight);
    let hover = false;
    let amp = 0.035;
    let flow = 0.35;
    let scale = 1;
    let rx = 0;
    let ry = 0;
    let tx = 0;
    let ty = 0;
    let pulse = -1;
    let ready = false;
    btn.addEventListener("mouseenter", () => {
      hover = true;
      ticker.wake();
    });
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      ty = ((e.clientX - r.left) / r.width - 0.5) * 1.1;
      tx = ((e.clientY - r.top) / r.height - 0.5) * 1.1;
    });
    btn.addEventListener("mouseleave", () => {
      hover = false;
      tx = 0;
      ty = 0;
    });
    btn.addEventListener("click", (e) => {
      if (!ready || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = btn.getAttribute("href");
      if (!href || btn.target === "_blank") return;
      e.preventDefault();
      pulse = 0;
      ticker.wake();
      setTimeout(() => {
        window.location.href = btn.href;
      }, 320);
    });
    const vis = watchVisible(section, ticker);
    const tick = (dt) => {
      const k = 1 - Math.exp(-dt * 4);
      amp = lerp(amp, hover ? 0.09 : 0.035, k);
      flow = lerp(flow, hover ? 1.15 : 0.35, k);
      scale = lerp(scale, hover ? 1.08 : 1, 1 - Math.exp(-dt * 6));
      rx = lerp(rx, tx, 1 - Math.exp(-dt * 5));
      ry = lerp(ry, ty, 1 - Math.exp(-dt * 5));
      uniforms.uTime.value += dt * flow;
      uniforms.uAmp.value = amp;
      let sx = scale;
      let sy = scale;
      if (pulse >= 0) {
        pulse += dt / 0.3;
        const q = pulse >= 1 ? 0 : Math.sin(pulse * Math.PI) * (1 - pulse * 0.35);
        sx = scale * (1 + q * 0.14);
        sy = scale * (1 - q * 0.16);
        if (pulse >= 1) pulse = -1;
      }
      orb.scale.set(sx, sy, scale);
      orb.rotation.set(rx, ry, 0);
      renderer.render(scene, camera);
      canvas.dataset.amp = amp.toFixed(3);
      canvas.dataset.scale = sx.toFixed(3);
    };
    renderer.render(scene, camera);
    ready = true;
    btn.classList.add("is-3d");
    ticker.add({ visible: () => vis.on, tick });
  };

  const initThree = () => {
    const avatars = Array.from(document.querySelectorAll(".contact__title .avatar"));
    const buttons = Array.from(document.querySelectorAll(".contact .btn-round--blue"));
    if (reduced || (!avatars.length && !buttons.length)) return;
    const fallback = () => {
      avatars.forEach((a) => {
        if (!a.classList.contains("is-3d")) spinAvatar(a);
      });
      buttons.forEach((b) => {
        if (!b.classList.contains("is-3d")) tiltButton(b);
      });
    };
    const start = () => {
      if (!hasWebGL()) {
        fallback();
        return;
      }
      loadThree().then((THREE) => {
        const ticker = makeTicker();
        avatars.forEach((a) => {
          try {
            makeCoin(THREE, a, ticker);
          } catch (e) {
            spinAvatar(a);
          }
        });
        buttons.forEach((b) => {
          try {
            makeOrb(THREE, b, ticker);
          } catch (e) {
            tiltButton(b);
          }
        });
      }).catch(fallback);
    };
    if (!("IntersectionObserver" in window)) {
      start();
      return;
    }
    const sections = new Set([...avatars, ...buttons].map((el) => el.closest("section") || el));
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin: "600px 0px 600px 0px" });
    sections.forEach((s) => io.observe(s));
  };

  const initTitleReveal = () => {
    document.querySelectorAll(".contact__title").forEach((title) => {
      const lines = Array.from(title.querySelectorAll(".contact__line"));
      if (!lines.length) return;
      const label = title.textContent.replace(/\s+/g, " ").trim();
      title.setAttribute("aria-label", label);
      let charIndex = 0;
      const collectTextNodes = (node, out) => {
        node.childNodes.forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains("avatar")) return;
          if (child.nodeType === Node.TEXT_NODE) {
            out.push(child);
            return;
          }
          if (child.nodeType === Node.ELEMENT_NODE) collectTextNodes(child, out);
        });
        return out;
      };
      lines.forEach((line) => {
        collectTextNodes(line, []).forEach((node) => {
          const text = node.textContent;
          const frag = document.createDocumentFragment();
          Array.from(text).forEach((ch) => {
            const span = document.createElement("span");
            span.className = "contact__char";
            span.setAttribute("aria-hidden", "true");
            span.style.setProperty("--ci", `${charIndex * 25}ms`);
            span.textContent = ch === " " ? " " : ch;
            frag.appendChild(span);
            charIndex += 1;
          });
          node.parentNode.replaceChild(frag, node);
        });
      });
      if (reduced || !("IntersectionObserver" in window)) {
        title.classList.add("is-in");
        return;
      }
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            title.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      io.observe(title);
    });
  };

  const markLoaded = () => {
    requestAnimationFrame(() => root.classList.add("is-loaded"));
  };

  const runPreloader = () => {
    const pre = document.querySelector(".preloader");
    if (!pre || skipPreload) {
      if (pre) pre.remove();
      markLoaded();
      return;
    }
    try {
      sessionStorage.setItem("rian-preloader", "1");
    } catch (e) {
      seen = true;
    }
    const wordEl = pre.querySelector(".preloader__word");
    const words = ["Hello", "Kumusta", "Bonjour", "Hola", "Ciao", "こんにちは", "안녕하세요", "Olá", "Hallo"];
    if (lenis) lenis.stop();
    let i = 0;
    wordEl.textContent = words[0];
    requestAnimationFrame(() => pre.classList.add("is-on"));
    const next = () => {
      i += 1;
      if (i < words.length) {
        wordEl.textContent = words[i];
        setTimeout(next, 130);
        return;
      }
      setTimeout(() => {
        pre.classList.add("is-lifting");
        markLoaded();
        if (lenis) lenis.start();
        setTimeout(() => pre.remove(), 650);
      }, 80);
    };
    setTimeout(next, 380);
  };

  const init = () => {
    initScroll();
    runPreloader();
    initProgress();
    initReveal();
    initMagnetic();
    initMenu();
    initMarquee();
    initDots();
    initVignette();
    initStory();
    initHoverList();
    initTileVideos();
    initCopy();
    initClock();
    initForm();
    initTilt();
    initBackToTop();
    initThree();
    initTitleReveal();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
