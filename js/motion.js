/** Accelerometer interpretation: light move, strong shake, relocation */
const DR_Motion = (() => {
  let last = { mag: 0, t: Date.now() };
  let movingSince = 0;
  let stillSince = Date.now();
  let wasMoving = false;
  let relocatedAt = 0;
  let lastState = "still";
  let lightHits = 0;

  function sample(mag) {
    const now = Date.now();
    const dt = Math.max(1, now - last.t);
    last = { mag, t: now };

    // thresholds tuned for R1 / preview
    const strong = mag > 22;
    const light = mag > 11 && mag <= 22;
    const still = mag <= 11;

    if (strong) {
      lastState = "shaken_strong";
      movingSince = 0;
      wasMoving = false;
      return lastState;
    }

    if (light) {
      lightHits++;
      if (!movingSince) movingSince = now;
      wasMoving = true;
      stillSince = now;
      lastState = "shaken_light";
      return lastState;
    }

    if (still) {
      if (wasMoving && now - movingSince > 1200 && now - stillSince > 900) {
        // moved for a bit, then settled → relocated
        if (now - relocatedAt > 8000) {
          relocatedAt = now;
          lastState = "relocated";
          wasMoving = false;
          movingSince = 0;
          return lastState;
        }
      }
      if (now - stillSince > 400) {
        wasMoving = false;
        movingSince = 0;
        lastState = "still";
      }
    }
    return lastState;
  }

  function snapshot() {
    return {
      state: lastState,
      mag: last.mag,
      lightHits,
      relocatedAt,
    };
  }

  function resetLightHits() {
    lightHits = 0;
  }

  return { sample, snapshot, resetLightHits };
})();
