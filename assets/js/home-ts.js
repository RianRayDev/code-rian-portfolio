(function () {
  "use strict";

  var strip = document.querySelector("[data-strip]");
  if (!strip) return;

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduced = !!(mq && mq.matches);
  var videos = Array.prototype.slice.call(strip.querySelectorAll("video[data-src]"));
  var tiles = Array.prototype.slice.call(strip.children);
  var seen = new Map();

  function play(v) {
    if (reduced) return;
    if (!v.getAttribute("src")) {
      v.setAttribute("src", v.getAttribute("data-src"));
    }
    var p = v.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  function sync(v) {
    if (seen.get(v) && !document.hidden) play(v);
    else if (!v.paused) v.pause();
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        seen.set(e.target, e.isIntersecting && e.intersectionRatio >= 0.5);
        sync(e.target);
      });
    }, { threshold: [0, 0.5, 1] });
    videos.forEach(function (v) { io.observe(v); });
    document.addEventListener("visibilitychange", function () {
      videos.forEach(sync);
    });
  }

  var prev = document.querySelector(".hm-arrow[data-dir='-1']");
  var next = document.querySelector(".hm-arrow[data-dir='1']");
  var target = null;
  var settleTimer = 0;

  function edge() {
    return parseFloat(getComputedStyle(strip).paddingLeft) || 0;
  }

  function stops() {
    var max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    var e = edge();
    var out = [];
    tiles.forEach(function (t) {
      var v = Math.round(Math.min(max, Math.max(0, t.offsetLeft - e)));
      if (!out.length || Math.abs(out[out.length - 1] - v) > 1) out.push(v);
    });
    if (out.length > 2 && tiles.length > 1) {
      var pitch = tiles[1].offsetLeft - tiles[0].offsetLeft;
      if (out[out.length - 1] - out[out.length - 2] < pitch * 0.15) out.splice(out.length - 2, 1);
    }
    return out;
  }

  function nearest(list, x) {
    var best = list[0];
    list.forEach(function (v) {
      if (Math.abs(v - x) < Math.abs(best - x)) best = v;
    });
    return best;
  }

  function buttons() {
    var max = strip.scrollWidth - strip.clientWidth;
    if (prev) prev.disabled = strip.scrollLeft <= 2;
    if (next) next.disabled = strip.scrollLeft >= max - 2;
  }

  function done() {
    clearTimeout(settleTimer);
    target = null;
    strip.classList.remove("is-settle");
    buttons();
  }

  function glide(x) {
    target = x;
    strip.classList.add("is-settle");
    clearTimeout(settleTimer);
    settleTimer = setTimeout(done, reduced ? 60 : 800);
    strip.scrollTo({ left: x, behavior: reduced ? "auto" : "smooth" });
  }

  function step(dir) {
    var list = stops();
    var base = target !== null ? target : strip.scrollLeft;
    var x;
    if (dir > 0) {
      x = list.filter(function (v) { return v > base + 2; })[0];
    } else {
      x = list.filter(function (v) { return v < base - 2; }).pop();
    }
    if (x === undefined) return;
    glide(x);
  }

  if (prev) prev.addEventListener("click", function () { step(-1); });
  if (next) next.addEventListener("click", function () { step(1); });

  strip.addEventListener("keydown", function (e) {
    if (e.target !== strip) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  if ("onscrollend" in window) {
    strip.addEventListener("scrollend", function () {
      if (strip.classList.contains("is-settle")) done();
    });
  }

  var ticking = false;
  strip.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      buttons();
    });
  }, { passive: true });
  window.addEventListener("resize", buttons);

  var drag = null;
  var suppress = false;

  strip.addEventListener("dragstart", function (e) { e.preventDefault(); });

  strip.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || e.button !== 0) return;
    clearTimeout(settleTimer);
    target = null;
    strip.classList.remove("is-settle");
    drag = { id: e.pointerId, x: e.clientX, left: strip.scrollLeft, moved: false, marks: [] };
  });

  strip.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      strip.classList.add("is-drag");
      try { strip.setPointerCapture(e.pointerId); } catch (err) {}
      drag.x = e.clientX;
      drag.left = strip.scrollLeft;
      dx = 0;
    }
    strip.scrollLeft = drag.left - dx;
    var now = performance.now();
    drag.marks.push([now, e.clientX]);
    while (drag.marks.length > 2 && now - drag.marks[0][0] > 120) drag.marks.shift();
  });

  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    if (!d.moved) return;
    suppress = true;
    setTimeout(function () { suppress = false; }, 60);
    var v = 0;
    var m = d.marks;
    if (m.length > 1) {
      var dt = m[m.length - 1][0] - m[0][0];
      if (dt > 0) v = (m[m.length - 1][1] - m[0][1]) / dt;
    }
    var list = stops();
    var to = nearest(list, strip.scrollLeft - v * 260);
    strip.classList.remove("is-drag");
    try { strip.releasePointerCapture(e.pointerId); } catch (err) {}
    glide(to);
  }

  strip.addEventListener("pointerup", release);
  strip.addEventListener("pointercancel", release);

  strip.addEventListener("click", function (e) {
    if (!suppress) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  buttons();
})();
