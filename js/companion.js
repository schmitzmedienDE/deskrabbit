const DR_Companion = (() => {
  const BOND_THRESHOLDS = [0, 40, 100, 200, 350, 550];

  function stats() {
    return DR_Storage.get().companion;
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, n));
  }

  function tick() {
    const s = DR_Storage.get();
    const c = { ...s.companion };
    const now = Date.now();
    const hours = Math.max(0, (now - (c.lastTick || now)) / 3600000);
    c.lastTick = now;

    // Tamagotchi decay — slower when user present handled by presence module calling pet/boost
    c.energy = clamp(c.energy - hours * 4);
    c.hunger = clamp(c.hunger + hours * 5);
    c.affection = clamp(c.affection - hours * 2.2);
    c.curiosity = clamp(c.curiosity - hours * 1.5 + (Math.random() * 2 - 0.5));

    DR_Storage.patch({ companion: c });
    renderHud();
    const busy = typeof DR_Chat !== "undefined" && DR_Chat.getPhase &&
      ["listening", "thinking", "speaking"].indexOf(DR_Chat.getPhase()) >= 0;
    if (!busy) DR_Face.moodExpression(c);
    return c;
  }

  function addBond(xp) {
    const s = DR_Storage.get();
    const c = { ...s.companion };
    c.bondXp = (c.bondXp || 0) + xp;
    let level = 1;
    for (let i = BOND_THRESHOLDS.length - 1; i >= 0; i--) {
      if (c.bondXp >= BOND_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }
    const leveled = level > (c.bondLevel || 1);
    c.bondLevel = level;
    DR_Storage.patch({ companion: c });
    renderHud();
    return { leveled, level };
  }

  function interact(kind) {
    const s = DR_Storage.get();
    const c = { ...s.companion };
    if (kind === "pet") {
      c.affection = clamp(c.affection + 8);
      c.energy = clamp(c.energy + 2);
      addBond(3);
    } else if (kind === "chat") {
      c.affection = clamp(c.affection + 4);
      c.curiosity = clamp(c.curiosity + 6);
      c.hunger = clamp(c.hunger + 1);
      addBond(5);
    } else if (kind === "feed") {
      c.hunger = clamp(c.hunger - 25);
      c.affection = clamp(c.affection + 3);
      addBond(4);
    } else if (kind === "presence") {
      c.affection = clamp(c.affection + 2);
      c.lastSeenUser = Date.now();
      addBond(1);
    } else if (kind === "explore") {
      c.curiosity = clamp(c.curiosity + 10);
      c.energy = clamp(c.energy - 4);
      addBond(4);
    }
    DR_Storage.patch({ companion: c });
    renderHud();
    const busy = typeof DR_Chat !== "undefined" && DR_Chat.getPhase &&
      ["listening", "thinking", "speaking"].indexOf(DR_Chat.getPhase()) >= 0;
    if (!busy) DR_Face.moodExpression(c);
    return c;
  }

  function remember(note) {
    const s = DR_Storage.get();
    const memories = (s.companion.memories || []).slice(-11);
    memories.push({ t: Date.now(), note: String(note).slice(0, 120) });
    DR_Storage.patch({ companion: { memories } });
  }

  function renderHud() {
    const c = DR_Storage.get().companion;
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "flex";
    document.querySelectorAll(".bar").forEach((bar) => {
      const key = bar.dataset.stat;
      const val = c[key] != null ? c[key] : 50;
      const i = bar.querySelector("i");
      if (!i) return;
      i.style.width = clamp(val) + "%";
      if (key === "hunger") {
        i.style.background = val > 70 ? "var(--bad)" : "var(--warn)";
      }
    });
    const bond = document.getElementById("bond");
    if (bond) bond.textContent = "Lv." + (c.bondLevel || 1);
  }

  function statusPrompt() {
    const c = stats();
    const s = DR_Storage.get();
    return [
      `Creature status for ${s.name}:`,
      `affection=${c.affection|0}, energy=${c.energy|0}, curiosity=${c.curiosity|0}, hunger=${c.hunger|0}, bondLevel=${c.bondLevel}`,
      c.hunger > 70 ? "Feeling neglected/hungry for attention." : "",
      c.energy < 30 ? "Low energy, softer tone." : "",
      c.affection > 75 ? "Very bonded and warm." : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return { tick, interact, remember, renderHud, stats, statusPrompt, addBond };
})();
