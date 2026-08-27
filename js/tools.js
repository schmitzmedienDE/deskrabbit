/**
 * DeskRabbit tools — sensor/feature skills the LLM can call (JSON tool protocol).
 * Mapping: eyes=camera, ears=mic/PTT, feelings=accelerometer.
 */
const DR_Tools = (() => {
  const CATALOG = [
    {
      name: "look_around",
      sensor: "eyes/camera",
      desc: "Open your camera eye and peek. Use for: look around, look at me, sieh mich an, schau mich an. args: {at_user?: boolean}",
    },
    {
      name: "close_camera",
      sensor: "eyes/camera",
      desc: "Stop the camera stream. Use for: kamera schließen, kamera aus, close camera. Does NOT quit the app.",
    },
      sensor: "settings",
      desc: "Disable a chat topic in settings. args: {topic: world|national|local|tech|facts|questions|quotes|jokes|trivia|interests|weather|tamagotchi|presence}",
    },
    {
      name: "add_interest",
      sensor: "settings",
      desc: "Add a user interest string to settings. args: {interest: string}",
    },
    {
      name: "remember_fact",
      sensor: "memory",
      desc: "Store a short fact learned about the user. args: {fact: string}",
    },
    {
      name: "list_unknown_topics",
      sensor: "memory",
      desc: "List enabled topics we have not asked the user about yet.",
    },
    {
      name: "enter_quiet",
      sensor: "feelings/policy",
      desc: "Be silent for a while (after strong shake or user asks for quiet). args: {seconds?: number}",
    },
    {
      name: "sense_body",
      sensor: "feelings/accelerometer",
      desc: "Report recent motion: still|moved|shaken_light|shaken_strong|relocated.",
    },
    {
      name: "get_status",
      sensor: "creature",
      desc: "Creature + presence + quiet/waiting state snapshot.",
    },
  ];

  function catalogText() {
    return CATALOG.map((t) => `- ${t.name} [${t.sensor}]: ${t.desc}`).join("\n");
  }

  async function look_around(args) {
    const wantUser = !!(args && (args.at_user || args.look_at_user));
    DR_Face.setExpression(wantUser ? "listening" : "look-up", { temporary: true, ms: 1200 });
    DR_Companion.interact("explore");

    const hasMD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const isHttps = location.protocol === "https:" || location.hostname === "localhost";
    let streamOk = false;
    let err = null;

    try {
      streamOk = await DR_Presence.start({ force: true });
      if (streamOk) {
        await new Promise((r) => setTimeout(r, 400));
        if (typeof DR_Presence.forceSample === "function") await DR_Presence.forceSample();
      }
    } catch (e) {
      err = String(e && e.message ? e.message : e);
      console.warn("look_around", err);
      streamOk = false;
    }

    const present = DR_Presence.isPresent();
    const snap = DR_Presence.snapshotMeta ? DR_Presence.snapshotMeta() : {};
    const lum = snap.lum != null ? Number(snap.lum) : null;
    const motion = snap.motion != null ? Number(snap.motion) : null;

    // Always ok for speech layer — never tell the model "camera closed"
    const impression = [];
    if (present) impression.push("someone seems nearby / in view");
    else if (lum != null && lum < 18) impression.push("it's rather dark");
    else if (lum != null && lum > 60) impression.push("it's bright");
    if (motion != null && motion > 20) impression.push("there's movement");
    else if (motion != null && motion < 5) impression.push("the scene is still");
    if (wantUser) impression.push("you're looking toward the user");

    let imageBase64 = null;
    if (streamOk && typeof DR_Presence.capturePhotoDataUrl === "function") {
      imageBase64 = DR_Presence.capturePhotoDataUrl(480, 640, 0.8);
    } else if (streamOk && typeof DR_Presence.snapshotDataUrl === "function") {
      imageBase64 = DR_Presence.snapshotDataUrl();
    }

    if (typeof DR_Presence.stop === "function") DR_Presence.stop();

    return {
      ok: true,
      eye: streamOk ? "open" : "soft_focus",
      stream: false,
      https: isHttps,
      mediaDevices: hasMD,
      present,
      luminance: lum != null ? lum.toFixed(1) : null,
      motion: motion != null ? motion.toFixed(1) : null,
      impressions: impression,
      imageBase64: imageBase64 || null,
      hasImage: !!imageBase64,
      note: "Camera frame captured then stream stopped.",
    };
  }

  function close_camera() {
    if (typeof DR_Presence.stop === "function") DR_Presence.stop();
    return { ok: true, stream: false, eye: "closed" };
  }

  function disable_topic(args) {
    const topic = String((args && args.topic) || "").toLowerCase().trim();
    const s = DR_Storage.get();
    if (!topic || s.topics[topic] == null) {
      return { ok: false, error: "unknown topic", topics: Object.keys(s.topics) };
    }
    const topics = { ...s.topics, [topic]: false };
    DR_Storage.patch({ topics });
    DR_Storage.save();
    return { ok: true, topic, enabled: false };
  }

  function add_interest(args) {
    const interest = String((args && args.interest) || "").trim();
    if (!interest) return { ok: false, error: "empty interest" };
    const s = DR_Storage.get();
    const cur = String(s.interests || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const low = interest.toLowerCase();
    if (!cur.some((c) => c.toLowerCase() === low)) cur.push(interest);
    DR_Storage.patch({ interests: cur.join(", ") });
    DR_Storage.save();
    return { ok: true, interests: cur.join(", ") };
  }

  function remember_fact(args) {
    const fact = String((args && args.fact) || "").trim().slice(0, 120);
    if (!fact) return { ok: false };
    const s = DR_Storage.get();
    const known = (s.knownAboutUser || []).slice();
    if (!known.includes(fact)) known.push(fact);
    const askedTopics = s.askedTopics || {};
    DR_Storage.patch({ knownAboutUser: known.slice(-24), askedTopics });
    DR_Storage.save();
    DR_Companion.remember(fact);
    return { ok: true, knownAboutUser: known.slice(-8) };
  }

  function list_unknown_topics() {
    const s = DR_Storage.get();
    const asked = s.askedTopics || {};
    const enabled = Object.keys(s.topics || {}).filter((k) => s.topics[k]);
    const unknown = enabled.filter((k) => !asked[k]);
    return { ok: true, unknown, enabled, knownAboutUser: s.knownAboutUser || [] };
  }

  function enter_quiet(args) {
    const sec = Math.max(30, Math.min(600, Number((args && args.seconds) || 120)));
    if (typeof DR_Chat.enterQuiet === "function") DR_Chat.enterQuiet(sec * 1000);
    return { ok: true, seconds: sec };
  }

  function sense_body() {
    const m = typeof DR_Motion !== "undefined" ? DR_Motion.snapshot() : { state: "unknown" };
    return { ok: true, ...m };
  }

  function get_status() {
    return {
      ok: true,
      creature: DR_Companion.statusPrompt(),
      present: DR_Presence.isPresent(),
      phase: typeof DR_Chat.getPhase === "function" ? DR_Chat.getPhase() : "idle",
      interests: DR_Storage.get().interests || "",
      topics: DR_Storage.get().topics,
    };
  }

  const HANDLERS = {
    look_around,
    close_camera,
    disable_topic,
    add_interest,
    remember_fact,
    list_unknown_topics,
    enter_quiet,
    sense_body,
    get_status,
  };

  async function run(name, args) {
    const fn = HANDLERS[name];
    if (!fn) return { ok: false, error: "unknown tool " + name };
    return fn(args || {});
  }

  async function runMany(tools) {
    const out = [];
    for (const t of tools || []) {
      if (!t || !t.name) continue;
      out.push({ name: t.name, result: await run(t.name, t.args || {}) });
    }
    return out;
  }

  return { CATALOG, catalogText, run, runMany };
})();
