const host = process.env.SITE_HOST || "wavetechlimited.com";
const key = process.env.INDEXNOW_KEY || "ae2d0aca688a25c275496aa2156304c6";
const keyLocation = `https://${host}/indexnow-key.txt`;

const urls = [
  `https://${host}/`,
  `https://${host}/rafaygen-ai`,
  `https://${host}/wavetechlimited`,
  `https://${host}/advertise`,
  `https://${host}/resources`,
  `https://${host}/resources/ai-coding-assistant`,
  `https://${host}/resources/ai-math-solver`,
  `https://${host}/resources/reasoning-model-platform`,
  `https://${host}/resources/speech-to-text-whisper-groq`,
  `https://${host}/resources/ai-image-video-generation`,
  `https://${host}/resources/rafaygen-for-business`,
].filter(Boolean);

const payload = {
  host,
  key,
  keyLocation,
  urlList: urls,
};

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error(`IndexNow submit failed (${response.status}): ${text}`);
  process.exit(1);
}

console.log(`IndexNow submit ok (${response.status})`);
if (text) console.log(text);
