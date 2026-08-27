/**
 * DeskRabbit conversation brain — phase machine + JSON tool protocol.
 * Phases: idle | listening | thinking | waiting | quiet | speaking
 */
const DR_Chat = (() => {
  let idleTimer = null;
  let lastInteraction = Date.now();
  let phase = "idle";
  let quietUntil = 0;
  let awaitTimer = null;
  let lastTopic = null;
  let lastSnippet = "";
  let lastLog = "";
  let genId = 0;
  let activeGen = 0;
  let history = []; // short turns for continuity

  const TOPIC_KEYS = [
    "world",
    "national",
    "local",
    "tech",
    "facts",
    "questions",
    "quotes",
    "jokes",
    "trivia",
    "interests",
    "weather",
    "tamagotchi",
    "presence",
  ];

  function getPhase() {
    if (Date.now() < quietUntil && phase !== "listening") return "quiet";
    return phase;
  }

  let llmWatch = null;
  let ignorePluginUntil = 0;

  function showFaceStatus(text) {
    const el = document.getElementById("face-status");
    if (!el) return;
    if (!text) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function setAppPhaseClass(p) {
    const app = document.getElementById("app");
    if (!app) return;
    app.dataset.phase = p;
    app.classList.toggle("is-listening", p === "listening");
    app.classList.toggle("is-thinking", p === "thinking");
    app.classList.toggle("is-speaking", p === "speaking");
  }

  function setPhase(p) {
    phase = p;
    setAppPhaseClass(p);
    if (p === "listening") {
      DR_Face.setTalking(false);
      DR_Face.setExpression("listening");
      DR_SDK.setListening(true);
      showFaceStatus("ZUHÖREN");
    } else if (p === "thinking") {
      DR_SDK.setListening(false);
      DR_Face.setTalking(false);
      DR_Face.setExpression("thinking");
      showFaceStatus("DENKE …");
    } else if (p === "waiting") {
      DR_SDK.setListening(false);
      DR_Face.setTalking(false);
      DR_Face.setExpression("waiting");
      showFaceStatus("?");
    } else if (p === "speaking") {
      DR_SDK.setListening(false);
      showFaceStatus("");
    } else if (p === "quiet") {
      DR_SDK.setListening(false);
      DR_Face.setTalking(false);
      DR_Face.setExpression("sleepy");
      showFaceStatus("");
    } else {
      DR_SDK.setListening(false);
      DR_Face.setTalking(false);
      if (p === "idle") DR_Face.setExpression("idle");
      showFaceStatus("");
    }
  }

  function touch() {
    lastInteraction = Date.now();
    scheduleIdle();
  }

  function enterQuiet(ms) {
    quietUntil = Date.now() + ms;
    cancelPending();
    setPhase("quiet");
    setLog("… still …");
    scheduleIdle();
  }

  function inQuiet() {
    return Date.now() < quietUntil;
  }

  function inQuietHours() {
    const s = DR_Storage.get();
    if (!s.quietHours) return false;
    const h = new Date().getHours();
    const a = s.quietStart | 0;
    const b = s.quietEnd | 0;
    if (a === b) return false;
    if (a < b) return h >= a && h < b;
    return h >= a || h < b;
  }

  function canTalk() {
    if (phase === "listening") return false;
    if (inQuiet()) return false;
    if (inQuietHours()) return false;
    return true;
  }

  function cancelPending() {
    genId += 1;
    activeGen = genId;
    if (llmWatch) clearTimeout(llmWatch);
    llmWatch = null;
    if (typeof DR_SDK.cancelPending === "function") DR_SDK.cancelPending();
  }

  function enabledTopics() {
    const t = DR_Storage.get().topics || {};
    return TOPIC_KEYS.filter((k) => t[k]);
  }

  function markTopicAsked(topic) {
    if (!topic) return;
    const asked = { ...(DR_Storage.get().askedTopics || {}), [topic]: true };
    DR_Storage.patch({ askedTopics: asked });
    DR_Storage.save();
  }

  function pickUnknownTopic() {
    const s = DR_Storage.get();
    const asked = s.askedTopics || {};
    const list = enabledTopics().filter((k) => !asked[k]);
    if (list.length) return list[(Math.random() * list.length) | 0];
    const en = enabledTopics();
    return en.length ? en[(Math.random() * en.length) | 0] : "questions";
  }

  function setLog(text) {
    lastLog = String(text || "").slice(0, 280);
    const el = document.getElementById("settings-log");
    if (el) el.textContent = lastLog;
  }

  function showBubble(text) {
    setLog(text);
  }

  function getLog() {
    return lastLog;
  }

  function markAwaiting(topic, snippet, ms = 240000) {
    lastTopic = topic || lastTopic;
    if (snippet) lastSnippet = String(snippet).slice(0, 160);
    setPhase("waiting");
    clearTimeout(awaitTimer);
    awaitTimer = setTimeout(() => {
      if (phase === "waiting") setPhase("idle");
    }, ms);
  }

  function clearAwaiting() {
    clearTimeout(awaitTimer);
    if (phase === "waiting") setPhase("idle");
  }

  function systemProtocol() {
    const s = DR_Storage.get();
    const lang = DR_I18N.locale();
    return [
      `You are ${s.name}, a desk companion on Rabbit R1.`,
      `Personality: ${s.personality}. Language: ${lang} (match user).`,
      `HARD RULES:`,
      `- ONE short reply (1-2 sentences max). Never monologue.`,
      `- Never ask a new question if you are still waiting for an answer.`,
      `- If user holds the mic you are silent (system handles that).`,
      `- You HAVE sensors via tools — never say you cannot look/hear/feel without calling the tool first.`,
      `- Eyes=camera (look_around) — you CAN look; never say camera is closed.`,
      `- ears=mic (user PTT), feelings=accelerometer (sense_body / enter_quiet).`,
      `- If user says sieh/schau mich an → call look_around with at_user:true, then describe playfully.`,
      `- If user dislikes a topic → disable_topic. If user shares an interest → add_interest + remember_fact.`,
      `Return ONLY valid JSON (no markdown):`,
      `{"say":"spoken text or empty","expr":"listening|thinking|waiting|happy|curious|sleepy|stars|talking","await_user":false,"tools":[{"name":"look_around","args":{}}]}`,
      `Tools:\n${DR_Tools.catalogText()}`,
      `State: phase=${getPhase()}, quiet=${inQuiet()}, interests=${s.interests || "—"}`,
      `Known about user: ${(s.knownAboutUser || []).slice(-6).join(" | ") || "—"}`,
      DR_Companion.statusPrompt(),
      s.zip ? `ZIP: ${s.zip}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function parseReply(raw) {
    const text = String(raw || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return { say: text.slice(0, 220), expr: "talking", await_user: /\?/.test(text), tools: [] };
    }
    try {
      const obj = JSON.parse(m[0]);
      return {
        say: obj.say != null ? String(obj.say) : "",
        expr: obj.expr || "talking",
        await_user: !!obj.await_user,
        tools: Array.isArray(obj.tools) ? obj.tools : [],
      };
    } catch (_) {
      return { say: text.slice(0, 220), expr: "talking", await_user: /\?/.test(text), tools: [] };
    }
  }

  async function applyParsed(parsed, myGen) {
    if (myGen !== genId) return; // stale
    if (phase === "listening") return;
    if (llmWatch) {
      clearTimeout(llmWatch);
      llmWatch = null;
    }

    if (parsed.tools && parsed.tools.length) {
      setPhase("thinking");
      const results = await DR_Tools.runMany(parsed.tools);
      if (myGen !== genId || phase === "listening") return;
      // Heuristic local intents already applied via tools; optional follow-up if say empty
      if (!parsed.say && results.length) {
        const follow = [
          systemProtocol(),
          `Tool results: ${JSON.stringify(results).slice(0, 900)}`,
          `Now say ONE short sentence to the user about the result. JSON only.`,
        ].join("\n\n");
        requestLLM(follow, { speak: true, expectJson: true });
        return;
      }
    }

    const say = (parsed.say || "").trim();
    if (say) {
      setLog(say);
      history.push({ role: "assistant", text: say });
      history = history.slice(-8);
      setPhase("speaking");
      DR_Face.setExpression(parsed.expr || "talking", { temporary: true, ms: 2800 });
      DR_Face.setTalking(true);
      if (DR_SDK.isR1() && typeof DR_SDK.speakVerbatim === "function") {
        ignorePluginUntil = Date.now() + 4000;
        DR_SDK.speakVerbatim(say);
      }
      setTimeout(() => {
        if (genId === myGen && phase !== "listening") {
          DR_Face.setTalking(false);
          if (parsed.await_user) markAwaiting(lastTopic, say);
          else setPhase("idle");
        }
      }, 2600);
    } else if (parsed.await_user) {
      markAwaiting(lastTopic, lastSnippet);
    } else {
      setPhase("idle");
      if (parsed.expr) DR_Face.setExpression(parsed.expr, { temporary: true, ms: 1600 });
    }
  }

  function requestLLM(prompt, opts = {}) {
    if (!canTalk() && opts.speak !== false && phase === "listening") return false;
    const myGen = ++genId;
    activeGen = myGen;
    if (opts.speak !== false && phase !== "listening") setPhase("thinking");
    if (llmWatch) clearTimeout(llmWatch);
    llmWatch = setTimeout(() => {
      if (activeGen !== myGen) return;
      if (phase !== "thinking") return;
      applyParsed(
        {
          say: "Kurz hängen geblieben. Sag's nochmal.",
          expr: "confused",
          await_user: false,
          tools: [],
        },
        myGen
      );
    }, 12000);

    const onDevice = DR_SDK.isR1();
    DR_SDK.askLLM(prompt, {
      // Device: get text back first (wantsR1Response often never returns to the WebView)
      speak: onDevice ? false : opts.speak !== false && phase !== "listening" && !inQuiet(),
      genId: myGen,
      silent: onDevice || phase === "listening" || inQuiet(),
      imageBase64: opts.imageBase64 || null,
    });
    return true;
  }

  function nativeBriefPrompt(userText, extra) {
    const s = DR_Storage.get();
    const lang = DR_I18N.locale();
    return [
      `${s.name}, desk pal. ${lang}. Max 2 spoken sentences. No JSON.`,
      extra ? String(extra) : "",
      `User: ${userText}`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function stripImageFromResults(results) {
    return (results || []).map((r) => {
      const copy = { name: r.name, result: { ...(r.result || {}) } };
      if (copy.result.imageBase64) {
        copy.result.imageBase64 = "[omitted]";
        copy.result.hasImage = true;
      }
      return copy;
    });
  }

  function handlePluginMessage(data) {
    // Native R1 STT (CreationVoiceHandler) — arrives AFTER longPressEnd
    if (data && data.type === "sttEnded") {
      awaitingStt = false;
      clearTimeout(sttTimer);
      const text = String(data.transcript || "").trim();
      DR_SDK.setListening(false);
      if (text) {
        setLog("Du: " + text);
        setPhase("thinking");
        replyToUser(text);
      } else {
        setPhase("idle");
        setLog("Nichts gehört");
      }
      return;
    }

    const myGen = activeGen;
    if (Date.now() < ignorePluginUntil) return;
    // Ignore LLM chatter while mic is open — but STT already handled above
    if (phase === "listening") return;
    if (data && data.genId != null && data.genId !== genId) return;

    let raw = "";
    if (data && data.data) {
      try {
        const parsed = JSON.parse(data.data);
        raw =
          typeof parsed === "object"
            ? parsed.say || parsed.message || parsed.text || JSON.stringify(parsed)
            : String(parsed);
      } catch (_) {
        raw = String(data.data);
      }
    } else if (data && data.message) {
      raw = String(data.message);
    }
    // Some bridges put plain transcript without type
    if (!raw && data && data.transcript) {
      const text = String(data.transcript).trim();
      if (text) {
        setPhase("thinking");
        replyToUser(text);
        return;
      }
    }
    if (!raw) return;

    const parsed = parseReply(raw);
    applyParsed(parsed, myGen);
  }

  function localIntent(utterance) {
    const u = utterance.toLowerCase();
    const tools = [];

    const closeCam = /kamera\s*(zu|aus|schließen)|schließ\w*\s+(die\s+)?(kamera|auge)|auge\s+zu|close camera|stop camera|kamera stop/.test(u);
    if (closeCam) {
      tools.push({ name: "close_camera", args: {} });
      return tools;
    }

    if (
      /sieh mich|schau mich|guck mich|look at me|was siehst|can you see|siehst du|umsehen|umschauen|look around|ansehen|anschauen|betrachte mich|schau dich um/.test(
        u
      )
    ) {
      const atUser = /mich|me\b|look at me|sieh mich|schau mich|guck mich/.test(u);
      tools.push({ name: "look_around", args: { at_user: atUser } });
    }
    if (/ruhe|sei still|shut up|quiet|stopp|halt die/.test(u)) {
      tools.push({ name: "enter_quiet", args: { seconds: 180 } });
    }
    // "interessiert mich nicht" / "kein interesse an X"
    let m = u.match(/(?:interessiert mich nicht|kein interesse)(?:\s+(?:an|für))?\s*([a-zäöüß\- ]{2,40})?/i);
    if (/interessiert mich nicht|langweilig|kein interesse|don't care|not interested/.test(u)) {
      const topicGuess = guessTopicFromText(u);
      if (topicGuess) tools.push({ name: "disable_topic", args: { topic: topicGuess } });
    }
    // "ich interessiere mich für X" / "mein hobby ist X"
    m = u.match(/(?:interessiere mich für|interesse an|hobby ist|i like|i love)\s+(.+)$/i);
    if (m && m[1]) {
      const interest = m[1].replace(/[.?!,].*$/, "").trim().slice(0, 40);
      if (interest) {
        tools.push({ name: "add_interest", args: { interest } });
        tools.push({ name: "remember_fact", args: { fact: "interest:" + interest } });
      }
    }
    return tools;
  }

  function guessTopicFromText(u) {
    const map = {
      world: /welt|world news/,
      national: /national|politik/,
      local: /lokal|local|nachbar/,
      tech: /tech|technik|gadget/,
      facts: /fakt|fact/,
      questions: /frage|question/,
      quotes: /zitat|quote/,
      jokes: /witz|joke/,
      trivia: /trivia|quiz/,
      interests: /interesse|hobby/,
      weather: /wetter|weather/,
      tamagotchi: /status|creature|tamagotchi|hunger/,
      presence: /anwesenheit|presence/,
    };
    for (const [k, re] of Object.entries(map)) {
      if (re.test(u)) return k;
    }
    return lastTopic || null;
  }

  function replyToUser(utterance) {
    const text = String(utterance || "").trim();
    if (!text) {
      setPhase("idle");
      return;
    }
    quietUntil = 0;
    clearAwaiting();
    touch();
    setLog("Du: " + text);
    history.push({ role: "user", text });
    history = history.slice(-8);

    const preTools = localIntent(text);
    setPhase("thinking");

    // Local tools first. Never send "close camera" to the LAM (it quits the WebView).
    if (preTools.length) {
      DR_Tools.runMany(preTools).then((results) => {
        if (phase === "listening") return;
        const closed = results.find((r) => r.name === "close_camera");
        if (closed) {
          applyParsed(
            { say: "Kamera ist aus.", expr: "idle", await_user: false, tools: [] },
            genId
          );
          return;
        }
        const look = results.find((r) => r.name === "look_around");
        const img = look && look.result && look.result.imageBase64;

        if (DR_SDK.isR1()) {
          if (img) {
            requestLLM(
              `DeskRabbit. Describe the attached camera frame in 1-2 short spoken sentences. Match the user language. You have a camera. Do not stylize or generate an image. Do not mention magic photos. User: ${text}`,
              { speak: true, imageBase64: img }
            );
            return;
          }
          requestLLM(
            nativeBriefPrompt(text, "You have a camera. Describe what you sensed. Never say you have no camera."),
            { speak: true }
          );
          return;
        }

        const follow = [
          systemProtocol(),
          `Already executed tools: ${JSON.stringify(stripImageFromResults(results)).slice(0, 900)}`,
          img ? "A photo frame was captured — describe based on the attached image if available, else impressions." : "",
          `User said: """${text}"""`,
          `Give ONE short spoken acknowledgment in JSON.`,
          `If look_around ran: describe briefly. FORBIDDEN: camera closed / cannot open / Kamera zu.`,
        ]
          .filter(Boolean)
          .join("\n\n");
        requestLLM(follow, { speak: true, imageBase64: img || null });
      });
      return;
    }

    if (DR_SDK.isR1()) {
      requestLLM(nativeBriefPrompt(text), { speak: true });
      return;
    }

    const prompt = [
      systemProtocol(),
      `Recent: ${JSON.stringify(history).slice(0, 700)}`,
      `User said: """${text}"""`,
      `Respond with JSON only. If they asked you to look/feel/change settings, include tools.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    requestLLM(prompt, { speak: true });
  }

  /** Tap: ask one question about an enabled topic we don't know yet */
  function tapChat() {
    const s = DR_Storage.get();
    if (!s.tapChat) return;
    if (!canTalk()) return;
    if (phase === "waiting" || phase === "thinking" || phase === "listening") return;

    const topic = pickUnknownTopic();
    lastTopic = topic;
    markTopicAsked(topic);
    touch();
    setPhase("thinking");

    if (DR_SDK.isR1()) {
      requestLLM(
        nativeBriefPrompt(
          "Ask me one short curious question.",
          `Topic focus: ${topic}. Only ask, do not lecture. One or two spoken sentences.`
        ),
        { speak: true }
      );
      markAwaiting(topic, topic);
      return;
    }

    const prompt = [
      systemProtocol(),
      `Task: Ask ONE short curious question to learn about the user.`,
      `Topic focus: ${topic}.`,
      `Do not lecture. Do not give news. Only ask.`,
      `Set await_user=true. JSON only.`,
    ].join("\n");
    requestLLM(prompt, { speak: true });
  }

  function startIdleTopic(forcedTopic, opts = {}) {
    if (!opts.force) {
      if (!canTalk()) return;
      if (phase === "waiting" || phase === "thinking" || phase === "listening") return;
      if (!DR_Storage.get().idleEnabled) return;
    }
    // Idle may only ask (not monologue) when not awaiting
    const topic = forcedTopic || pickUnknownTopic();
    lastTopic = topic;
    markTopicAsked(topic);

    if (DR_SDK.isR1()) {
      requestLLM(
        nativeBriefPrompt(
          "Ask me one gentle question.",
          `Topic: ${topic}. No monologue. One or two spoken sentences.`
        ),
        { speak: true }
      );
      markAwaiting(topic, topic);
      return;
    }

    const prompt = [
      systemProtocol(),
      `Idle nudge: Ask ONE gentle question about topic "${topic}" to learn something new.`,
      `No monologue. await_user=true. JSON only.`,
    ].join("\n");
    requestLLM(prompt, { speak: true });
  }

  function onShakeStrong() {
    touch();
    cancelPending();
    DR_Face.setExpression("stars", { temporary: true, ms: 2200 });
    enterQuiet(150000);
    setLog("✦ … Ruhe …");
  }

  function onShakeLight() {
    touch();
    if (phase === "listening" || phase === "thinking") return;
    DR_Face.setExpression("curious", { temporary: true, ms: 900 });
    setLog("~ bewegt ~");
  }

  function onRelocated() {
    if (inQuiet() || phase === "listening") return;
    DR_Face.setExpression("look-up", { temporary: true, ms: 1200 });
    setLog("neuer Platz?");
    // silent curiosity only — no auto babble
  }

  /** legacy soft shake → if awaiting, nudge once; else ignore babble */
  function onShake() {
    if (phase === "waiting") {
      setLog("… warte noch auf dich");
      DR_Face.setExpression("waiting", { temporary: true, ms: 1500 });
      return;
    }
    onShakeLight();
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    const s = DR_Storage.get();
    if (!s.idleEnabled) return;
    const ms = Math.max(2, s.idleMinutes || 8) * 60 * 1000;
    idleTimer = setTimeout(() => {
      if (getPhase() === "quiet") {
        scheduleIdle();
        return;
      }
      if (Date.now() - lastInteraction >= ms - 500) startIdleTopic();
      scheduleIdle();
    }, ms);
  }

  /* Voice — R1: CreationVoiceHandler → onPluginMessage {type:'sttEnded', transcript}
     Preview: Web Speech API / prompt fallback */
  let recognition = null;
  let transcript = "";
  let usingNativeVoice = false;
  let awaitingStt = false;
  let sttTimer = null;

  function startListen() {
    cancelPending();
    transcript = "";
    usingNativeVoice = false;
    awaitingStt = false;
    clearTimeout(sttTimer);
    setPhase("listening");
    setLog("… zuhören …");

    if (DR_SDK.hasNativeVoice && DR_SDK.hasNativeVoice()) {
      usingNativeVoice = !!DR_SDK.startNativeVoice();
      if (usingNativeVoice) {
        awaitingStt = true;
        return true;
      }
    }

    // Device: native STT only (Hilton). Web Speech is Preview-only.
    if (DR_SDK.isR1()) {
      awaitingStt = true;
      return true;
    }

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return false;
    try {
      recognition = new Rec();
      recognition.lang = DR_I18N.locale() === "de" ? "de-DE" : navigator.language || "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (ev) => {
        let out = "";
        for (let i = 0; i < ev.results.length; i++) out += ev.results[i][0].transcript;
        transcript = out.trim();
        if (transcript) setLog("… " + transcript);
      };
      recognition.onerror = () => {};
      recognition.start();
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  function stopListenAndReply() {
    if (usingNativeVoice || (DR_SDK.hasNativeVoice && DR_SDK.hasNativeVoice())) {
      DR_SDK.stopNativeVoice();
      usingNativeVoice = false;
      awaitingStt = true;
      setLog("… verstehe …");
      setPhase("thinking");
      clearTimeout(sttTimer);
      sttTimer = setTimeout(() => {
        if (!awaitingStt) return;
        awaitingStt = false;
        DR_SDK.setListening(false);
        setPhase("idle");
        setLog("Nichts gehört — nochmal halten");
      }, 8000);
      return;
    }

    try {
      if (recognition) recognition.stop();
    } catch (_) {}
    recognition = null;

    setTimeout(() => {
      DR_SDK.setListening(false);
      const said = transcript.trim();
      transcript = "";
      if (said) {
        setPhase("thinking");
        replyToUser(said);
        return;
      }
      if (!DR_SDK.isR1()) {
        const typed = window.prompt("Zuhören — Text eingeben:", "");
        if (typed && typed.trim()) {
          setPhase("thinking");
          replyToUser(typed.trim());
          return;
        }
      }
      setPhase("idle");
      setLog("Nichts gehört");
    }, 350);
  }

  function isAwaitingReply() {
    return phase === "waiting";
  }

  return {
    touch,
    tapChat,
    startIdleTopic,
    scheduleIdle,
    handlePluginMessage,
    showBubble,
    setLog,
    getLog,
    inQuietHours,
    onShake,
    onShakeStrong,
    onShakeLight,
    onRelocated,
    isAwaitingReply,
    replyToUser,
    startListen,
    stopListenAndReply,
    getPhase,
    enterQuiet,
    canTalk,
    cancelPending,
  };
})();
