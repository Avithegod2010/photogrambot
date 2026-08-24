import { File } from "expo-file-system";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface AiCaptionOptions {
  apiKey: string;
  model: string;
  prompt: string;
  imageUri: string;
}

export async function captionImageWithGemini(opts: AiCaptionOptions): Promise<string> {
  const file = new File(opts.imageUri);
  if (!file.exists) throw new Error("AI caption source image missing");
  const data = await file.base64();
  const res = await fetch(`${GEMINI_BASE}/${opts.model}:generateContent?key=${opts.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: opts.prompt },
            { inline_data: { mime_type: "image/jpeg", data } },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 80 },
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message ?? `Gemini request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  const parts = json?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: any) => p?.text ?? "").join(" ").trim()
    : "";
  if (!text) throw new Error("Gemini returned no caption");
  return text.replace(/\s+/g, " ").slice(0, 200);
}
