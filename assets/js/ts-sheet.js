/* ts-sheet.js, behaviour for the tsv- components (see assets/css/ts-sheet.css).
   Plain JavaScript, no dependencies. Load it in the head, next to ts.js, so the
   tsv-js class lands before first paint. The work waits for the DOM.

   What it does
   1. cards (.tsv-card) open a native dialog sheet; the sheet slides in from the right
      on desktop and rises from the bottom on phones
   2. the sheet content is cloned from <article hidden data-sheet-src="ID"> or
      <template data-sheet="ID">, so the page stays readable without script
   3. deep links: opening sets location.hash, a load with #ID opens that sheet, Back closes it
   4. previous and next work arrows, keyboard, focus trap, Esc, click outside, scroll lock
   5. .tsv-media becomes a carousel: arrows, dots, keys, swipe, lightbox, videos that play
      only while visible
   6. image parallax on cards, cards rise once as they scroll in

   Public API: window.TSV.init(root), open(id), close(), next(), prev(), isOpen(), current()
   Events on document: tsv:open, tsv:close
   Nothing moves under prefers-reduced-motion and videos wait for the play button. */
(() => {
  "use strict";

  if (window.TSV && window.TSV.version) return;

  const root = document.documentElement;
  root.classList.add("tsv-js");

  const mqRM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(mqRM && mqRM.matches);
  const finePointer = () => !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  const hasIO = "IntersectionObserver" in window;

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, "0");
  const mk = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* icons, drawn with DOM methods only */
  const NS = "http://www.w3.org/2000/svg";
  const PATH = {
    prev: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    close: "M6 6l12 12M18 6L6 18",
    pause: "M7 5h3.4v14H7zM13.6 5H17v14h-3.4z",
    play: "M8 5.5v13l11-6.5z"
  };
  const icon = (d, cls) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    if (cls) s.setAttribute("class", cls);
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  };
  const ibtn = (cls, label, d) => {
    const b = mk("button", "tsv-ibtn " + cls, { type: "button", "aria-label": label });
    b.appendChild(icon(d));
    return b;
  };

  /* the longest transition on an element, in ms */
  const msOf = (el) => {
    const cs = getComputedStyle(el);
    let max = 0;
    (cs.transitionDuration || "0s").split(",").forEach((p) => {
      const v = parseFloat(p) * (/ms\s*$/.test(p.trim()) ? 1 : 1000);
      if (v > max) max = v;
    });
    return max;
  };

  /* ---------- sources ---------- */

  const SRC_SEL = "[data-sheet-src], template[data-sheet]";
  const srcId = (n) => n.getAttribute("data-sheet-src") || n.getAttribute("data-sheet") || "";

  function sourceNodes() {
    const seen = {};
    return $$(SRC_SEL).filter((n) => {
      const id = srcId(n);
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function infoOf(n) {
    const tpl = n.tagName === "TEMPLATE";
    const scope = tpl ? n.content : n;
    let title = (n.getAttribute("data-title") || "").trim();
    if (!title) {
      const h = scope.querySelector(".tsv-article__title, h1, h2");
      title = h ? h.textContent.trim() : srcId(n);
    }
    return {
      id: srcId(n),
      node: n,
      tpl: tpl,
      title: title,
      hasTitleAttr: !!n.getAttribute("data-title"),
      eyebrow: (n.getAttribute("data-eyebrow") || "").trim(),
      group: n.getAttribute("data-group") || ""
    };
  }

  const findSource = (id) => {
    const n = sourceNodes().find((x) => srcId(x) === id);
    return n ? infoOf(n) : null;
  };

  const listFor = (s) => sourceNodes().map(infoOf).filter((x) => x.group === s.group);

  /* ---------- openers: any element with data-tsv-open, or a card link to a #id ---------- */

  const OPENER = "[data-tsv-open], a.tsv-card[href^='#']";

  function openerId(t) {
    if (!t || !t.getAttribute) return "";
    let id = t.getAttribute("data-tsv-open");
    if (!id) {
      const h = t.getAttribute("href") || "";
      if (h.charAt(0) === "#") {
        try {
          id = decodeURIComponent(h.slice(1));
        } catch (e) {
          id = h.slice(1);
        }
      }
    }
    return id || "";
  }

  /* ---------- state ---------- */

  const S = {
    dlg: null, panel: null, bar: null, eyebrow: null, title: null, nav: null, count: null,
    prevBtn: null, nextBtn: null, closeBtn: null, content: null, live: null,
    id: null, list: [], idx: -1,
    trigger: null, pushed: false, closing: false, t: 0, hb: 0,
    locked: false, scrollY: 0,
    vio: null, videos: [],
    lb: null, lbOpen: false
  };

  /* ---------- scroll lock (iOS safe: pin the body, restore the scroll on unlock) ---------- */

  function lock() {
    if (S.locked) return;
    S.locked = true;
    S.scrollY = window.pageYOffset || root.scrollTop || 0;
    const sbw = Math.max(0, window.innerWidth - root.clientWidth);
    root.style.setProperty("--tsv-sbw", sbw + "px");
    root.classList.add("tsv-lock");
    document.body.style.top = -S.scrollY + "px";
    if (sbw) document.body.style.paddingRight = sbw + "px";
    try {
      if (window.lenis && typeof window.lenis.stop === "function") window.lenis.stop();
    } catch (e) { /* the site may not expose Lenis */ }
  }

  function unlock() {
    if (!S.locked) return;
    S.locked = false;
    root.classList.remove("tsv-lock");
    document.body.style.top = "";
    document.body.style.paddingRight = "";
    root.style.removeProperty("--tsv-sbw");
    try {
      window.scrollTo({ top: S.scrollY, left: 0, behavior: "instant" });
    } catch (e) {
      window.scrollTo(0, S.scrollY);
    }
    try {
      if (window.lenis && typeof window.lenis.start === "function") window.lenis.start();
    } catch (e) { /* ignore */ }
  }

  /* ---------- focus trap ---------- */

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

  function focusables(scope) {
    return $$(FOCUSABLE, scope).filter((el) => {
      if (el.closest("[hidden], [inert]")) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && el.getClientRects().length > 0;
    });
  }

  function trap(e, scope, home) {
    const list = focusables(scope);
    if (!list.length) {
      e.preventDefault();
      (home || scope).focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const a = document.activeElement;
    const inside = scope.contains(a) && a !== scope && a !== home;
    if (e.shiftKey) {
      if (!inside || a === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || a === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- the sheet ---------- */

  function ensure() {
    if (S.dlg) return;
    const dlg = mk("dialog", "tsv-sheet", { "aria-labelledby": "tsv-sheet-title", "data-lenis-prevent": "" });
    const panel = mk("div", "tsv-sheet__panel", { tabindex: "-1", "data-lenis-prevent": "" });
    const bar = mk("header", "tsv-sheet__bar");
    const heading = mk("div", "tsv-sheet__heading");
    const eyebrow = mk("p", "tsv-sheet__eyebrow");
    eyebrow.hidden = true;
    const title = mk("h2", "tsv-sheet__title", { id: "tsv-sheet-title" });
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    const nav = mk("div", "tsv-sheet__nav");
    const count = mk("span", "tsv-sheet__count", { "aria-hidden": "true" });
    nav.appendChild(count);
    bar.appendChild(heading);
    bar.appendChild(nav);
    const content = mk("div", "tsv-sheet__content");
    panel.appendChild(bar);
    panel.appendChild(content);
    const live = mk("p", "tsv-sr", { "aria-live": "polite" });
    dlg.appendChild(panel);
    dlg.appendChild(live);

    Object.assign(S, { dlg: dlg, panel: panel, bar: bar, eyebrow: eyebrow, title: title, nav: nav, count: count, content: content, live: live });

    S.prevBtn = ibtn("tsv-sheet__prev", "Previous work", PATH.prev);
    S.nextBtn = ibtn("tsv-sheet__next", "Next work", PATH.next);
    S.closeBtn = ibtn("tsv-sheet__close", "Close", PATH.close);
    nav.appendChild(S.prevBtn);
    nav.appendChild(S.nextBtn);
    bar.appendChild(S.closeBtn);

    S.prevBtn.addEventListener("click", () => step(-1));
    S.nextBtn.addEventListener("click", () => step(1));
    S.closeBtn.addEventListener("click", requestClose);

    /* Esc: run our own close so the exit animation and the history stay in step */
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      requestClose();
    });
    dlg.addEventListener("close", onClosed);

    /* a click on the dim layer (the dialog itself) closes; a drag that ends there does not */
    let downOnDim = false;
    dlg.addEventListener("pointerdown", (e) => {
      downOnDim = e.target === dlg;
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg && downOnDim) requestClose();
      downOnDim = false;
    });

    dlg.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        trap(e, dlg, panel);
        return;
      }
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && t.closest && t.closest("input, textarea, select, .tsv-media__track")) return;
      if (e.key === "ArrowRight" || e.key === "]") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "[") {
        e.preventDefault();
        step(-1);
      }
    });

    wireSwipe(bar, panel);
    document.body.appendChild(dlg);
  }

  /* swipe the header down to dismiss, phones only */
  function wireSwipe(bar, panel) {
    let startY = 0;
    let dy = 0;
    let t0 = 0;
    let pid = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || window.innerWidth > 767 || (e.target.closest && e.target.closest("button"))) return;
      pid = e.pointerId;
      startY = e.clientY;
      dy = 0;
      t0 = e.timeStamp;
      panel.style.transition = "none";
      try { bar.setPointerCapture(pid); } catch (err) { /* ignore */ }
    });
    bar.addEventListener("pointermove", (e) => {
      if (pid === null || e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = "translate3d(0," + dy + "px,0)";
    });
    const end = (e) => {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      panel.style.transition = "";
      const v = dy / Math.max(1, e.timeStamp - t0);
      if (dy > 110 || (dy > 40 && v > 0.6)) {
        panel.style.transform = "translate3d(0,100%,0)";
        requestClose();
      } else {
        panel.style.transform = "";
      }
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }

  /* a block's text may sit straight under its label; give it a body wrapper */
  function wrapBody(block) {
    if ($(".tsv-block__body", block)) return;
    const label = $(".tsv-block__label", block);
    const body = mk("div", "tsv-block__body");
    Array.from(block.childNodes).forEach((n) => {
      if (n !== label) body.appendChild(n);
    });
    block.appendChild(body);
  }

  function buildContent(s) {
    const c = mk("div", "tsv-sheet__content");
    if (s.tpl) {
      c.appendChild(document.importNode(s.node.content, true));
    } else {
      const clone = s.node.cloneNode(true);
      ["hidden", "id", "data-sheet-src", "data-title", "data-eyebrow", "data-group"].forEach((a) => clone.removeAttribute(a));
      while (clone.firstChild) c.appendChild(clone.firstChild);
    }
    /* the sheet header carries the title, so the inline heading is dropped from the clone */
    $$(".tsv-article__title", c).forEach((h) => h.remove());
    if (!s.hasTitleAttr) {
      const h = $("h1, h2", c);
      if (h) h.remove();
    }
    $$(".tsv-block", c).forEach(wrapBody);
    $$(".tsv-media", c).forEach(buildCarousel);
    Array.prototype.forEach.call(c.children, (n, i) => n.style.setProperty("--tsv-i", i));
    return c;
  }

  function show(s, dir) {
    disposeMedia();
    const list = listFor(s);
    const idx = Math.max(0, list.findIndex((x) => x.id === s.id));
    S.list = list;
    S.idx = idx;
    S.id = s.id;

    S.title.textContent = s.title;
    S.eyebrow.textContent = s.eyebrow;
    S.eyebrow.hidden = !s.eyebrow;

    /* videos are judged against the scrolling panel minus the sticky header that covers its top */
    S.vio = hasIO ? new IntersectionObserver(onVideoVisible, { root: S.panel, rootMargin: "-" + (S.bar.offsetHeight || 0) + "px 0px 0px 0px", threshold: [0, 0.6, 1] }) : null;

    const content = buildContent(s);
    if (dir) content.setAttribute("data-dir", dir);
    S.content.replaceWith(content);
    S.content = content;
    S.panel.scrollTop = 0;

    const many = list.length > 1;
    S.nav.hidden = !many;
    S.count.textContent = pad2(idx + 1) + " / " + pad2(list.length);
    if (many) {
      const p = list[(idx - 1 + list.length) % list.length];
      const n = list[(idx + 1) % list.length];
      S.prevBtn.setAttribute("aria-label", "Previous work: " + p.title);
      S.prevBtn.title = "Previous: " + p.title;
      S.nextBtn.setAttribute("aria-label", "Next work: " + n.title);
      S.nextBtn.title = "Next: " + n.title;
    }
    S.live.textContent = (many ? "Work " + (idx + 1) + " of " + list.length + ": " : "") + s.title;
  }

  function openSheet(id, o) {
    o = o || {};
    const s = findSource(id);
    if (!s) return false;
    ensure();
    const open = S.dlg.open;
    if (open && !S.closing && S.id === id) return true;

    /* an open request during the exit animation brings the sheet back */
    if (S.closing) {
      S.closing = false;
      clearTimeout(S.t);
      S.dlg.classList.remove("is-closing");
      S.dlg.classList.add("is-open");
      S.panel.style.transform = "";
      S.panel.style.transition = "";
    }
    const fresh = !open || !S.id;
    const from = S.id;

    if (fresh) {
      const a = document.activeElement;
      S.trigger = o.trigger || (a && a !== document.body ? a : null);
      if (o.push !== false) {
        try {
          history.pushState({ tsv: id }, "", "#" + encodeURIComponent(id));
          S.pushed = true;
        } catch (e) {
          S.pushed = false;
        }
      } else {
        S.pushed = !!o.pushed;
      }
      lock();
      if (!S.dlg.open) S.dlg.showModal();
      S.panel.style.transform = "";
      void S.dlg.offsetWidth;
      S.dlg.classList.add("is-open");
    } else if (o.push !== false) {
      try {
        history.replaceState({ tsv: id }, "", "#" + encodeURIComponent(id));
      } catch (e) { /* ignore */ }
    }

    show(s, o.dir);
    if (fresh || !S.dlg.contains(document.activeElement) || document.activeElement === document.body) {
      S.panel.focus({ preventScroll: true });
    }
    /* a page that loads with #id: the browser's fragment step can pull focus back to the
       document once loading ends, so put it back inside the sheet */
    if (o.fromLoad) {
      const refocus = () => {
        if (S.dlg && S.dlg.open && !S.closing && !S.dlg.contains(document.activeElement)) S.panel.focus({ preventScroll: true });
      };
      setTimeout(refocus, 0);
      if (document.readyState !== "complete") window.addEventListener("load", () => setTimeout(refocus, 0), { once: true });
    }
    emit("tsv:open", {
      id: id,
      title: s.title,
      index: S.idx,
      total: S.list.length,
      from: from,
      trigger: S.trigger
    });
    return true;
  }

  function step(d) {
    if (!S.dlg || !S.dlg.open || S.closing || S.list.length < 2) return;
    const n = S.list.length;
    const next = S.list[(S.idx + d + n) % n];
    closeLightboxNow();
    openSheet(next.id, { dir: d > 0 ? "next" : "prev" });
  }

  const isOpen = () => !!(S.dlg && S.dlg.open && !S.closing);

  function stripHash() {
    if (!location.hash) return;
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) { /* ignore */ }
  }

  /* close from the interface: if we pushed a history entry, step back so Back and close agree */
  function requestClose() {
    if (!isOpen()) return;
    if (S.pushed) {
      history.back();
      clearTimeout(S.hb);
      S.hb = setTimeout(() => {
        if (isOpen()) {
          stripHash();
          closeNow();
        }
      }, 300);
    } else {
      stripHash();
      closeNow();
    }
  }

  function closeNow() {
    const d = S.dlg;
    if (!d || !d.open || S.closing) return;
    closeLightboxNow();
    S.closing = true;
    S.pushed = false;
    d.classList.remove("is-open");
    d.classList.add("is-closing");
    const ms = msOf(S.panel);
    clearTimeout(S.t);
    S.t = setTimeout(() => {
      if (d.open) d.close();
    }, ms < 20 ? 0 : ms + 30);
  }

  function onClosed() {
    clearTimeout(S.t);
    clearTimeout(S.hb);
    const id = S.id;
    const trigger = S.trigger;
    S.closing = false;
    S.dlg.classList.remove("is-open", "is-closing");
    S.panel.style.transform = "";
    S.panel.style.transition = "";
    disposeMedia();
    const c = mk("div", "tsv-sheet__content");
    S.content.replaceWith(c);
    S.content = c;
    S.id = null;
    S.list = [];
    S.idx = -1;
    S.pushed = false;
    S.trigger = null;
    unlock();

    /* focus goes back to what opened this work, else to a card for it, else to what opened the sheet */
    const seen = (n) => n && n.isConnected && n.getClientRects().length > 0;
    let target = null;
    if (seen(trigger) && openerId(trigger) === id) target = trigger;
    else if (id) target = $$(OPENER).find((n) => openerId(n) === id && seen(n)) || null;
    if (!target && trigger && trigger.isConnected) target = trigger;
    if (target && target.focus) {
      try {
        target.focus({ preventScroll: target === trigger });
      } catch (e) { /* ignore */ }
    }
    if (id) emit("tsv:close", { id: id, trigger: target });
  }

  /* ---------- history and hash ---------- */

  function hashId() {
    const h = location.hash.slice(1);
    try {
      return decodeURIComponent(h);
    } catch (e) {
      return h;
    }
  }

  function sync(fromLoad) {
    const id = hashId();
    if (id && findSource(id)) {
      if (S.dlg && S.dlg.open && !S.closing && S.id === id) return;
      openSheet(id, { push: false, pushed: !fromLoad, fromLoad: !!fromLoad });
    } else if (isOpen()) {
      closeNow();
    }
  }

  window.addEventListener("popstate", () => sync(false));
  window.addEventListener("hashchange", () => sync(false));

  /* ---------- video (visible plays, hidden pauses) ---------- */

  function syncVideo(v) {
    /* a video plays only while it is on screen, is the slide in front, and nothing covers it */
    const want = v.__vis && v.__front !== false && !document.hidden && !S.lbOpen && (v.__userPlay || (!v.__userPause && !reduced()));
    if (want) {
      if (v.paused) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      }
    } else if (!v.paused) {
      v.pause();
    }
  }

  function onVideoVisible(entries) {
    entries.forEach((en) => {
      en.target.__vis = en.isIntersecting && en.intersectionRatio >= 0.6;
      syncVideo(en.target);
    });
  }

  const syncAllVideos = () => S.videos.forEach(syncVideo);

  document.addEventListener("visibilitychange", syncAllVideos);

  function disposeMedia() {
    if (S.vio) {
      S.vio.disconnect();
      S.vio = null;
    }
    S.videos.forEach((v) => {
      try { v.pause(); } catch (e) { /* ignore */ }
      v.removeAttribute("src");
      $$("source", v).forEach((n) => n.remove());
      try { v.load(); } catch (e) { /* ignore */ }
    });
    S.videos = [];
  }

  /* ---------- media carousel ---------- */

  const KIND = { screenshot: "Screenshot", replay: "Replay", video: "Replay", diagram: "Diagram", code: "Code", terminal: "Terminal" };

  function kindOf(fig, isVideo) {
    const k = (fig.getAttribute("data-kind") || (isVideo ? "replay" : "screenshot")).toLowerCase();
    return { k: k, label: fig.getAttribute("data-kind-label") || KIND[k] || k.charAt(0).toUpperCase() + k.slice(1) };
  }

  function decorate(fig, index, total, carousel) {
    fig.classList.add("tsv-media__item");
    fig.setAttribute("role", "group");
    fig.setAttribute("aria-roledescription", "slide");
    fig.setAttribute("aria-label", index + 1 + " of " + total);

    const video = $("video", fig);
    const img = video ? null : $("img", fig);
    const cap = $("figcaption", fig);
    if (cap) cap.classList.add("tsv-media__cap");
    const capText = cap ? cap.textContent.trim() : "";

    const frame = mk("div", "tsv-media__frame");
    fig.insertBefore(frame, fig.firstChild);

    if (img) {
      img.setAttribute("draggable", "false");
      const zb = mk("button", "tsv-media__zoom", {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-label": "Zoom image: " + (capText || img.getAttribute("alt") || "screenshot " + (index + 1))
      });
      zb.appendChild(img);
      frame.appendChild(zb);
      zb.addEventListener("click", () => openLightbox(carousel, index));
      carousel.__zoomBtns[index] = zb;
    } else if (video) {
      video.muted = true;
      video.setAttribute("muted", "");
      video.loop = true;
      video.setAttribute("loop", "");
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("draggable", "false");
      video.removeAttribute("autoplay");
      video.removeAttribute("controls");
      video.setAttribute("preload", video.getAttribute("poster") ? "none" : "metadata");
      frame.appendChild(video);
      video.__vis = !hasIO;
      video.__front = index === 0;
      (carousel.__videos = carousel.__videos || []).push({ v: video, i: index });
      S.videos.push(video);
      if (S.vio) S.vio.observe(video);

      const play = mk("button", "tsv-media__play is-paused", { type: "button", "aria-label": "Play video" });
      play.appendChild(icon(PATH.pause, "tsv-ico-pause"));
      play.appendChild(icon(PATH.play, "tsv-ico-play"));
      frame.appendChild(play);
      const upd = () => {
        play.classList.toggle("is-paused", video.paused);
        play.setAttribute("aria-label", video.paused ? "Play video" : "Pause video");
      };
      video.addEventListener("play", upd);
      video.addEventListener("pause", upd);
      play.addEventListener("click", () => {
        if (video.paused) {
          video.__userPlay = true;
          video.__userPause = false;
          video.__vis = true;
        } else {
          video.__userPause = true;
          video.__userPlay = false;
        }
        syncVideo(video);
      });
    }

    const kind = kindOf(fig, !!video);
    const badge = mk("span", "tsv-kind", { "data-kind": kind.k });
    badge.textContent = kind.label;
    frame.appendChild(badge);
  }

  function buildCarousel(el) {
    if (el.__tsv) return;
    const figs = Array.from(el.children).filter((n) => n.tagName === "FIGURE");
    if (!figs.length) return;
    el.__tsv = true;
    el.__zoomBtns = [];
    const n = figs.length;
    const label = el.getAttribute("aria-label") || el.getAttribute("data-label") || "Screens and replays";
    el.classList.add("is-ready");
    el.setAttribute("role", "region");
    el.setAttribute("aria-roledescription", "carousel");
    el.setAttribute("aria-label", label);
    el.setAttribute("data-count", String(n));

    const track = mk("div", "tsv-media__track", { tabindex: "0", role: "group", "aria-label": "Items, use the left and right arrow keys" });
    figs.forEach((fig, i) => {
      decorate(fig, i, n, el);
      track.appendChild(fig);
    });
    el.appendChild(track);
    el.__track = track;
    el.__figs = figs;
    if (n < 2) return;

    const bar = mk("div", "tsv-media__bar");
    const dots = mk("div", "tsv-media__dots", { role: "group", "aria-label": "Choose an item" });
    const dotEls = figs.map((f, i) => {
      const d = mk("button", "tsv-dot", { type: "button", "aria-label": "Show item " + (i + 1) + " of " + n });
      d.addEventListener("click", () => goTo(i));
      dots.appendChild(d);
      return d;
    });
    const nav = mk("div", "tsv-media__nav");
    const count = mk("span", "tsv-media__count", { "aria-hidden": "true" });
    const prev = ibtn("tsv-media__prev", "Previous item", PATH.prev);
    const next = ibtn("tsv-media__next", "Next item", PATH.next);
    nav.appendChild(count);
    nav.appendChild(prev);
    nav.appendChild(next);
    bar.appendChild(dots);
    bar.appendChild(nav);
    el.appendChild(bar);

    /* every stop is exact: the first slide flush left, the last flush right, the others centred */
    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const centerOf = (i) => {
      if (i <= 0) return 0;
      if (i >= n - 1) return maxScroll();
      const f = figs[i];
      return clamp(f.offsetLeft + f.offsetWidth / 2 - track.clientWidth / 2, 0, maxScroll());
    };
    const nearest = (x) => {
      let best = 0;
      let bd = Infinity;
      figs.forEach((f, i) => {
        const d = Math.abs(centerOf(i) - x);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };

    let cur = 0;
    let raf = 0;
    let anim = 0;
    let pending = null;
    const current = () => nearest(track.scrollLeft);
    const paint = () => {
      raf = 0;
      cur = current();
      el.setAttribute("data-current", String(cur));
      dotEls.forEach((d, i) => {
        if (i === cur) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
      prev.setAttribute("aria-disabled", cur === 0 ? "true" : "false");
      next.setAttribute("aria-disabled", cur === n - 1 ? "true" : "false");
      count.textContent = cur + 1 + " / " + n;
      (el.__videos || []).forEach((o) => {
        const front = o.i === cur;
        if (o.v.__front !== front) {
          o.v.__front = front;
          syncVideo(o.v);
        }
      });
    };

    /* glide to a scroll position with an ease out, snapping steps aside while it runs */
    const cancelAnim = () => {
      if (anim) cancelAnimationFrame(anim);
      anim = 0;
      pending = null;
      track.classList.remove("is-settling");
    };
    const glide = (x, done) => {
      cancelAnimationFrame(anim);
      anim = 0;
      const x0 = track.scrollLeft;
      const d = x - x0;
      const end = () => {
        anim = 0;
        pending = null;
        track.classList.remove("is-settling");
        paint();
        if (done) done();
      };
      if (reduced() || Math.abs(d) < 1) {
        track.classList.add("is-settling");
        track.scrollLeft = x;
        end();
        return;
      }
      track.classList.add("is-settling");
      const dur = clamp(Math.abs(d) * 0.55 + 200, 240, 440);
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        track.scrollLeft = x0 + d * (1 - Math.pow(1 - p, 3));
        if (p < 1) anim = requestAnimationFrame(tick);
        else {
          track.scrollLeft = x;
          end();
        }
      };
      anim = requestAnimationFrame(tick);
    };
    function goTo(i) {
      const k = clamp(i, 0, n - 1);
      pending = k;
      glide(centerOf(k));
    }
    const base = () => (pending !== null ? pending : cur);

    track.addEventListener("scroll", () => {
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    prev.addEventListener("click", () => {
      if (prev.getAttribute("aria-disabled") !== "true") goTo(base() - 1);
    });
    next.addEventListener("click", () => {
      if (next.getAttribute("aria-disabled") !== "true") goTo(base() + 1);
    });
    track.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      let to = null;
      if (e.key === "ArrowRight") to = base() + 1;
      else if (e.key === "ArrowLeft") to = base() - 1;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = n - 1;
      if (to === null) return;
      e.preventDefault();
      e.stopPropagation();
      goTo(to);
    });

    /* a touch or a wheel takes over from a running glide; native snap does the rest */
    track.addEventListener("touchstart", cancelAnim, { passive: true });
    track.addEventListener("wheel", cancelAnim, { passive: true });

    /* mouse drag: a small threshold keeps a plain click a click, release glides to the nearest slide */
    let drag = null;
    let suppress = false;
    track.addEventListener("dragstart", (e) => e.preventDefault());
    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, s0: track.scrollLeft, start: current(), moved: false, samples: [] };
    });
    track.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 6) return;
        drag.moved = true;
        drag.x0 = e.clientX;
        /* the drag takes over from a running glide; snapping stays off the whole time */
        track.classList.add("is-dragging");
        cancelAnim();
        drag.s0 = track.scrollLeft;
        drag.start = current();
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      track.scrollLeft = drag.s0 - (e.clientX - drag.x0);
      drag.samples.push({ t: e.timeStamp, x: e.clientX });
      while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 110) drag.samples.shift();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      try { track.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      suppress = true;
      setTimeout(() => { suppress = false; }, 60);
      /* the speed at the moment of release; a pause before letting go means no flick */
      let v = 0;
      if (d.samples.length > 1) {
        const a = d.samples[0];
        const z = d.samples[d.samples.length - 1];
        if (e.timeStamp - z.t < 90) v = (z.x - a.x) / Math.max(1, z.t - a.t);
      }
      const total = e.clientX - d.x0;
      const pitch = n > 1 ? figs[1].offsetLeft - figs[0].offsetLeft : track.clientWidth;
      let k = nearest(track.scrollLeft - v * 180);
      if (k === d.start && (Math.abs(total) > pitch * 0.22 || Math.abs(v) > 0.35)) k = clamp(d.start + ((total || -v) < 0 ? 1 : -1), 0, n - 1);
      /* settle first, then drop the drag state, so snapping never grabs the scroll in between */
      track.classList.add("is-settling");
      track.classList.remove("is-dragging");
      goTo(k);
    };
    track.addEventListener("pointerup", release);
    track.addEventListener("pointercancel", release);
    track.addEventListener("click", (e) => {
      if (!suppress) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        if (!anim && !(drag && drag.moved)) track.scrollLeft = centerOf(current());
      }).observe(track);
    }
    paint();
  }

  /* ---------- lightbox ---------- */

  function ensureLightbox() {
    if (S.lb) return S.lb;
    const d = mk("dialog", "tsv-lightbox", { "aria-label": "Image viewer", "data-lenis-prevent": "" });
    const count = mk("p", "tsv-lightbox__count", { "aria-hidden": "true" });
    const stage = mk("div", "tsv-lightbox__stage", { "data-lenis-prevent": "" });
    const img = mk("img", "tsv-lightbox__img", { alt: "", draggable: "false" });
    stage.appendChild(img);
    const cap = mk("p", "tsv-lightbox__cap");
    const close = ibtn("tsv-lightbox__close", "Close image", PATH.close);
    const prev = ibtn("tsv-lightbox__prev", "Previous image", PATH.prev);
    const next = ibtn("tsv-lightbox__next", "Next image", PATH.next);
    [count, stage, cap, close, prev, next].forEach((n) => d.appendChild(n));
    document.body.appendChild(d);

    const lb = { dlg: d, img: img, stage: stage, cap: cap, count: count, prev: prev, next: next, close: close, items: [], i: 0, t: 0, closing: false };
    S.lb = lb;

    close.addEventListener("click", closeLightbox);
    prev.addEventListener("click", () => lbGo(-1));
    next.addEventListener("click", () => lbGo(1));
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeLightbox();
    });
    d.addEventListener("close", onLightboxClosed);
    let downOut = false;
    let panned = false;
    d.addEventListener("pointerdown", (e) => {
      downOut = e.target === d || e.target === stage;
    });
    d.addEventListener("click", (e) => {
      if (panned) {
        downOut = false;
        e.stopPropagation();
        return;
      }
      if (downOut && (e.target === d || e.target === stage)) closeLightbox();
      downOut = false;
    }, true);
    /* a zoomed image can be dragged around with the mouse, the scroll bars are hidden */
    let pan = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0 || !d.classList.contains("is-zoom")) return;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!pan.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        pan.moved = true;
        d.classList.add("is-panning");
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      stage.scrollLeft = pan.sl - dx;
      stage.scrollTop = pan.st - dy;
    });
    const endPan = (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      const was = pan.moved;
      pan = null;
      d.classList.remove("is-panning");
      if (was) {
        panned = true;
        setTimeout(() => { panned = false; }, 60);
      }
    };
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);
    d.addEventListener("keydown", (e) => {
      if (e.key === "Tab") trap(e, d, d);
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        lbGo(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        lbGo(-1);
      }
    });
    img.addEventListener("load", () => {
      img.classList.add("is-ready");
      measureZoom();
    });
    img.addEventListener("click", (e) => {
      const zoomed = d.classList.contains("is-zoom");
      if (!zoomed && !d.classList.contains("can-zoom")) return;
      e.stopPropagation();
      if (zoomed) {
        d.classList.remove("is-zoom");
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
        measureZoom();
        return;
      }
      const r = img.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      d.classList.remove("can-zoom");
      d.classList.add("is-zoom");
      requestAnimationFrame(() => {
        stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
        stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
      });
    });
    return lb;
  }

  function measureZoom() {
    const lb = S.lb;
    if (!lb || lb.dlg.classList.contains("is-zoom")) return;
    const img = lb.img;
    const can = img.naturalWidth > img.clientWidth + 6 || img.naturalHeight > img.clientHeight + 6;
    lb.dlg.classList.toggle("can-zoom", can);
  }

  function lbShow(i) {
    const lb = S.lb;
    const it = lb.items[i];
    lb.i = i;
    lb.dlg.classList.remove("is-zoom", "can-zoom");
    lb.img.classList.remove("is-ready");
    lb.img.alt = it.alt;
    lb.img.src = it.src;
    lb.cap.textContent = it.cap;
    lb.cap.hidden = !it.cap;
    const many = lb.items.length > 1;
    lb.prev.hidden = !many;
    lb.next.hidden = !many;
    lb.count.textContent = many ? pad2(i + 1) + " / " + pad2(lb.items.length) : "";
    if (lb.img.complete && lb.img.naturalWidth) {
      lb.img.classList.add("is-ready");
      measureZoom();
    }
  }

  function lbGo(d) {
    const lb = S.lb;
    if (!lb || lb.items.length < 2) return;
    lbShow((lb.i + d + lb.items.length) % lb.items.length);
  }

  function openLightbox(carousel, index) {
    const lb = ensureLightbox();
    lb.items = [];
    $$(".tsv-media__zoom", carousel).forEach((zb) => {
      const img = $("img", zb);
      const fig = zb.closest("figure");
      const cap = fig ? $("figcaption", fig) : null;
      lb.items.push({
        src: img.getAttribute("data-full") || img.currentSrc || img.src,
        alt: img.getAttribute("alt") || "",
        cap: cap ? cap.textContent.trim() : "",
        btn: zb
      });
    });
    const at = lb.items.findIndex((it) => it.btn === carousel.__zoomBtns[index]);
    S.lbOpen = true;
    syncAllVideos();
    lbShow(Math.max(0, at));
    lb.closing = false;
    lb.dlg.classList.remove("is-closing");
    lb.dlg.showModal();
    void lb.dlg.offsetWidth;
    lb.dlg.classList.add("is-open");
    lb.close.focus({ preventScroll: true });
  }

  function closeLightbox() {
    const lb = S.lb;
    if (!lb || !lb.dlg.open || lb.closing) return;
    lb.closing = true;
    lb.dlg.classList.remove("is-open");
    const ms = reduced() ? 0 : msOf(lb.dlg);
    clearTimeout(lb.t);
    lb.t = setTimeout(() => {
      if (lb.dlg.open) lb.dlg.close();
    }, ms < 20 ? 0 : ms + 30);
  }

  function closeLightboxNow() {
    const lb = S.lb;
    if (lb && lb.dlg.open) {
      clearTimeout(lb.t);
      lb.dlg.close();
    }
  }

  function onLightboxClosed() {
    const lb = S.lb;
    clearTimeout(lb.t);
    lb.closing = false;
    lb.dlg.classList.remove("is-open", "is-zoom", "can-zoom");
    lb.img.removeAttribute("src");
    const it = lb.items[lb.i];
    S.lbOpen = false;
    syncAllVideos();
    if (it && it.btn && it.btn.isConnected && S.dlg && S.dlg.open) {
      try { it.btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- cards: roles, parallax, reveal ---------- */

  let revealIO = null;

  function reveal(scope) {
    const cards = $$(".tsv-card:not([data-tsv-seen])", scope);
    if (!cards.length) return;
    const go = !reduced() && hasIO;
    cards.forEach((c) => {
      c.setAttribute("data-tsv-seen", "");
      if (!go) return;
      c.classList.add("is-pre");
      if (!revealIO) {
        revealIO = new IntersectionObserver((entries) => {
          let k = 0;
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            const t = en.target;
            revealIO.unobserve(t);
            t.style.setProperty("--tsv-i", String(k++));
            t.classList.remove("is-pre");
            t.classList.add("is-in");
          });
        }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
      }
      revealIO.observe(c);
    });
  }

  function init(scope) {
    const r = scope && scope.querySelectorAll ? scope : document;
    const triggers = $$(OPENER, r);
    if (r !== document && r.matches && r.matches(OPENER)) triggers.push(r);
    triggers.forEach((t) => {
      t.setAttribute("aria-haspopup", "dialog");
      if (t.tagName === "A" && t.classList.contains("tsv-card")) t.setAttribute("role", "button");
    });
    reveal(r);
    if (!isOpen()) {
      const id = hashId();
      if (id && findSource(id)) sync(true);
    }
  }

  /* click on any opener, also content inserted later */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target && e.target.closest ? e.target.closest(OPENER) : null;
    if (!t) return;
    const id = openerId(t);
    if (!id || !findSource(id)) return;
    e.preventDefault();
    openSheet(id, { trigger: t });
  }, true);

  /* a link styled as a button answers the space bar too */
  document.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && t.matches && t.matches('a.tsv-card[role="button"]')) {
      e.preventDefault();
      t.click();
    }
  });

  /* parallax: the cover follows the pointer a little */
  let pRaf = 0;
  let pCard = null;
  let pX = 0;
  let pY = 0;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || reduced() || !finePointer()) return;
    const c = e.target && e.target.closest ? e.target.closest(".tsv-card") : null;
    if (!c) return;
    const r = c.getBoundingClientRect();
    pCard = c;
    pX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!pRaf) {
      pRaf = requestAnimationFrame(() => {
        pRaf = 0;
        if (!pCard) return;
        pCard.style.setProperty("--tsv-px", pX.toFixed(3));
        pCard.style.setProperty("--tsv-py", pY.toFixed(3));
      });
    }
  }, { passive: true });
  document.addEventListener("pointerleave", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("tsv-card")) {
      t.style.setProperty("--tsv-px", "0");
      t.style.setProperty("--tsv-py", "0");
      if (pCard === t) pCard = null;
    }
  }, true);

  /* ---------- public ---------- */

  window.TSV = {
    version: "1.0.0",
    init: init,
    open: (id, o) => openSheet(id, o || {}),
    close: requestClose,
    next: () => step(1),
    prev: () => step(-1),
    isOpen: isOpen,
    current: () => (isOpen() ? S.id : null)
  };

  const boot = () => init(document);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
