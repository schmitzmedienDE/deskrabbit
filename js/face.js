const DR_Face = (() => {
  let el = null;
  let blinkTimer = null;
  let glanceTimer = null;
  let tempTimer = null;
  let baseExpr = "idle";
  let talking = false;

  function mount(node) {
    el = node || document.getElementById("face");
    applyFromSettings();
    scheduleBlink();
    scheduleGlance();
  }

  function clearExprClasses() {
    if (!el) return;
    DR_EXPRESSIONS.forEach((e) => el.classList.remove("expr-" + e));
  }

  function setExpression(name, opts = {}) {
    if (!el) return;
    const expr = DR_EXPRESSIONS.includes(name) ? name : "idle";
    clearExprClasses();
    el.classList.add("expr-" + expr);
    if (!opts.temporary) baseExpr = expr === "blink" ? baseExpr : expr;
    if (opts.ms) {
      clearTimeout(tempTimer);
      tempTimer = setTimeout(() => {
        clearExprClasses();
        el.classList.add("expr-" + (talking ? "talking" : baseExpr));
      }, opts.ms);
    }
  }

  function setTalking(on) {
    talking = !!on;
    if (!el) return;
    el.dataset.talking = talking ? "true" : "false";
    if (talking) setExpression("talking", { temporary: true });
    else setExpression(baseExpr);
  }

  function expressForSpeech(text, ms = 4200) {
    const settings = DR_Storage.get();
    if (!settings.expressSpeech) {
      setTalking(true);
      setTimeout(() => setTalking(false), ms);
      return;
    }
    const expr = DR_expressionFromText(text);
    setExpression(expr, { temporary: true, ms });
    setTalking(true);
    setTimeout(() => setTalking(false), Math.min(ms, 3600));
  }

  function applyPreset(id) {
    if (!el) return;
    DR_PRESETS.forEach((p) => el.classList.remove(p.className));
    const preset = DR_PRESETS.find((p) => p.id === id) || DR_PRESETS[0];
    el.classList.add(preset.className);
  }

  function applyCustom(custom) {
    if (!el || !custom) return;
    ["custom-size-sm", "custom-size-lg", "custom-gap-tight", "custom-gap-wide",
      "custom-shape-square", "custom-shape-soft", "custom-shape-wide"].forEach((c) =>
      el.classList.remove(c)
    );
    if (custom.size === "sm") el.classList.add("custom-size-sm");
    if (custom.size === "lg") el.classList.add("custom-size-lg");
    if (custom.gap === "tight") el.classList.add("custom-gap-tight");
    if (custom.gap === "wide") el.classList.add("custom-gap-wide");
    if (custom.shape === "square") el.classList.add("custom-shape-square");
    if (custom.shape === "soft") el.classList.add("custom-shape-soft");
    if (custom.shape === "wide") el.classList.add("custom-shape-wide");

    if (custom.eyeColor) el.style.setProperty("--eye", custom.eyeColor);
    else el.style.removeProperty("--eye");
    if (custom.pupilColor) el.style.setProperty("--pupil", custom.pupilColor);
    else el.style.removeProperty("--pupil");
    if (custom.glowColor) el.style.setProperty("--glow", custom.glowColor);
    else el.style.removeProperty("--glow");
  }

  function applyFromSettings() {
    const s = DR_Storage.get();
    applyPreset(s.facePreset || "classic");
    applyCustom(s.faceCustom || {});
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      const phase = typeof DR_Chat !== "undefined" && DR_Chat.getPhase ? DR_Chat.getPhase() : "idle";
      if (!talking && phase === "idle") {
        setExpression("blink", { temporary: true, ms: 120 });
      }
      scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }

  function scheduleGlance() {
    clearTimeout(glanceTimer);
    glanceTimer = setTimeout(() => {
      const phase = typeof DR_Chat !== "undefined" && DR_Chat.getPhase ? DR_Chat.getPhase() : "idle";
      if (!talking && phase === "idle" && baseExpr === "idle") {
        const opts = ["look-left", "look-right", "look-up", "curious"];
        const pick = opts[(Math.random() * opts.length) | 0];
        setExpression(pick, { temporary: true, ms: 900 + Math.random() * 800 });
      }
      scheduleGlance();
    }, 5000 + Math.random() * 7000);
  }

  function moodExpression(companion) {
    if (!companion) return;
    if (companion.energy < 25) return setExpression("sleepy");
    if (companion.hunger > 75) return setExpression("sad");
    if (companion.affection > 80) return setExpression("love");
    if (companion.curiosity > 75) return setExpression("curious");
    if (companion.affection < 30) return setExpression("sad");
    setExpression("idle");
  }

  function rattle(ms = 550) {
    if (!el) return;
    el.classList.remove("rattled");
    // reflow so animation restarts
    void el.offsetWidth;
    el.classList.add("rattled");
    setExpression("confused", { temporary: true, ms: Math.min(900, ms + 200) });
    setTimeout(() => el.classList.remove("rattled"), ms + 40);
  }

  return {
    mount,
    setExpression,
    setTalking,
    expressForSpeech,
    applyFromSettings,
    applyPreset,
    applyCustom,
    moodExpression,
    rattle,
  };
})();
