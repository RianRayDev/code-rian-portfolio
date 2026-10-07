(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const linkedin = form.dataset.linkedin;
  const body = form.querySelector("[data-form-body]");
  const done = form.querySelector("[data-done]");
  const status = form.querySelector("[data-status]");
  const submit = form.querySelector("[data-submit]");
  const submitLabel = form.querySelector("[data-submit-label]");
  const trap = form.querySelector("[data-trap]");
  const doneTitle = form.querySelector("[data-done-title]");
  const doneText = form.querySelector("[data-done-text]");
  const doneBox = form.querySelector("[data-done-box]");
  const doneCopy = form.querySelector("[data-done-copy]");
  const doneCopyLabel = form.querySelector("[data-done-copy-label]");
  const doneReset = form.querySelector("[data-done-reset]");
  const fields = Array.from(form.querySelectorAll("[data-field]"));
  const idleLabel = submitLabel.textContent;
  const copyLabel = doneCopyLabel.textContent;
  const messages = form.dataset;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const noSite = /^(none|no|nope|n\/?a|na|nil|nothing|not yet|-+|\.+)$/i;

  const controlsOf = (field) => Array.from(field.querySelectorAll("input, textarea"));

  const valueOf = (field) => {
    const controls = controlsOf(field);
    if (field.dataset.field === "need") {
      const picked = controls.find((c) => c.checked);
      return picked ? picked.value : "";
    }
    return controls[0].value.trim();
  };

  const check = (field) => {
    const value = valueOf(field);
    switch (field.dataset.field) {
      case "name":
        return value.length >= 2 ? "" : "empty";
      case "email":
        if (!value) return "empty";
        return emailPattern.test(value) ? "" : "invalid";
      case "need":
        return value ? "" : "empty";
      case "site":
        return "";
      case "message":
        return value.length >= 10 ? "" : "empty";
      default:
        return "";
    }
  };

  const setError = (field, kind) => {
    const note = field.querySelector("[data-error]");
    const invalid = Boolean(kind);
    field.classList.toggle("is-invalid", invalid);
    controlsOf(field).forEach((c) => {
      if (invalid) c.setAttribute("aria-invalid", "true");
      else c.removeAttribute("aria-invalid");
    });
    note.textContent = invalid ? field.dataset[kind === "invalid" ? "msgInvalid" : "msgEmpty"] : "";
  };

  const validateField = (field) => {
    const kind = check(field);
    setError(field, kind);
    return kind;
  };

  const say = (text) => {
    status.textContent = "";
    window.setTimeout(() => {
      status.textContent = text;
    }, 30);
  };

  const legacyCopy = (text) => {
    const active = document.activeElement;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    area.remove();
    if (active && typeof active.focus === "function") active.focus({ preventScroll: true });
    return ok;
  };

  const modernCopy = async (text) => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return false;
    }
  };

  const copyText = async (text) => {
    if (legacyCopy(text)) return true;
    return modernCopy(text);
  };

  const copyThenOpen = async (text) => {
    if (legacyCopy(text)) return { copied: true, opened: openLinkedIn() };
    const copied = await modernCopy(text);
    return { copied, opened: copied ? openLinkedIn() : false };
  };

  const openLinkedIn = () => {
    const tab = window.open(linkedin, "_blank");
    if (tab) {
      try {
        tab.opener = null;
      } catch (err) {
        return true;
      }
    }
    return Boolean(tab);
  };

  const compose = () => {
    const get = (key) => valueOf(form.querySelector(`[data-field="${key}"]`));
    const lines = [`Hi Rian, this is ${get("name")}.`, "", `Project type: ${get("need")}`];
    const site = get("site");
    if (site && !noSite.test(site)) lines.push(`Current website: ${site}`);
    lines.push("", get("message"), "", `Reply to: ${get("email")}`);
    return lines.join("\n");
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, reduced ? Math.min(ms, 120) : ms));

  let state = "idle";
  let composed = "";
  let flipTimer = 0;

  const setState = (next) => {
    state = next;
    form.dataset.state = next;
    const sending = next === "sending";
    submit.disabled = sending;
    submit.setAttribute("aria-busy", sending ? "true" : "false");
    submitLabel.textContent = sending ? messages.msgSending : idleLabel;
  };

  const showDone = (outcome, text) => {
    doneBox.value = text;
    done.dataset.outcome = outcome;
    if (outcome === "manual") {
      doneTitle.textContent = messages.titleManual;
      doneText.textContent = messages.msgClipboard;
    } else if (outcome === "blocked") {
      doneTitle.textContent = messages.titleDone;
      doneText.textContent = messages.msgBlocked;
    } else {
      doneTitle.textContent = messages.titleDone;
      doneText.textContent = messages.textDone;
    }
    body.hidden = true;
    done.hidden = false;
    form.classList.add("is-done");
    setState("done");
    say(outcome === "ok" ? messages.msgLive : doneText.textContent);
    window.requestAnimationFrame(() => {
      doneBox.style.height = "";
      doneBox.style.height = `${doneBox.scrollHeight + 2}px`;
      doneTitle.focus({ preventScroll: true });
      const top = done.getBoundingClientRect().top;
      if (top < 80 || top > window.innerHeight * 0.6) {
        done.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }
      if (outcome === "manual") {
        doneBox.focus({ preventScroll: true });
        doneBox.select();
      }
    });
  };

  const backToForm = () => {
    done.hidden = true;
    body.hidden = false;
    form.classList.remove("is-done");
    setState("idle");
    say("");
    const first = form.querySelector("[data-field=name] input");
    window.requestAnimationFrame(() => {
      first.focus({ preventScroll: true });
      body.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state === "sending") return;
    let firstInvalid = null;
    fields.forEach((field) => {
      const kind = validateField(field);
      if (kind && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      setState("invalid");
      say(messages.msgSummary);
      firstInvalid.classList.add("is-nudged");
      window.setTimeout(() => firstInvalid.classList.remove("is-nudged"), 600);
      controlsOf(firstInvalid)[0].focus();
      return;
    }
    composed = compose();
    setState("sending");
    say(messages.msgSending);
    const started = Date.now();
    if (trap && trap.checked) {
      await wait(600);
      showDone("ok", composed);
      return;
    }
    const { copied, opened } = await copyThenOpen(composed);
    await wait(Math.max(0, 520 - (Date.now() - started)));
    showDone(!copied ? "manual" : opened ? "ok" : "blocked", composed);
  });

  fields.forEach((field) => {
    field.addEventListener("input", () => {
      field.dataset.touched = "true";
      if (field.classList.contains("is-invalid")) validateField(field);
      if (state === "invalid" && fields.every((f) => !f.classList.contains("is-invalid"))) {
        setState("idle");
        say("");
      }
    });
    field.addEventListener("change", () => {
      if (field.dataset.field === "need" && field.classList.contains("is-invalid")) validateField(field);
    });
    field.addEventListener("focusout", (event) => {
      if (field.contains(event.relatedTarget)) return;
      if (field.dataset.touched === "true") validateField(field);
    });
  });

  doneCopy.addEventListener("click", async () => {
    const ok = await copyText(composed || doneBox.value);
    window.clearTimeout(flipTimer);
    if (ok) {
      doneCopy.classList.add("is-flipped");
      doneCopyLabel.textContent = messages.flipDone;
      say(messages.flipDone);
      flipTimer = window.setTimeout(() => {
        doneCopy.classList.remove("is-flipped");
        doneCopyLabel.textContent = copyLabel;
      }, 2000);
    } else {
      doneBox.focus();
      doneBox.select();
      say(messages.msgClipboard);
    }
  });

  doneReset.addEventListener("click", backToForm);

  document.querySelectorAll("[data-jump]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.getElementById((link.getAttribute("href") || "").slice(1));
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      if (window.history && window.history.replaceState) window.history.replaceState(null, "", link.getAttribute("href"));
      if (event.detail === 0) {
        const into = target.querySelector("input:not([tabindex='-1']), textarea, a[href], button") || target;
        if (into === target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        into.focus({ preventScroll: true });
      }
    });
  });

  setState("idle");
})();
