/* R1 Creations SDK bridge + browser preview via dockergui OpenAI gateway */
const DR_SDK = (() => {
  const PREVIEW = {
    bases: ["https://localhost:14001/v1", "http://127.0.0.1:4001/v1"],
    model: "mac/cursor/cursor-chat",
    activeBase: null,
  };

  function deviceGatewayBases() {
    const bases = [];
    try {
      const q = new URLSearchParams(location.search || "");
      const fromUrl = (q.get("gateway") || "").replace(/\/$/, "");
      if (fromUrl) bases.push(fromUrl);
    } catch (_) {}
    try {
      const s = typeof DR_Storage !== "undefined" ? DR_Storage.get() : {};
      const fromSettings = String(s.llmGateway || "")
        .trim()
        .replace(/\/$/, "");
      if (fromSettings) bases.push(fromSettings);
    } catch (_) {}
    // Never use localhost on device — R1 cannot reach the Mac loopback
    return [...new Set(bases)];
  }

  function extractSay(text) {
    const raw = String(text || "").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const obj = JSON.parse(m[0]);
        if (obj && obj.say != null) return String(obj.say).trim();
        if (obj && obj.message != null) return String(obj.message).trim();
      } catch (_) {}
    }
    return raw.replace(/^["']|["']$/g, "").slice(0, 280);
  }

  /** Verbatim TTS via native LAM — keep message trivial (research: overloaded prompts fail). */
  function speakVerbatim(text) {
    const say = String(text || "").trim().slice(0, 280);
    if (!say || !isR1()) return false;
    return post({
      message: `Say exactly this text and nothing else: ${say}`,
      useLLM: true,
      wantsR1Response: true,
      wantsJournalEntry: false,
    });
  }

  const listeners = {
    scrollUp: [],
    scrollDown: [],
    sideClick: [],
    longPressStart: [],
    longPressEnd: [],
    pluginMessage: [],
  };

  let pendingLLM = 0;
  let cancelled = false;

  function isR1() {
    return typeof PluginMessageHandler !== "undefined";
  }

  function on(evt, fn) {
    if (!listeners[evt]) listeners[evt] = [];
    listeners[evt].push(fn);
    return () => {
      listeners[evt] = listeners[evt].filter((f) => f !== fn);
    };
  }

  function emit(evt, data) {
    (listeners[evt] || []).forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function isAwaitingLLM() {
    return pendingLLM > 0;
  }

  function cancelPending() {
    cancelled = true;
    pendingLLM = 0;
  }

  function post(payload) {
    if (!isR1()) {
      console.log("[DR preview post]", payload);
      return false;
    }
    PluginMessageHandler.postMessage(JSON.stringify(payload));
    return true;
  }

  function extractAssistantText(data) {
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) return "";
    let text = msg.content || "";
    if (!text && msg.reasoning_content) text = String(msg.reasoning_content);
    return String(text)
      .replace(/⟶[\s\S]*$/m, "")
      .replace(/^(Ich lese den Auftrag[^.]*\.)+/gi, "")
      .trim();
  }

  function normalizeImageBase64(image) {
    const value = String(image || "").trim();
    if (!value) return null;
    if (value.startsWith("data:image/")) return value;
    return "data:image/jpeg;base64," + value;
  }

  async function gatewayChat(userMessage, opts = {}) {
    const content = opts.imageBase64
      ? [
          { type: "text", text: userMessage },
          { type: "image_url", image_url: { url: normalizeImageBase64(opts.imageBase64) } },
        ]
      : userMessage;

    const body = {
      model: PREVIEW.model,
      stream: false,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "DeskRabbit JSON companion. Output ONLY one JSON object. No tools narration. No markdown fences. No file access.",
        },
        { role: "user", content },
      ],
    };

    const preferred = opts.bases && opts.bases.length ? opts.bases : null;
    const bases = preferred
      ? preferred
      : PREVIEW.activeBase
        ? [PREVIEW.activeBase, ...PREVIEW.bases.filter((b) => b !== PREVIEW.activeBase)]
        : PREVIEW.bases.slice();

    let lastErr = null;
    for (const base of bases) {
      try {
        const res = await fetch(base + "/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer sk-deskrabbit-preview",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          lastErr = new Error("HTTP " + res.status + " @ " + base);
          continue;
        }
        const data = await res.json();
        if (!preferred) PREVIEW.activeBase = base;
        return extractAssistantText(data) || '{"say":"","expr":"idle","await_user":false,"tools":[]}';
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("preview LLM unreachable");
  }

  function askLLM(message, opts = {}) {
    const settings = typeof DR_Storage !== "undefined" ? DR_Storage.get() : {};
    cancelled = false;
    pendingLLM += 1;
    const genId = opts.genId;
    const speak = !opts.silent && opts.speak !== false;
    const imageBase64 = opts.imageBase64 ? normalizeImageBase64(opts.imageBase64) : null;
    const deviceBases = isR1() ? deviceGatewayBases() : [];

    // R1 + configured gateway: think like Preview, speak verbatim via PluginMessageHandler
    if (isR1() && deviceBases.length) {
      gatewayChat(message, { imageBase64, bases: deviceBases })
        .then((text) => {
          if (cancelled) return;
          const say = extractSay(text);
          emit("pluginMessage", {
            message: text,
            data: null,
            remote: true,
            genId,
          });
          if (speak && say) speakVerbatim(say);
        })
        .catch((err) => {
          console.warn("device gateway failed, native fallback", err);
          if (cancelled) return;
          post({
            message,
            useLLM: true,
            wantsR1Response: speak,
            wantsJournalEntry: !!(opts.journal ?? settings.journal),
          });
        })
        .finally(() => {
          pendingLLM = Math.max(0, pendingLLM - 1);
        });
      return true;
    }

    if (isR1()) {
      // Never send imageBase64 to PluginMessageHandler: R1 Cam/Wonder use that
      // payload to trigger OS Magic Camera ("magisches Foto"), not companion chat.
      const ok = post({
        message,
        useLLM: true,
        wantsR1Response: speak,
        wantsJournalEntry: !!(opts.journal ?? settings.journal),
      });
      if (!ok) pendingLLM = Math.max(0, pendingLLM - 1);
      return ok;
    }

    gatewayChat(message, { imageBase64 })
      .then((text) => {
        if (cancelled) return;
        emit("pluginMessage", { message: text, data: null, preview: true, genId });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        emit("pluginMessage", {
          message: JSON.stringify({
            say: "Kurz offline — versuch's nochmal.",
            expr: "confused",
            await_user: false,
            tools: [],
          }),
          preview: true,
          error: true,
          genId,
        });
      })
      .finally(() => {
        pendingLLM = Math.max(0, pendingLLM - 1);
      });
    return true;
  }

  function close() {
    if (typeof closeWebView !== "undefined") closeWebView.postMessage("");
  }

  let accelOn = false;

  function startAccel(cb, frequency = 20) {
    if (!window.creationSensors || !window.creationSensors.accelerometer) return false;
    try {
      window.creationSensors.accelerometer.start(cb, { frequency });
      accelOn = true;
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  function stopAccel() {
    if (accelOn && window.creationSensors && window.creationSensors.accelerometer) {
      try {
        window.creationSensors.accelerometer.stop();
      } catch (_) {}
      accelOn = false;
    }
  }

  function setListening(on) {
    const el = document.getElementById("listen-dot");
    if (el) el.classList.toggle("hidden", !on);
    const app = document.getElementById("app");
    if (app) app.classList.toggle("is-listening", !!on);
  }

  function boot() {
    window.addEventListener("scrollUp", () => emit("scrollUp"));
    window.addEventListener("scrollDown", () => emit("scrollDown"));
    window.addEventListener("sideClick", () => emit("sideClick"));
    window.addEventListener("longPressStart", () => emit("longPressStart"));
    window.addEventListener("longPressEnd", () => emit("longPressEnd"));

    window.onPluginMessage = function (data) {
      // Native STT must never be dropped by LLM-cancel flag
      if (data && data.type === "sttEnded") {
        emit("pluginMessage", data);
        return;
      }
      if (cancelled) return;
      if (pendingLLM > 0) pendingLLM -= 1;
      emit("pluginMessage", data);
    };
  }

  function startNativeVoice() {
    if (typeof CreationVoiceHandler !== "undefined") {
      try {
        CreationVoiceHandler.postMessage("start");
        return true;
      } catch (e) {
        console.warn(e);
      }
    }
    return false;
  }

  function stopNativeVoice() {
    if (typeof CreationVoiceHandler !== "undefined") {
      try {
        CreationVoiceHandler.postMessage("stop");
        return true;
      } catch (e) {
        console.warn(e);
      }
    }
    return false;
  }

  function hasNativeVoice() {
    return typeof CreationVoiceHandler !== "undefined";
  }

  return {
    isR1,
    on,
    emit,
    post,
    askLLM,
    speakVerbatim,
    deviceGatewayBases,
    isAwaitingLLM,
    cancelPending,
    close,
    startAccel,
    stopAccel,
    boot,
    setListening,
    startNativeVoice,
    stopNativeVoice,
    hasNativeVoice,
    PREVIEW,
  };
})();
