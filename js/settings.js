const DR_Settings = (() => {
  let cursor = 0;
  let items = [];
  let mode = "root"; // root | topics | faces | skills | faceEdit

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 1400);
  }

  function rebuild() {
    const t = DR_I18N.t;
    const s = DR_Storage.get();
    items = [];

    if (mode === "root") {
      items = [
        row("language", t("language"), langLabel(s.language), cycleLang),
        row("name", t("name"), s.name, cycleName),
        row("personality", t("personality"), t(s.personality) || s.personality, cyclePersonality),
        toggle("idleEnabled", t("idleChat"), s.idleEnabled, (v) => patch({ idleEnabled: v })),
        row("idleMinutes", t("idleEvery"), s.idleMinutes + " " + t("minutes"), cycleIdle),
        toggle("tapChat", t("tapChat"), s.tapChat, (v) => patch({ tapChat: v })),
        toggle("presence", t("presence"), s.presenceEnabled, async (v) => {
          patch({ presenceEnabled: v });
          if (v) await DR_Presence.start();
          else DR_Presence.stop();
        }),
        toggle("worldWatch", t("worldWatch"), s.worldWatch, (v) => patch({ worldWatch: v })),
        toggle("quiet", t("quietHours"), s.quietHours, (v) => patch({ quietHours: v })),
        toggle("express", t("expressSpeech"), s.expressSpeech, (v) => patch({ expressSpeech: v })),
        toggle("journal", t("journal"), s.journal, (v) => patch({ journal: v })),
        row("zip", t("zip"), s.zip || "—", cycleZip),
        row("interests", t("interests"), trim(s.interests) || "—", cycleInterests),
        nav("topics", t("topics"), () => ((mode = "topics"), render())),
        nav("faces", t("faces"), () => DeskRabbit.show("faces")),
        nav("skills", t("skills"), () => DeskRabbit.show("skills")),
        nav("faceEdit", t("customize"), () => ((mode = "faceEdit"), render())),
      ];
    } else if (mode === "topics") {
      const keys = Object.keys(s.topics);
      items = keys.map((k) =>
        toggle("topic-" + k, t("topic_" + k), !!s.topics[k], (v) => {
          const topics = { ...DR_Storage.get().topics, [k]: v };
          patch({ topics });
        })
      );
      items.unshift(nav("backTopics", "← " + t("settings"), () => ((mode = "root"), render())));
    } else if (mode === "faceEdit") {
      const c = s.faceCustom || {};
      items = [
        nav("backFace", "← " + t("settings"), () => ((mode = "root"), render())),
        row("preset", t("facePreset"), s.facePreset, cyclePreset),
        row("eye", t("eyeColor"), c.eyeColor || "default", cycleEye),
        row("pupil", t("pupilColor"), c.pupilColor || "default", cyclePupil),
        row("size", t("eyeSize"), t(c.size || "md"), cycleSize),
        row("gap", t("eyeGap"), t(c.gap || "normal"), cycleGap),
        row("shape", t("eyeShape"), t(c.shape || "round"), cycleShape),
      ];
    }

    cursor = Math.max(0, Math.min(cursor, items.length - 1));
    paint();
  }

  function row(id, label, value, onActivate) {
    return { id, label, value, kind: "row", onActivate };
  }
  function toggle(id, label, on, onToggle) {
    return { id, label, on: !!on, kind: "toggle", onToggle };
  }
  function nav(id, label, onActivate) {
    return { id, label, kind: "nav", onActivate };
  }

  function paint() {
    const list = $("settings-list");
    if (!list) return;
    list.innerHTML = "";
    items.forEach((it, idx) => {
      const div = document.createElement("div");
      div.className = "row" + (idx === cursor ? " selected" : "");
      if (it.kind === "toggle") {
        div.innerHTML = `<div class="label"><b>${esc(it.label)}</b></div><div class="toggle ${
          it.on ? "on" : ""
        }"><i></i></div>`;
      } else if (it.kind === "nav") {
        div.innerHTML = `<div class="label"><b>${esc(it.label)}</b></div><div class="val">›</div>`;
      } else {
        div.innerHTML = `<div class="label"><b>${esc(it.label)}</b></div><div class="val">${esc(
          String(it.value)
        )}</div>`;
      }
      div.addEventListener("click", () => {
        cursor = idx;
        activate();
      });
      list.appendChild(div);
    });
    const sel = list.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function activate() {
    const it = items[cursor];
    if (!it) return;
    if (it.kind === "toggle") {
      it.onToggle(!it.on);
      rebuild();
      persist();
    } else if (it.onActivate) {
      it.onActivate();
      if (mode === "root" || mode === "topics" || mode === "faceEdit") rebuild();
      persist();
    }
  }

  function patch(p) {
    DR_Storage.patch(p);
  }

  async function persist() {
    await DR_Storage.save();
    toast(DR_I18N.t("toastSaved"));
  }

  function langLabel(code) {
    if (code === "auto") return DR_I18N.t("languageAuto") + ` (${DR_I18N.systemLang()})`;
    return code.toUpperCase();
  }

  function cycleLang() {
    const order = ["auto", "en", "de", "fr", "es"];
    const s = DR_Storage.get();
    const i = order.indexOf(s.language);
    const next = order[(i + 1) % order.length];
    patch({ language: next });
    DR_I18N.setLang(next);
    DeskRabbit.refreshChrome();
  }

  function cyclePersonality() {
    const order = ["playful", "calm", "curious", "cheeky", "caring"];
    const s = DR_Storage.get();
    const i = order.indexOf(s.personality);
    patch({ personality: order[(i + 1) % order.length] });
  }

  function cycleIdle() {
    const opts = [3, 5, 8, 10, 15, 20, 30];
    const s = DR_Storage.get();
    const i = opts.indexOf(s.idleMinutes);
    patch({ idleMinutes: opts[(i + 1) % opts.length] });
    DR_Chat.scheduleIdle();
  }

  function cycleName() {
    const names = ["DeskRabbit", "Hase", "Pixel", "Mochi", "Orbit", "Nibs", "Lumen"];
    const s = DR_Storage.get();
    const i = Math.max(0, names.indexOf(s.name));
    patch({ name: names[(i + 1) % names.length] });
  }

  function cycleZip() {
    const samples = ["", "10115", "80331", "20095", "50667", "94110", "SW1A"];
    const s = DR_Storage.get();
    const i = Math.max(0, samples.indexOf(s.zip));
    patch({ zip: samples[(i + 1) % samples.length] });
  }

  function cycleInterests() {
    const samples = [
      "",
      "gardening, AI, coffee",
      "synth, trains, rain",
      "kochen, Sci-Fi, Laufen",
      "photography, cats",
    ];
    const s = DR_Storage.get();
    const i = Math.max(0, samples.indexOf(s.interests));
    patch({ interests: samples[(i + 1) % samples.length] });
  }

  function cyclePreset() {
    const s = DR_Storage.get();
    const i = Math.max(0, DR_PRESETS.findIndex((p) => p.id === s.facePreset));
    const next = DR_PRESETS[(i + 1) % DR_PRESETS.length].id;
    patch({ facePreset: next });
    DR_Face.applyFromSettings();
    DR_Face.setExpression("happy", { temporary: true, ms: 700 });
  }

  function cycleEye() {
    const colors = ["", "#f4f1ea", "#ffe8d6", "#9ad7ff", "#ff8fab", "#67fff0", "#d6ff4a"];
    const c = { ...DR_Storage.get().faceCustom };
    const i = Math.max(0, colors.indexOf(c.eyeColor || ""));
    c.eyeColor = colors[(i + 1) % colors.length];
    patch({ faceCustom: c });
    DR_Face.applyFromSettings();
  }

  function cyclePupil() {
    const colors = ["", "#12131a", "#5b2b16", "#07304a", "#5a1030", "#003832"];
    const c = { ...DR_Storage.get().faceCustom };
    const i = Math.max(0, colors.indexOf(c.pupilColor || ""));
    c.pupilColor = colors[(i + 1) % colors.length];
    patch({ faceCustom: c });
    DR_Face.applyFromSettings();
  }

  function cycleSize() {
    const opts = ["sm", "md", "lg"];
    const c = { ...DR_Storage.get().faceCustom };
    c.size = opts[(opts.indexOf(c.size || "md") + 1) % opts.length];
    patch({ faceCustom: c });
    DR_Face.applyFromSettings();
  }

  function cycleGap() {
    const opts = ["tight", "normal", "wide"];
    const c = { ...DR_Storage.get().faceCustom };
    c.gap = opts[(opts.indexOf(c.gap || "normal") + 1) % opts.length];
    patch({ faceCustom: c });
    DR_Face.applyFromSettings();
  }

  function cycleShape() {
    const opts = ["round", "soft", "square", "wide"];
    const c = { ...DR_Storage.get().faceCustom };
    c.shape = opts[(opts.indexOf(c.shape || "round") + 1) % opts.length];
    patch({ faceCustom: c });
    DR_Face.applyFromSettings();
  }

  function trim(s) {
    return String(s || "").slice(0, 18);
  }

  function render() {
    $("settings-title").textContent = DR_I18N.t("settings");
    rebuild();
  }

  function move(delta) {
    if (!items.length) return;
    cursor = (cursor + delta + items.length) % items.length;
    paint();
  }

  function open() {
    mode = "root";
    cursor = 0;
    render();
  }

  return { open, render, move, activate, toast };
})();
