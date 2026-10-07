/* ts.js, behaviour for the ts- components (see assets/css/ts.css).
   Plain JavaScript, no dependencies, safe to load next to main.js and inner.js.
   Loaded in the head so the ts-js class lands before first paint; the work waits for the DOM.

   What it does:
   1. marks blocks as in view (is-in) the first time they near the viewport
   2. indexes children so sequences rise one after another (--ts-i)
   3. builds .ts-pipe from data-steps, .ts-term from data-lines, .ts-bars from data-a and data-b
   4. counts numbers up ([data-ts-count])
   5. writes scroll progress to --ts-p for .ts-case, .ts-rows and [data-ts-scrub]
   Everything that moves stops when the block leaves the screen, and nothing moves under
   prefers-reduced-motion: the finished state is drawn at once. */
(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.add("ts-js");

  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(mq && mq.matches);
  const hasIO = "IntersectionObserver" in window;
  const hasRO = "ResizeObserver" in window;

  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const decimalsOf = (s) => {
    const m = String(s).match(/\.(\d+)/);
    return m ? m[1].length : 0;
  };
  const fmt = (v, d) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const parseJSON = (s, fallback) => {
    try {
      return JSON.parse(s);
    } catch (e) {
      return fallback;
    }
  };
  const flag = (node, name) => node.hasAttribute(name) && node.getAttribute(name) !== "false";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (name, attrs) => {
    const n = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  };

  /* Calls cb(isVisible) every time the visibility of target changes. */
  const watch = (target, cb, threshold) => {
    if (!hasIO) {
      cb(true);
      return;
    }
    new IntersectionObserver((entries) => {
      entries.forEach((e) => cb(e.isIntersecting));
    }, { threshold: threshold || 0 }).observe(target);
  };

  /* Calls cb once, the first time target nears the viewport. */
  const once = (target, cb, margin) => {
    if (!hasIO || reduced()) {
      cb();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      cb();
    }, { rootMargin: margin || "0px 0px -8% 0px", threshold: 0 });
    io.observe(target);
  };

  /* ---------- 1 and 2. units and sequences ---------- */

  const SEQ = ".ts-head, .ts-case__head, .ts-nums, .ts-chips, .ts-role__list, [data-ts-seq]";
  const UNITS = ".ts-case, .ts-pipe, .ts-term, .ts-bars, .ts-card, .ts-limits, .ts-rows__row, .ts-head, .ts-case__head, .ts-role, .ts-nums, .ts-chips, [data-ts-seq]";

  const indexSequences = () => {
    $$(SEQ).forEach((parent) => {
      const offset = parent.classList.contains("ts-role__list") ? 1 : 0;
      Array.from(parent.children).forEach((child, i) => {
        child.style.setProperty("--ts-i", String(Math.min(i + offset, 9)));
      });
    });
  };

  const observeUnits = () => {
    const units = $$(UNITS).filter((n) => !n.__tsUnit);
    units.forEach((n) => {
      n.__tsUnit = true;
    });
    if (reduced() || !hasIO) {
      units.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    units.forEach((n) => io.observe(n));
  };

  /* ---------- 4. counting numbers ---------- */

  const countTo = (node, cfg) => {
    const dec = cfg.dec || 0;
    const pre = cfg.prefix || "";
    const suf = cfg.suffix || "";
    const finalText = pre + fmt(cfg.target, dec) + suf;
    if (reduced()) {
      node.textContent = finalText;
      return;
    }
    const dur = cfg.dur || 1000;
    window.setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        node.textContent = pre + fmt(cfg.target * easeOut(p), dec) + suf;
        if (p < 1) requestAnimationFrame(step);
        else node.textContent = finalText;
      };
      requestAnimationFrame(step);
    }, cfg.delay || 0);
  };

  /* Screen readers get the finished value; the animated copy is hidden from them. */
  const prepCount = (node, cfg) => {
    const finalText = (cfg.prefix || "") + fmt(cfg.target, cfg.dec || 0) + (cfg.suffix || "");
    node.textContent = finalText;
    if (reduced()) return;
    const sr = el("span", "sr-only", finalText);
    node.setAttribute("aria-hidden", "true");
    node.insertAdjacentElement("afterend", sr);
    node.textContent = (cfg.prefix || "") + fmt(0, cfg.dec || 0) + (cfg.suffix || "");
  };

  const initCounts = () => {
    $$("[data-ts-count]").forEach((node) => {
      if (node.__tsCount) return;
      node.__tsCount = true;
      const raw = node.getAttribute("data-ts-count");
      const target = parseFloat(raw);
      if (!Number.isFinite(target)) return;
      const cfg = {
        target,
        dec: node.hasAttribute("data-decimals") ? num(node.getAttribute("data-decimals"), 0) : decimalsOf(raw),
        prefix: node.getAttribute("data-prefix") || "",
        suffix: node.getAttribute("data-suffix") || "",
        dur: num(node.getAttribute("data-dur"), 1000)
      };
      prepCount(node, cfg);
      const item = node.closest(".ts-num");
      const idx = item ? num(item.style.getPropertyValue("--ts-i"), 0) : 0;
      cfg.delay = num(node.getAttribute("data-delay"), 150 + idx * 70);
      once(node, () => countTo(node, cfg));
    });
  };

  /* ---------- 3a. pipeline diagram ---------- */

  const parseSteps = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return [];
    if (text.charAt(0) === "[") {
      const arr = parseJSON(text, []);
      return Array.isArray(arr) ? arr.map((s) => (typeof s === "string" ? { label: s } : s)).filter((s) => s && s.label) : [];
    }
    return text.split("|").map((part) => {
      const bits = part.split("~").map((x) => x.trim());
      return { label: bits[0], note: bits[1] || "", tag: bits[2] || "" };
    }).filter((s) => s.label);
  };

  const makeNode = (step) => {
    const li = el("li", "ts-pipe__node");
    li.appendChild(el("span", "ts-pipe__label", step.label));
    if (step.note) li.appendChild(el("span", "ts-pipe__note", step.note));
    if (step.tag) {
      li.setAttribute("data-tag", step.tag);
      li.appendChild(el("span", "ts-pipe__tag", step.tag));
    }
    return li;
  };

  const buildPipe = (box) => {
    if (box.__ts) return;
    box.__ts = true;

    let list = box.querySelector(":scope > .ts-pipe__list");
    if (!list) {
      const steps = parseSteps(box.getAttribute("data-steps"));
      if (!steps.length) return;
      list = el("ol", "ts-pipe__list");
      steps.forEach((s) => list.appendChild(makeNode(s)));
      box.appendChild(list);
    }
    const nodes = Array.from(list.children);
    nodes.forEach((n, i) => {
      n.classList.add("ts-pipe__node");
      n.style.setProperty("--ts-i", String(i));
      if (!n.querySelector(":scope > .ts-pipe__idx")) n.insertBefore(el("span", "ts-pipe__idx", pad2(i + 1)), n.firstChild);
      if (i < nodes.length - 1 && !n.querySelector(":scope > .ts-pipe__wire")) {
        const wire = el("span", "ts-pipe__wire");
        wire.setAttribute("aria-hidden", "true");
        wire.appendChild(document.createElement("i"));
        n.appendChild(wire);
      }
    });

    box.setAttribute("role", "group");
    if (!box.hasAttribute("aria-label")) {
      const names = nodes.map((n) => (n.querySelector(".ts-pipe__label") || n).textContent.trim());
      box.setAttribute("aria-label", box.getAttribute("data-label") || "Pipeline: " + names.join(", then "));
    }

    const loopSpec = String(box.getAttribute("data-loop") || "").match(/^\s*(\d+)\s*>\s*(\d+)\s*$/);
    const loop = loopSpec ? [parseInt(loopSpec[1], 10) - 1, parseInt(loopSpec[2], 10) - 1] : null;
    let svg = null;
    let loopPath = null;
    let loopHead = null;
    let loopText = null;
    if (loop && nodes[loop[0]] && nodes[loop[1]]) {
      box.classList.add("has-loop");
      box.style.setProperty("--ts-loop-delay", nodes.length * 160 + 700 + "ms");
      svg = svgEl("svg", { class: "ts-pipe__loop", "aria-hidden": "true", focusable: "false" });
      loopPath = svgEl("path", { class: "ts-pipe__loop-line" });
      loopHead = svgEl("path", { class: "ts-pipe__loop-head" });
      loopText = svgEl("text", { class: "ts-pipe__loop-label" });
      loopText.textContent = box.getAttribute("data-loop-label") || "retry";
      svg.append(loopPath, loopHead, loopText);
      box.appendChild(svg);
    }

    const drawLoop = () => {
      if (!svg) return;
      const from = nodes[loop[0]];
      const to = nodes[loop[1]];
      const pr = box.getBoundingClientRect();
      const ox = pr.left + box.clientLeft;
      const oy = pr.top + box.clientTop;
      svg.setAttribute("viewBox", "0 0 " + box.clientWidth + " " + box.clientHeight);
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const r = 14;
      let d;
      let head;
      if (!box.classList.contains("is-stacked")) {
        const x1 = a.left + a.width / 2 - ox;
        const x2 = b.left + b.width / 2 - ox;
        const y0 = Math.max(a.bottom, b.bottom) - oy;
        const yb = y0 + 30;
        const s = Math.sign(x2 - x1) || 1;
        d = "M" + x1 + " " + (y0 + 3) + " V" + (yb - r) + " Q" + x1 + " " + yb + " " + (x1 + s * r) + " " + yb + " H" + (x2 - s * r) + " Q" + x2 + " " + yb + " " + x2 + " " + (yb - r) + " V" + (y0 + 9);
        head = "M" + (x2 - 5) + " " + (y0 + 15) + " L" + x2 + " " + (y0 + 8) + " L" + (x2 + 5) + " " + (y0 + 15);
        loopText.setAttribute("text-anchor", "middle");
        loopText.setAttribute("x", String((x1 + x2) / 2));
        loopText.setAttribute("y", String(yb + 20));
        loopText.removeAttribute("transform");
      } else {
        const xr = Math.max(a.right, b.right) - ox;
        const y1 = a.top + a.height / 2 - oy;
        const y2 = b.top + b.height / 2 - oy;
        const xo = xr + 26;
        const s = Math.sign(y2 - y1) || 1;
        d = "M" + (xr + 3) + " " + y1 + " H" + (xo - r) + " Q" + xo + " " + y1 + " " + xo + " " + (y1 + s * r) + " V" + (y2 - s * r) + " Q" + xo + " " + y2 + " " + (xo - r) + " " + y2 + " H" + (xr + 9);
        head = "M" + (xr + 15) + " " + (y2 - 5) + " L" + (xr + 8) + " " + y2 + " L" + (xr + 15) + " " + (y2 + 5);
        const lx = xo + 16;
        const ly = (y1 + y2) / 2;
        loopText.setAttribute("text-anchor", "middle");
        loopText.setAttribute("x", String(lx));
        loopText.setAttribute("y", String(ly));
        loopText.setAttribute("transform", "rotate(90 " + lx + " " + ly + ")");
      }
      loopPath.setAttribute("d", d);
      loopHead.setAttribute("d", head);
    };

    const layout = () => {
      const cs = getComputedStyle(box);
      const gap = parseFloat(cs.getPropertyValue("--ts-gap")) || 56;
      const pad = parseFloat(cs.paddingLeft) || 0;
      const inner = box.clientWidth - pad * 2;
      const per = (inner - gap * (nodes.length - 1)) / nodes.length;
      const minNode = num(box.getAttribute("data-min-node"), 150);
      box.classList.toggle("is-stacked", flag(box, "data-stacked") || per < minNode);
      drawLoop();
    };
    layout();
    if (hasRO) new ResizeObserver(layout).observe(box);
    else window.addEventListener("resize", layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

    /* an active node walks along the pipeline while the block is on screen */
    const st = { active: -1, timer: 0, visible: false, hover: false };
    const setActive = (i) => {
      st.active = i;
      nodes.forEach((n, k) => n.classList.toggle("is-active", k === i));
    };
    const step = () => {
      if (!st.visible || st.hover || document.hidden) return;
      setActive((st.active + 1) % nodes.length);
    };
    const stop = () => {
      window.clearInterval(st.timer);
      st.timer = 0;
    };
    const start = () => {
      if (st.timer || reduced() || flag(box, "data-still")) return;
      st.timer = window.setInterval(step, num(box.getAttribute("data-interval"), 1400));
    };
    nodes.forEach((n, i) => {
      n.addEventListener("pointerenter", () => {
        if (reduced()) return;
        st.hover = true;
        setActive(i);
      });
      n.addEventListener("pointerleave", () => {
        st.hover = false;
      });
    });
    watch(box, (vis) => {
      st.visible = vis;
      box.classList.toggle("is-live", vis && !reduced());
      if (vis) {
        if (st.active < 0 && !reduced() && !flag(box, "data-still")) setActive(0);
        start();
      } else {
        stop();
      }
    }, 0.2);
  };

  /* ---------- 3b. terminal replay ---------- */

  const normLine = (ln) => {
    if (Array.isArray(ln)) return { src: ln[0], text: ln[1], ms: ln[2], k: ln[3] };
    if (ln && typeof ln === "object") {
      return {
        src: ln.src != null ? ln.src : ln.source,
        text: ln.text != null ? ln.text : ln.t,
        ms: ln.ms != null ? ln.ms : ln.latency,
        k: ln.k != null ? ln.k : ln.kind
      };
    }
    return null;
  };

  const fmtLat = (v) => {
    if (v == null || v === "") return "";
    if (typeof v === "number") return v >= 1000 ? (v / 1000).toFixed(2) + " s" : Math.round(v) + " ms";
    return String(v);
  };

  const hueOf = (name) => {
    let h = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 4;
  };

  const replayIcon = () => {
    const svg = svgEl("svg", { viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" });
    svg.appendChild(svgEl("path", { d: "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    return svg;
  };

  const buildTerm = (box) => {
    if (box.__ts) return;
    box.__ts = true;
    const data = parseJSON(box.getAttribute("data-lines"), []);
    const lines = (Array.isArray(data) ? data : []).map(normLine).filter((l) => l && l.text != null);
    if (!lines.length) return;

    const speed = Math.max(4, num(box.getAttribute("data-speed"), 16));
    const gapMs = num(box.getAttribute("data-gap"), 240);
    const looping = flag(box, "data-loop");
    const title = box.getAttribute("data-title") || "terminal";
    const colNames = (box.getAttribute("data-cols") || "source,output,latency").split(",").map((s) => s.trim());

    box.textContent = "";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", title);

    const bar = el("div", "ts-term__bar");
    const dots = el("span", "ts-term__dots");
    dots.setAttribute("aria-hidden", "true");
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    const barTitle = el("span", "ts-term__title", title);
    barTitle.setAttribute("aria-hidden", "true");
    const btn = el("button", "ts-term__btn");
    btn.type = "button";
    btn.setAttribute("aria-label", "Replay " + title);
    btn.append(replayIcon(), el("span", "", "Replay"));
    bar.append(dots, barTitle, btn);

    const head = el("div", "ts-term__head");
    head.setAttribute("aria-hidden", "true");
    colNames.slice(0, 3).forEach((c) => head.appendChild(el("span", "", c)));

    const body = el("div", "ts-term__body");
    body.setAttribute("aria-hidden", "true");
    const rows = lines.map((ln) => {
      const row = el("div", "ts-term__row");
      if (ln.k) row.setAttribute("data-k", ln.k);
      const src = el("span", "ts-term__src", ln.src == null ? "" : String(ln.src));
      src.setAttribute("data-h", String(hueOf(ln.src)));
      const full = String(ln.text);
      const text = el("span", "ts-term__text");
      const typed = el("span", "ts-term__typed");
      const rest = el("span", "ts-term__rest", full);
      text.append(typed, rest);
      const ms = el("span", "ts-term__ms");
      row.append(src, text, ms);
      body.appendChild(row);
      return {
        row,
        typed,
        rest,
        ms,
        full,
        lat: fmtLat(ln.ms),
        pending: typeof ln.ms === "number" ? clamp(ln.ms * 0.4, 0, 700) : ln.ms ? 220 : 0
      };
    });

    const total = lines.reduce((sum, l) => sum + (typeof l.ms === "number" ? l.ms : 0), 0);
    const footMode = box.getAttribute("data-foot");
    const foot = el("div", "ts-term__foot");
    foot.setAttribute("aria-hidden", "true");
    if (footMode === "none") {
      foot.hidden = true;
    } else if (footMode) {
      foot.appendChild(el("span", "", footMode));
    } else {
      foot.appendChild(el("span", "", lines.length + (lines.length === 1 ? " line" : " lines")));
      if (total > 0) foot.appendChild(el("span", "", "summed latency " + fmtLat(total)));
    }

    const sr = el("ul", "sr-only");
    lines.forEach((l) => {
      const parts = [l.src, l.text, fmtLat(l.ms)].filter((x) => x != null && x !== "");
      sr.appendChild(el("li", "", parts.join(", ")));
    });

    box.append(bar, head, body, foot, sr);

    /* playback state */
    const T = { i: 0, c: 0, acc: 0, wait: 0, phase: "idle", visible: false, running: false, last: 0, started: false, done: false };

    const resolveRow = (r) => {
      r.row.classList.remove("is-wait");
      r.ms.textContent = r.lat;
    };
    const showRow = (r) => {
      r.row.classList.add("is-on");
      r.row.classList.remove("is-typing", "is-wait");
      r.typed.textContent = r.full;
      r.rest.textContent = "";
      r.ms.textContent = r.lat;
    };
    const clearRow = (r) => {
      r.row.classList.remove("is-on", "is-typing", "is-wait");
      r.typed.textContent = "";
      r.rest.textContent = r.full;
      r.ms.textContent = "";
    };
    const markDone = () => {
      box.classList.add("is-done");
      const last = rows[rows.length - 1];
      if (last) last.row.classList.add("is-typing");
    };
    const reset = () => {
      rows.forEach(clearRow);
      box.classList.remove("is-done");
      Object.assign(T, { i: 0, c: 0, acc: 0, wait: 0, phase: "start", done: false });
    };

    const advance = (dt) => {
      let budget = dt;
      let guard = 0;
      while (budget > 0 && !T.done && guard < 60) {
        guard += 1;
        const r = rows[T.i];
        if (T.phase === "start") {
          r.row.classList.add("is-on", "is-typing");
          T.c = 0;
          T.acc = 0;
          T.phase = "type";
        } else if (T.phase === "type") {
          const need = (r.full.length - T.c) * speed - T.acc;
          if (budget >= need) {
            budget -= need;
            T.c = r.full.length;
            T.acc = 0;
            r.typed.textContent = r.full;
            r.rest.textContent = "";
            r.row.classList.remove("is-typing");
            if (r.pending > 0) {
              r.row.classList.add("is-wait");
              T.wait = r.pending;
              T.phase = "wait";
            } else {
              resolveRow(r);
              T.wait = gapMs;
              T.phase = "gap";
            }
          } else {
            T.acc += budget;
            budget = 0;
            const n = Math.floor(T.acc / speed);
            if (n > 0) {
              T.c += n;
              T.acc -= n * speed;
              r.typed.textContent = r.full.slice(0, T.c);
              r.rest.textContent = r.full.slice(T.c);
            }
          }
        } else if (T.phase === "wait" || T.phase === "gap" || T.phase === "hold") {
          if (budget >= T.wait) {
            budget -= T.wait;
            T.wait = 0;
            if (T.phase === "wait") {
              resolveRow(r);
              T.wait = gapMs;
              T.phase = "gap";
            } else if (T.phase === "gap") {
              T.i += 1;
              if (T.i >= rows.length) {
                T.i = rows.length - 1;
                markDone();
                if (looping) {
                  T.wait = 3400;
                  T.phase = "hold";
                } else {
                  T.done = true;
                }
              } else {
                T.phase = "start";
              }
            } else {
              reset();
            }
          } else {
            T.wait -= budget;
            budget = 0;
          }
        } else {
          break;
        }
      }
    };

    const frame = (now) => {
      if (!T.visible || document.hidden || reduced()) {
        T.running = false;
        return;
      }
      const dt = Math.min(64, now - T.last);
      T.last = now;
      advance(dt);
      if (T.done) {
        T.running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    const schedule = () => {
      if (T.running || !T.started || T.done || !T.visible || document.hidden || reduced()) return;
      T.running = true;
      T.last = performance.now();
      requestAnimationFrame(frame);
    };

    if (reduced()) {
      rows.forEach(showRow);
      box.classList.add("is-done", "is-static");
      btn.hidden = true;
      return;
    }

    btn.addEventListener("click", () => {
      reset();
      T.started = true;
      schedule();
    });
    document.addEventListener("visibilitychange", schedule);
    watch(box, (vis) => {
      T.visible = vis;
      box.classList.toggle("is-live", vis);
      if (vis && !T.started) {
        T.started = true;
        reset();
      }
      schedule();
    }, 0.25);
  };

  /* ---------- 3c. results bars ---------- */

  const buildBars = (box) => {
    if (box.__ts) return;
    box.__ts = true;
    const a = parseFloat(box.getAttribute("data-a"));
    const b = parseFloat(box.getAttribute("data-b"));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;

    const min = num(box.getAttribute("data-min"), 0);
    const topValue = Math.max(a, b);
    const max = num(box.getAttribute("data-max"), topValue <= 1 ? 1 : topValue);
    const dec = box.hasAttribute("data-decimals") ? num(box.getAttribute("data-decimals"), 0) : Math.max(decimalsOf(box.getAttribute("data-a")), decimalsOf(box.getAttribute("data-b")));
    const unit = box.getAttribute("data-unit") || "";
    const better = box.getAttribute("data-better") === "lower" ? "lower" : "higher";
    const nameA = box.getAttribute("data-a-label") || "A";
    const nameB = box.getAttribute("data-b-label") || "B";
    const label = box.getAttribute("data-label") || "";
    const n = box.getAttribute("data-n");
    const note = box.getAttribute("data-note") || "";
    const pct = (v) => clamp((v - min) / (max - min || 1), 0, 1) * 100;

    let winner = "";
    if (a !== b) winner = (better === "higher" ? a > b : a < b) ? "a" : "b";

    box.textContent = "";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", label || nameA + " versus " + nameB);

    const head = el("div", "ts-bars__head");
    head.setAttribute("aria-hidden", "true");
    if (label) head.appendChild(el("span", "ts-bars__label", label));
    if (n) head.appendChild(el("span", "ts-bars__n", "n = " + fmt(parseFloat(n) || 0, 0)));
    const diff = b - a;
    let deltaText = "";
    if (box.getAttribute("data-delta") !== "false") {
      const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      const good = diff === 0 ? "" : (better === "higher") === (diff > 0) ? "good" : "bad";
      deltaText = (diff > 0 ? "+" : diff < 0 ? "-" : "") + fmt(Math.abs(diff), dec) + unit;
      const chip = el("span", "ts-bars__delta", deltaText);
      chip.setAttribute("data-dir", dir);
      if (good) chip.setAttribute("data-tone", good);
      head.appendChild(chip);
    }
    box.appendChild(head);

    const makeRow = (side, name, value, delay) => {
      const row = el("div", "ts-bars__row");
      row.setAttribute("aria-hidden", "true");
      row.setAttribute("data-side", side);
      if (winner === side) row.setAttribute("data-win", "");
      const track = el("span", "ts-bars__track");
      const fill = el("span", "ts-bars__fill");
      fill.style.setProperty("--w", pct(value).toFixed(2) + "%");
      fill.style.setProperty("--d", delay + "s");
      track.appendChild(fill);
      const val = el("span", "ts-bars__val");
      row.append(el("span", "ts-bars__name", name), track, val);
      box.appendChild(row);
      val.textContent = fmt(value, dec) + unit;
      if (!reduced()) {
        val.textContent = fmt(0, dec) + unit;
        once(box, () => countTo(val, { target: value, dec, suffix: unit, delay: delay * 1000, dur: 950 }));
      }
    };
    makeRow("a", nameA, a, 0);
    makeRow("b", nameB, b, 0.16);

    const foot = el("p", "ts-bars__foot");
    foot.setAttribute("aria-hidden", "true");
    foot.appendChild(el("span", "", note));
    const scale = "scale " + fmt(min, decimalsOf(box.getAttribute("data-min"))) + " to " + fmt(max, decimalsOf(box.getAttribute("data-max"))) + (min > 0 ? ", does not start at zero" : "");
    foot.appendChild(el("span", "", scale));
    box.appendChild(foot);

    const summary = el("p", "sr-only", nameA + " " + fmt(a, dec) + unit + ", " + nameB + " " + fmt(b, dec) + unit + (deltaText ? ", difference " + deltaText : "") + (n ? ", n " + fmt(parseFloat(n) || 0, 0) : "") + (note ? ". " + note : "") + ".");
    box.appendChild(summary);
  };

  /* ---------- 5. scroll progress and rows ---------- */

  const initScrub = () => {
    const nodes = $$("[data-ts-scrub], .ts-rows, .ts-case").filter((n) => !n.__tsScrub);
    if (!nodes.length) return;
    const items = nodes.map((node) => {
      node.__tsScrub = true;
      return {
        node,
        near: true,
        p: -1,
        anchor: num(node.getAttribute("data-anchor"), 0.62),
        rows: node.classList.contains("ts-rows") ? $$(".ts-rows__row", node) : null
      };
    });

    if (reduced()) {
      items.forEach((it) => {
        if (it.rows) it.rows.forEach((r) => r.classList.add("is-lit"));
      });
      return;
    }

    const paint = (it) => {
      const rect = it.node.getBoundingClientRect();
      const p = clamp((window.innerHeight * it.anchor - rect.top) / Math.max(1, rect.height), 0, 1);
      if (Math.abs(p - it.p) < 0.001) return;
      it.p = p;
      it.node.style.setProperty("--ts-p", p.toFixed(4));
      if (it.rows) {
        const y = p * it.node.clientHeight;
        it.rows.forEach((r) => {
          r.classList.toggle("is-lit", r.offsetTop + 14 <= y);
        });
      }
    };

    let queued = false;
    const update = () => {
      queued = false;
      items.forEach((it) => {
        if (it.near) paint(it);
      });
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };

    if (hasIO) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const it = items.find((x) => x.node === e.target);
          if (it) it.near = e.isIntersecting;
        });
        queue();
      }, { rootMargin: "20% 0px 20% 0px" });
      items.forEach((it) => io.observe(it.node));
    }
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", () => {
      items.forEach((it) => {
        it.p = -1;
      });
      queue();
    });
    update();
  };

  /* ---------- boot ---------- */

  const init = () => {
    try {
      indexSequences();
      $$(".ts-pipe").forEach(buildPipe);
      $$(".ts-term[data-lines]").forEach(buildTerm);
      $$(".ts-bars[data-a][data-b]").forEach(buildBars);
      initCounts();
      observeUnits();
      initScrub();
    } catch (err) {
      /* never leave content hidden if something throws */
      $$(UNITS).forEach((n) => n.classList.add("is-in"));
      if (window.console && console.error) console.error("ts.js", err);
    }
  };

  window.TS = { init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
