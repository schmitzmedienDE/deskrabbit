const DR_PRESETS = [
  { id: "classic", label: "Classic", className: "preset-classic" },
  { id: "rabbit", label: "Rabbit", className: "preset-rabbit" },
  { id: "cat", label: "Cat", className: "preset-cat" },
  { id: "dot", label: "Dot", className: "preset-dot" },
  { id: "pixel", label: "Pixel", className: "preset-pixel" },
  { id: "cyber", label: "Cyber", className: "preset-cyber" },
  { id: "heart", label: "Heart", className: "preset-heart" },
  { id: "mono", label: "Mono", className: "preset-mono" },
];

const DR_EXPRESSIONS = [
  "idle",
  "blink",
  "look-left",
  "look-right",
  "look-up",
  "happy",
  "sad",
  "curious",
  "sleepy",
  "excited",
  "love",
  "angry",
  "confused",
  "talking",
  "listening",
  "thinking",
  "waiting",
  "stars",
];

/** Map LLM / mood keywords → temporary expression */
function DR_expressionFromText(text) {
  const t = (text || "").toLowerCase();
  if (/❤️|love|lieb|amour|❤|cute|süß/.test(t)) return "love";
  if (/ha+|lol|haha|funny|witz|joke|😆|😂/.test(t)) return "happy";
  if (/wow|exciting|spannend|amazing|yeah/.test(t)) return "excited";
  if (/sad|trau|sorry|leider|😔/.test(t)) return "sad";
  if (/angry|ärger|mad|grr/.test(t)) return "angry";
  if (/listen|zuhören|hör/.test(t)) return "listening";
  if (/think|denk|hmm/.test(t)) return "thinking";
  if (/wait|wart|…|\.\.\./.test(t)) return "waiting";
  if (/hmm|curious|neugierig|why|warum|\?/.test(t)) return "curious";
  if (/sleep|müde|tired|zzz|nacht/.test(t)) return "sleepy";
  if (/wait|confused|verwirrt|huh/.test(t)) return "confused";
  return "talking";
}
