/* Persistent settings via CreationStorage (Base64) with memory fallback */
const DR_Storage = (() => {
  const KEY = "deskrabbit_v1";

  const defaults = () => ({
    name: "DeskRabbit",
    language: "auto",
    personality: "playful",
    idleEnabled: true,
    idleMinutes: 8,
    tapChat: true,
    presenceEnabled: true,
    worldWatch: true,
    quietHours: false,
    quietStart: 23,
    quietEnd: 7,
    zip: "",
    interests: "",
    journal: false,
    /** OpenAI-compatible base URL reachable FROM the R1 (HTTPS), e.g. https://host/v1 — or ?gateway= */
    llmGateway: "",
    showHud: true,
    expressSpeech: true,
    facePreset: "classic",
    faceCustom: {
      eyeColor: "",
      pupilColor: "",
      glowColor: "",
      size: "md",
      gap: "normal",
      shape: "round",
    },
    topics: {
      world: true,
      national: true,
      local: true,
      tech: true,
      facts: true,
      questions: true,
      quotes: true,
      jokes: true,
      trivia: true,
      interests: true,
      weather: true,
      tamagotchi: true,
      presence: true,
    },
    companion: {
      affection: 62,
      energy: 78,
      curiosity: 70,
      hunger: 35,
      bondLevel: 1,
      bondXp: 0,
      lastTick: Date.now(),
      lastSeenUser: Date.now(),
      memories: [],
    },
    customSkills: [],
    knownFaces: {},
    knownAboutUser: [],
    askedTopics: {},
  });

  let state = defaults();
  let mem = null;

  function enc(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }
  function dec(str) {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
  }

  async function load() {
    try {
      if (window.creationStorage && window.creationStorage.plain) {
        const raw = await window.creationStorage.plain.getItem(KEY);
        if (raw) {
          state = deepMerge(defaults(), dec(raw));
          return state;
        }
      } else if (mem) {
        state = deepMerge(defaults(), mem);
        return state;
      }
    } catch (e) {
      console.warn("DR_Storage.load", e);
    }
    state = defaults();
    return state;
  }

  async function save() {
    try {
      const payload = enc(state);
      if (window.creationStorage && window.creationStorage.plain) {
        await window.creationStorage.plain.setItem(KEY, payload);
      } else {
        mem = JSON.parse(JSON.stringify(state));
      }
    } catch (e) {
      console.warn("DR_Storage.save", e);
    }
  }

  function get() {
    return state;
  }

  function patch(partial) {
    state = deepMerge(state, partial);
    return state;
  }

  function deepMerge(a, b) {
    if (!b) return a;
    const out = Array.isArray(a) ? a.slice() : { ...a };
    Object.keys(b).forEach((k) => {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
        out[k] = deepMerge(a[k] || {}, b[k]);
      } else {
        out[k] = b[k];
      }
    });
    return out;
  }

  return { load, save, get, patch, defaults };
})();
