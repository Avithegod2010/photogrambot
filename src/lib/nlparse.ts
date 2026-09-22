// Pure parser for the natural-language search model response. Kept free of RN
// and network imports so it is node-testable: the model's output is untrusted
// input — this whitelist is the only path from Gemini JSON into SearchFilters.

export interface NlSearchResult {
  searchText: string | null;
  filters: {
    takenWithinDays?: number;
    hasGps?: boolean;
    mediaType?: "photos" | "videos";
    device?: string;
    camera?: string;
    autoTag?: string;
  };
}

export function parseNlSearchJson(
  raw: string,
  devices: string[],
  autoTags: string[]
): NlSearchResult {
  let text = raw.trim();
  // Models like to wrap JSON in markdown fences or add prose — extract the
  // first balanced {...} block and parse only that.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Couldn't understand that search");
  text = text.slice(start, end + 1);
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("Couldn't understand that search");
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("Couldn't understand that search");
  }

  let searchText: string | null = null;
  if (typeof obj.searchText === "string") {
    const t = obj.searchText.trim();
    if (t) searchText = t.slice(0, 80);
  }

  const filters: NlSearchResult["filters"] = {};
  if (typeof obj.takenWithinDays === "number" && Number.isFinite(obj.takenWithinDays)) {
    const days = Math.round(obj.takenWithinDays);
    if (days > 0) filters.takenWithinDays = Math.min(days, 365);
  }
  if (obj.hasGps === true) filters.hasGps = true;
  if (obj.mediaType === "photos" || obj.mediaType === "videos") {
    filters.mediaType = obj.mediaType;
  }
  if (typeof obj.device === "string" && devices.includes(obj.device)) {
    filters.device = obj.device;
  }
  if (typeof obj.camera === "string") {
    const c = obj.camera.trim();
    if (c) filters.camera = c.slice(0, 60);
  }
  if (typeof obj.autoTag === "string" && autoTags.includes(obj.autoTag)) {
    filters.autoTag = obj.autoTag;
  }

  return { searchText, filters };
}
