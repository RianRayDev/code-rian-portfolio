const CONTACT_ENDPOINT = "https://rianray.dev/api/contact";

(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var done = document.getElementById("ct-done");
  var status = document.getElementById("ct-status");
  var submit = form.querySelector(".ct-submit");
  var label = form.querySelector(".ct-submit__label");
  var again = done ? done.querySelector(".ct-again") : null;
  var timer = form.elements.elapsed;
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var busy = false;
  var tried = false;

  var fields = {
    name: { el: form.elements.name, err: document.getElementById("ct-name-err"), text: "Please enter your name." },
    email: { el: form.elements.email, err: document.getElementById("ct-email-err"), text: "Please enter a valid email address." },
    message: { el: form.elements.message, err: document.getElementById("ct-message-err"), text: "Please write a little more, so I know how to help." }
  };

  function valid(key) {
    var v = fields[key].el.value;
    if (key === "name") return v.trim().length > 0;
    if (key === "email") return emailPattern.test(v.trim());
    return v.trim().length >= 10;
  }

  function mark(key, show) {
    var f = fields[key];
    f.err.textContent = show ? f.text : "";
    if (show) f.el.setAttribute("aria-invalid", "true");
    else f.el.removeAttribute("aria-invalid");
  }

  function say(text, tone) {
    status.textContent = text || "";
    if (tone) status.setAttribute("data-tone", tone);
    else status.removeAttribute("data-tone");
  }

  function wait(on) {
    busy = on;
    submit.disabled = on;
    submit.setAttribute("aria-busy", on ? "true" : "false");
    form.classList.toggle("is-busy", on);
    label.textContent = on ? "Sending" : "Send message";
  }

  Object.keys(fields).forEach(function (key) {
    var el = fields[key].el;
    el.addEventListener("blur", function () {
      if (tried && el.value.length) mark(key, !valid(key));
    });
    el.addEventListener("input", function () {
      if (el.getAttribute("aria-invalid") === "true" && valid(key)) mark(key, false);
    });
  });

  function show(panel, on) {
    if (on) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  }

  function finish() {
    form.reset();
    wait(false);
    say("", "");
    show(form, false);
    show(done, true);
    done.focus({ preventScroll: true });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    tried = true;
    say("", "");
    var first = null;
    Object.keys(fields).forEach(function (key) {
      var bad = !valid(key);
      mark(key, bad);
      if (bad && !first) first = fields[key].el;
    });
    if (first) {
      first.focus();
      return;
    }
    if (!CONTACT_ENDPOINT) {
      say("The form is being connected. Please use LinkedIn for now.", "calm");
      return;
    }
    timer.value = String(Math.round(performance.now()));
    var body = {
      name: fields.name.el.value.trim(),
      email: fields.email.el.value.trim(),
      message: fields.message.el.value.trim(),
      trap: form.elements.website.value,
      elapsed: Number(timer.value)
    };
    wait(true);
    fetch(CONTACT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.status === 500) {
        var config = new Error("config");
        config.config = true;
        throw config;
      }
      if (!res.ok) throw new Error("status");
      return res.json().catch(function () { return { ok: true }; });
    }).then(function (data) {
      if (data && data.ok === false) throw new Error("reply");
      finish();
    }).catch(function (err) {
      wait(false);
      if (err && err.config) say("The form is being connected. Please use LinkedIn for now.", "calm");
      else say("Something went wrong. Please try again or use LinkedIn.", "error");
    });
  });

  if (again) {
    again.addEventListener("click", function () {
      show(done, false);
      show(form, true);
      Object.keys(fields).forEach(function (key) { mark(key, false); });
      say("", "");
      fields.name.el.focus();
    });
  }

  function jump() {
    var pane = document.getElementById("contact-pane") || form;
    var r = pane.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    window.scrollTo({ top: Math.max(0, r.top + window.scrollY - 96), behavior: "auto" });
  }

  if (document.URL.split("#")[1] === "contact-form") {
    window.addEventListener("load", function () {
      window.setTimeout(jump, 120);
    });
  }
})();
