const DR_Presence = (() => {
  let stream = null;
  let timer = null;
  let prev = null;
  let present = false;
  let watching = false;
  let lastAnnounce = 0;
  let lastMeta = { lum: 0, motion: 0 };

  const video = () => document.getElementById("cam");
  const canvas = () => document.getElementById("cam-canvas");

  function setDot(state) {
    const dot = document.getElementById("presence-dot");
    if (!dot) return;
    dot.classList.remove("here", "away", "watching");
    dot.classList.add(state);
  }

  async function start(opts = {}) {
    const s = DR_Storage.get();
    if (!opts.force && !s.presenceEnabled) {
      stop();
      setDot("away");
      return false;
    }
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("presence cam: no mediaDevices (needs secure context / HTTPS)");
      setDot("away");
      return false;
    }
    const tries = [
      { video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } }, audio: false },
      { video: { facingMode: { ideal: "user" }, width: { ideal: 480 }, height: { ideal: 640 } }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of tries) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        const v = video();
        v.srcObject = stream;
        await v.play().catch(() => {});
        timer = setInterval(sample, 900);
        setDot("watching");
        watching = true;
        return true;
      } catch (e) {
        lastErr = e;
        stream = null;
      }
    }
    console.warn("presence cam", lastErr);
    setDot("away");
    return false;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    const v = video();
    if (v) v.srcObject = null;
    watching = false;
    prev = null;
  }

  function sample() {
    const v = video();
    const c = canvas();
    if (!v || !c || v.readyState < 2) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const frame = ctx.getImageData(0, 0, c.width, c.height).data;

    let lum = 0;
    for (let i = 0; i < frame.length; i += 16) {
      lum += (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
    }
    lum /= frame.length / 16;

    let motion = 0;
    if (prev) {
      for (let i = 0; i < frame.length; i += 32) {
        motion += Math.abs(frame[i] - prev[i]);
      }
      motion /= frame.length / 32;
    }
    prev = new Uint8ClampedArray(frame);
    lastMeta = { lum, motion };

    const nowPresent = motion > 12 || (lum > 25 && motion > 6);
    const was = present;
    present = nowPresent;
    setDot(present ? "here" : watching ? "watching" : "away");

    if (present && !was) {
      DR_Companion.interact("presence");
      const now = Date.now();
      // Silent notice only — no auto-chat (prevents babble)
      if (now - lastAnnounce > 180000) {
        lastAnnounce = now;
        DR_SDK.emit("presenceEnter");
      }
    } else if (!present && was) {
      DR_SDK.emit("presenceLeave");
    }

    const s = DR_Storage.get();
    if (s.worldWatch && motion > 40) {
      DR_Companion.interact("explore");
      DR_SDK.emit("worldMotion", { motion, lum });
    }
  }

  function isPresent() {
    return present;
  }

  function snapshotMeta() {
    return { ...lastMeta };
  }

  function snapshotDataUrl() {
    const c = canvas();
    if (!c) return null;
    try {
      return c.toDataURL("image/jpeg", 0.5);
    } catch (_) {
      return null;
    }
  }

  async function forceSample() {
    const v = video();
    const c = canvas();
    if (!v || !c) return lastMeta;
    // wait until a frame is ready
    for (let i = 0; i < 15; i++) {
      if (v.readyState >= 2) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    sample();
    return { ...lastMeta };
  }

  /** Higher-res JPEG for LAM vision — matches working camera Creations (R1 Cam ~0.8 JPEG). */
  function capturePhotoDataUrl(maxW = 480, maxH = 640, quality = 0.8) {
    const v = video();
    if (!v || v.readyState < 2) return null;
    const vw = v.videoWidth || 480;
    const vh = v.videoHeight || 640;
    const scale = Math.min(maxW / vw, maxH / vh, 1);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    try {
      const ctx = off.getContext("2d");
      ctx.drawImage(v, 0, 0, w, h);
      return off.toDataURL("image/jpeg", quality);
    } catch (_) {
      return snapshotDataUrl();
    }
  }

  return { start, stop, isPresent, snapshotDataUrl, snapshotMeta, forceSample, capturePhotoDataUrl, setDot };
})();
