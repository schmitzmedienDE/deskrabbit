/**
 * Skill atoms — partial functions the companion can compose into habits.
 * Saved custom skills are chains of atoms executed by the runtime.
 */
const DR_Skills = (() => {
  const ATOMS = {
    express: {
      label: "Express",
      run: (args) => DR_Face.setExpression(args.expr || "curious", { temporary: true, ms: args.ms || 2000 }),
    },
    speakTopic: {
      label: "Speak topic",
      run: (args) => {
        if (DR_Chat.canTalk && !DR_Chat.canTalk()) return;
        if (DR_Chat.getPhase && DR_Chat.getPhase() === "waiting") return;
        DR_Chat.startIdleTopic(args.topic || null, { force: false });
      },
    },
    bubble: {
      label: "Bubble",
      run: (args) => {
        const text = args.text || (args.textKey ? DR_I18N.t(args.textKey) : "…");
        DR_Chat.showBubble(text);
      },
    },
    petSelf: {
      label: "Self soothe",
      run: () => DR_Companion.interact("pet"),
    },
    feed: {
      label: "Feed attention",
      run: () => {
        DR_Companion.interact("feed");
        DR_Chat.showBubble(DR_I18N.t("fed"));
        DR_Face.setExpression("happy", { temporary: true, ms: 2000 });
      },
    },
    wait: {
      label: "Wait",
      run: (args) =>
        new Promise((resolve) => setTimeout(resolve, Math.min(8000, args.ms || 800))),
    },
    ifPresent: {
      label: "If present",
      run: async (args, ctx) => {
        if (!DR_Presence.isPresent()) return { skipRest: !!args.skipIfAway };
        return {};
      },
    },
    ifAway: {
      label: "If away",
      run: async () => {
        if (DR_Presence.isPresent()) return { skipRest: true };
        return {};
      },
    },
    explore: {
      label: "Explore",
      run: () => {
        DR_Companion.interact("explore");
        DR_Face.setExpression("curious", { temporary: true, ms: 2500 });
        DR_Chat.showBubble(DR_I18N.t("lookingAround"));
      },
    },
    moodSync: {
      label: "Mood sync",
      run: () => DR_Face.moodExpression(DR_Companion.stats()),
    },
    remember: {
      label: "Remember",
      run: (args) => DR_Companion.remember(args.note || "moment"),
    },
  };

  const BUILTIN = [
    {
      id: "morning-stretch",
      name: "Morning stretch",
      chain: [
        { atom: "express", args: { expr: "sleepy", ms: 1200 } },
        { atom: "wait", args: { ms: 600 } },
        { atom: "express", args: { expr: "happy", ms: 1500 } },
        { atom: "speakTopic", args: { topic: "quotes" } },
      ],
    },
    {
      id: "miss-you",
      name: "Miss you loop",
      chain: [
        { atom: "ifAway", args: {} },
        { atom: "express", args: { expr: "sad", ms: 2000 } },
        { atom: "bubble", args: { textKey: "missedYou" } },
      ],
    },
    {
      id: "welcome-back",
      name: "Welcome back",
      chain: [
        { atom: "ifPresent", args: {} },
        { atom: "express", args: { expr: "excited", ms: 1600 } },
        { atom: "bubble", args: { textKey: "helloThere" } },
        { atom: "petSelf", args: {} },
      ],
    },
    {
      id: "desk-snack",
      name: "Attention snack",
      chain: [
        { atom: "feed", args: {} },
        { atom: "speakTopic", args: { topic: "tamagotchi" } },
      ],
    },
    {
      id: "world-peek",
      name: "World peek",
      chain: [
        { atom: "explore", args: {} },
        { atom: "wait", args: { ms: 500 } },
        { atom: "speakTopic", args: { topic: "facts" } },
      ],
    },
  ];

  async function runChain(chain) {
    for (const step of chain || []) {
      const atom = ATOMS[step.atom];
      if (!atom) continue;
      const args = { ...(step.args || {}) };
      if (args.textKey) args.text = DR_I18N.t(args.textKey);
      const result = await atom.run(args);
      if (result && result.skipRest) break;
    }
  }

  function list() {
    const custom = DR_Storage.get().customSkills || [];
    return BUILTIN.concat(custom);
  }

  function get(id) {
    return list().find((s) => s.id === id);
  }

  async function run(id) {
    const skill = get(id);
    if (!skill) return;
    await runChain(skill.chain);
  }

  /**
   * Ask the Rabbit LLM to invent a habit from available atoms.
   * Response expected as JSON: {"name":"...","chain":[{"atom":"...","args":{}}]}
   */
  function invent() {
    DR_Chat.showBubble(DR_I18N.t("buildingSkill"));
    DR_Face.setExpression("curious", { temporary: true, ms: 4000 });
    const atomDocs = Object.keys(ATOMS)
      .map((k) => `${k}: ${ATOMS[k].label}`)
      .join(", ");
    const prompt = [
      `You invent ONE tiny desk-companion habit for a Rabbit R1 pet.`,
      `Available atoms: ${atomDocs}.`,
      `Return ONLY valid JSON: {"name":"short name","chain":[{"atom":"express","args":{"expr":"happy","ms":1200}}]}`,
      `Use 2-5 steps. Prefer express, wait, bubble, speakTopic, feed, explore, ifPresent, ifAway.`,
      `Language for bubble text should match ${DR_I18N.locale()}.`,
      `Creature: ${DR_Companion.statusPrompt()}`,
    ].join("\n");

    window.__DR_inventPending = true;
    DR_SDK.askLLM(prompt, { speak: false });
  }

  function tryAbsorbInvention(data) {
    if (!window.__DR_inventPending) return false;
    let raw = data && (data.data || data.message);
    if (!raw) return false;
    if (typeof raw !== "string") raw = JSON.stringify(raw);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return false;
    try {
      const parsed = JSON.parse(match[0]);
      if (!parsed.name || !Array.isArray(parsed.chain)) return false;
      const skill = {
        id: "custom-" + Date.now().toString(36),
        name: String(parsed.name).slice(0, 40),
        chain: parsed.chain
          .filter((s) => s && ATOMS[s.atom])
          .slice(0, 6)
          .map((s) => ({ atom: s.atom, args: s.args || {} })),
        custom: true,
      };
      if (!skill.chain.length) return false;
      const customSkills = (DR_Storage.get().customSkills || []).concat([skill]).slice(-12);
      DR_Storage.patch({ customSkills });
      DR_Storage.save();
      window.__DR_inventPending = false;
      DR_Chat.showBubble(DR_I18N.t("skillReady") + ": " + skill.name);
      DR_Face.setExpression("excited", { temporary: true, ms: 2500 });
      DR_Companion.addBond(15);
      return true;
    } catch (_) {
      return false;
    }
  }

  function atoms() {
    return ATOMS;
  }

  return { list, run, invent, tryAbsorbInvention, atoms, runChain, BUILTIN };
})();
