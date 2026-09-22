// Filename/mime-based auto-classification — pure logic, no RN imports, so it
// runs in desktop node harnesses. Tags join the existing space-joined lowercase
// `photos.tags` vocabulary ([a-z0-9_] charset), which keeps them FTS-searchable
// and channel-caption-safe without any extra sanitization.

export const AUTO_TAGS = ["screenshot", "screenrec", "whatsapp", "document"] as const;

export type AutoTag = (typeof AUTO_TAGS)[number];

const DOCUMENT_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "txt", "rtf", "xls", "xlsx", "ppt", "pptx", "csv",
  "zip", "rar", "7z",
]);

const SCREENREC_RE = /screen[-_ ]?record|^screenrec/;
// WhatsApp media: "WhatsApp Image …", "WA0123~.jpg" (digits follow the prefix).
const WHATSAPP_RE = /whatsapp|^wa[-_. ]?\d/;
// Covers "Screenshot_…", "Screen Shot …", "Screen-Shot-…".
const SCREENSHOT_RE = /screen[-_ ]?shot/;

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

// Deterministic output order = AUTO_TAGS order; multiple tags possible
// ("WhatsApp Screenshot 2024-01-01.jpg" → both whatsapp and screenshot).
export function classifyAutoTags(filename: string, mime: string | null): AutoTag[] {
  const tags: AutoTag[] = [];
  const name = (filename ?? "").toLowerCase();
  if (!name) return tags;
  if (SCREENSHOT_RE.test(name)) tags.push("screenshot");
  if (SCREENREC_RE.test(name)) tags.push("screenrec");
  if (WHATSAPP_RE.test(name)) tags.push("whatsapp");
  const ext = extensionOf(name);
  if (
    DOCUMENT_EXTENSIONS.has(ext) ||
    (mime ? mime.toLowerCase().startsWith("application/") : false)
  ) {
    tags.push("document");
  }
  return tags;
}
