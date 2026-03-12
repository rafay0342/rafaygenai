const baseUrl = process.env.GROK_BASE_URL || "http://localhost:3000";
const apiKey = process.env.GROK_API_KEY || "YOUR_KEY";

async function chat() {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Grok ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama3.1:8b",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log("Chat:", await res.json());
}

async function generateImage(prompt) {
  const res = await fetch(`${baseUrl}/api/media/image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Grok ${apiKey}`,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  console.log("Image response:", data);
  return data.files?.[0];
}

async function generateVideo(prompt) {
  const res = await fetch(`${baseUrl}/api/media/video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Grok ${apiKey}`,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  console.log("Video response:", data);
  return data.files?.[0];
}

function buildMediaUrl(file) {
  if (!file?.filename) return null;
  const params = new URLSearchParams();
  params.set("filename", file.filename);
  if (file.subfolder) params.set("subfolder", file.subfolder);
  if (file.type) params.set("type", file.type);
  return `${baseUrl}/api/media/file?${params.toString()}`;
}

(async () => {
  await chat();

  const img = await generateImage("A cinematic skyline at dusk");
  console.log("Image file URL:", buildMediaUrl(img));

  const vid = await generateVideo("A cinematic skyline at dusk");
  console.log("Video file URL:", buildMediaUrl(vid));
})();
