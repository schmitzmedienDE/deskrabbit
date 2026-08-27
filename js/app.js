const DeskRabbit = (() => {
  let screen = "face";
  let facesCursor = 0;
  let longPressing = false;
  let clickTimes = [];
  let ignoreClickUntil = 0;

  function sheet(name) {
    return document.getElementById("screen-" + name);
  }

  function show(name) {
    screen = name;
    ["settings", "faces"].forEach((id) => {
      const el = sheet(id);
      if (!el) return;
      if (id === name) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    document.getElementById("app").dataset.screen = name === "face" ? "face" : name;

    if (name === "settings") {
      DR_Settings.open();
      DR_Companion.renderHud();
      const log = document.getElementById("settings-log");
      if (log) log.textContent = DR_Chat.getLog() || "";
    }
    if (name === "faces") renderFaces();
    if (name === "face") {
      DR_Face.applyFromSettings();
      refreshChrome();
    }
  }

  function refreshChrome() {
    const st = document.getElementById("settings-title");
    const ft = document.getElementById("faces-title");
    if (st) st.textContent = DR_I18N.t("settings");
    if (ft) ft.textContent = DR_I18N.t("faces");
  }

  function renderFaces() {
    const list = document.getElementById("faces-list");
    list.innerHTML = "";
    const s = DR_Storage.get();
    DR_PRESETS.forEach((p, idx) => {
      const div = document.createElement("div");
      div.className = "row" + (idx === facesCursor ? " selected" : "");
      const active = s.facePreset === p.id ? " ★" : "";
      div.innerHTML = `<div class="label"><b>${p.label}${active}</b><span>${p.id}</span></div>`;
      div.addEventListener("click", () => {
        facesCursor = idx;
        selectFace(p.id);
      });
      list.appendChild(div);
    });
    const sel = list.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  function selectFace(id) {
    DR_Storage.patch({ facePreset: id });
    DR_Face.applyFromSettings();
    DR_Storage.save();
    DR_Settings.toast(DR_I18N.t("toastSaved"));
    renderFaces();
    DR_Face.setExpression("happy", { temporary: true, ms: 900 });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function onScroll(dir) {
    DR_Chat.touch();
    if (screen === "face") {
      show("settings");
      return;
    }
    if (screen === "settings") {
      DR_Settings.move(dir);
      return;
    }
    if (screen === "faces") {
      facesCursor = (facesCursor + dir + DR_PRESETS.length) % DR_PRESETS.length;
      renderFaces();
      return;
    }
  }

  function onSideClick() {
    if (Date.now() < ignoreClickUntil) return;
    DR_Chat.touch();
    const now = Date.now();
    clickTimes = clickTimes.filter((t) => now - t < 400);
    clickTimes.push(now);

    if (screen === "settings") {
      DR_Settings.activate();
      return;
    }
    if (screen === "faces") {
      selectFace(DR_PRESETS[facesCursor].id);
      return;
    }

    if (clickTimes.length >= 2) {
      DR_Companion.interact("pet");
      DR_Chat.setLog(DR_I18N.t("pet"));
      DR_Face.setExpression("love", { temporary: true, ms: 1600 });
      clickTimes = [];
      return;
    }

    setTimeout(() => {
      if (clickTimes.length === 1 && Date.now() - clickTimes[0] >= 280) {
        DR_Chat.tapChat();
        clickTimes = [];
      }
    }, 300);
  }

  function wire() {
    // Scroll direction: device scrollDown → next item (was inverted)
    DR_SDK.on("scrollUp", () => onScroll(1));
    DR_SDK.on("scrollDown", () => onScroll(-1));
    DR_SDK.on("sideClick", onSideClick);
    DR_SDK.on("longPressStart", () => {
      longPressing = true;
      ignoreClickUntil = Date.now() + 800;
      DR_Chat.touch();
      DR_Chat.startListen();
    });
    DR_SDK.on("longPressEnd", () => {
      if (!longPressing) return;
      longPressing = false;
      ignoreClickUntil = Date.now() + 800;
      DR_Chat.stopListenAndReply();
    });

    DR_SDK.on("pluginMessage", (data) => {
      DR_Chat.handlePluginMessage(data);
    });

    DR_SDK.on("presenceEnter", () => {
      // silent bond only — no auto welcome babble
      if (typeof DR_Chat.getPhase === "function" && DR_Chat.getPhase() === "idle") {
        DR_Face.setExpression("happy", { temporary: true, ms: 800 });
      }
    });

    document.getElementById("btn-back").addEventListener("click", () => show("face"));
    document.getElementById("btn-faces-back").addEventListener("click", () => show("settings"));

    document.getElementById("stage").addEventListener("click", () => {
      if (screen === "face") onSideClick();
    });
  }

  let shakeCooldown = 0;
  let lastStrong = 0;
  function onAccel(data) {
    const x = data.rawX != null ? data.rawX : data.x || 0;
    const y = data.rawY != null ? data.rawY : data.y || 0;
    const z = data.rawZ != null ? data.rawZ : data.z || 0;
    // Prefer raw magnitude when available; tilt-normalized values are smaller
    const mag =
      data.rawX != null
        ? Math.sqrt(x * x + y * y + z * z)
        : Math.sqrt(x * x + y * y + z * z) * 18;

    const state = DR_Motion.sample(mag);
    const now = Date.now();

    if (state === "shaken_strong" && now - lastStrong > 2500) {
      lastStrong = now;
      shakeCooldown = now + 2000;
      if (screen === "face") DR_Chat.onShakeStrong();
      return;
    }

    if (state === "relocated" && screen === "face") {
      DR_Chat.onRelocated();
      return;
    }

    if (state === "shaken_light" && now > shakeCooldown) {
      shakeCooldown = now + 900;
      if (screen === "face") DR_Chat.onShakeLight();
    }

    const tx = data.tiltX != null ? data.tiltX : x;
    if (state === "still" && DR_Chat.getPhase() === "idle") {
      if (tx > 0.35) DR_Face.setExpression("look-right", { temporary: true, ms: 400 });
      else if (tx < -0.35) DR_Face.setExpression("look-left", { temporary: true, ms: 400 });
    }
  }

  async function boot() {
    DR_SDK.boot();
    await DR_Storage.load();
    const s = DR_Storage.get();
    DR_I18N.setLang(s.language);
    DR_Face.mount(document.getElementById("face"));
    DR_Companion.renderHud();
    DR_Companion.tick();
    refreshChrome();
    show("face");
    wire();
    DR_Chat.scheduleIdle();
    DR_SDK.startAccel(onAccel, 15);

    setInterval(() => {
      DR_Companion.tick();
      DR_Storage.save();
    }, 60000);

    if (!DR_SDK.isR1()) {
      DR_Chat.setLog("Preview · Gateway " + (DR_SDK.PREVIEW.model || ""));
      window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          // Match swapped device mapping: up event → dir +1
          DR_SDK.emit("scrollUp");
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          DR_SDK.emit("scrollDown");
        }
        if (e.key === "Enter") onSideClick();
        if (e.key === "Escape") show("face");
        if (e.key === "s" || e.key === "S") DR_Chat.onShake();
        if (e.code === "Space" && !e.repeat && screen === "face") {
          e.preventDefault();
          if (!longPressing) {
            longPressing = true;
            DR_Chat.startListen();
          }
        }
      });
      window.addEventListener("keyup", (e) => {
        if (e.code === "Space" && longPressing && screen === "face") {
          e.preventDefault();
          longPressing = false;
          DR_Chat.stopListenAndReply();
        }
      });
    }
  }

  return { show, refreshChrome, boot };
})();

document.addEventListener("DOMContentLoaded", () => {
  DeskRabbit.boot();
});
