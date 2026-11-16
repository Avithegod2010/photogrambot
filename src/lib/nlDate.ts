// Local natural-language date parsing. Runs before Gemini so common phrases
// ("2023", "last summer", "beach last week") work offline and cost nothing.

export interface ParsedDateQuery {
  /** Inclusive lower bound (epoch ms). */
  startMs: number;
  /** Exclusive upper bound (epoch ms). */
  endMs: number;
  label: string;
  /** Query text with the date phrase removed. */
  rest: string;
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayEnd(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

function yearRange(year: number): { startMs: number; endMs: number } {
  return {
    startMs: new Date(year, 0, 1).getTime(),
    endMs: new Date(year + 1, 0, 1).getTime(),
  };
}

function monthRange(year: number, month: number): { startMs: number; endMs: number } {
  return {
    startMs: new Date(year, month, 1).getTime(),
    endMs: new Date(year, month + 1, 1).getTime(),
  };
}

function weekRange(now: Date, offsetWeeks = 0): { startMs: number; endMs: number } {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (base.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow + offsetWeeks * 7);
  return {
    startMs: monday.getTime(),
    endMs: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime(),
  };
}

function strip(text: string, match: RegExpMatchArray): string {
  const start = match.index ?? 0;
  return `${text.slice(0, start)} ${text.slice(start + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse the first supported date phrase in `text`. Returns null when the text
 * has no date phrase. The returned `rest` is the remaining search text.
 */
export function parseDateQuery(text: string, now: Date = new Date()): ParsedDateQuery | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const make = (
    match: RegExpMatchArray,
    range: { startMs: number; endMs: number },
    label: string
  ): ParsedDateQuery => ({ ...range, label, rest: strip(raw, match) });

  // Explicit ranges first.
  let m = lower.match(/\bfrom\s+((?:19|20)\d{2})\s+to\s+((?:19|20)\d{2})\b/);
  if (m) {
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2], 10);
    if (end >= start) {
      return make(m, { startMs: yearRange(start).startMs, endMs: yearRange(end).endMs }, `${start}–${end}`);
    }
  }

  m = lower.match(/\b(?:in|during|from)\s+((?:19|20)\d{2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    return make(m, yearRange(year), String(year));
  }

  m = lower.match(/\b(?:before|until|up to)\s+((?:19|20)\d{2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    return make(m, { startMs: 0, endMs: new Date(year, 0, 1).getTime() }, `before ${year}`);
  }

  m = lower.match(/\b(?:after|since)\s+((?:19|20)\d{2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    return make(m, { startMs: new Date(year + 1, 0, 1).getTime(), endMs: now.getTime() + 1 }, `after ${year}`);
  }

  // Month + year ("march 2023").
  m = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+((?:19|20)\d{2})\b/
  );
  if (m) {
    const month = MONTHS[m[1]];
    const year = parseInt(m[2], 10);
    return make(m, monthRange(year, month), `${m[1]} ${year}`);
  }

  // Relative phrases.
  m = lower.match(/\b(today)\b/);
  if (m) return make(m, { startMs: dayStart(now), endMs: dayEnd(now) }, "today");

  m = lower.match(/\b(yesterday)\b/);
  if (m) {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return make(m, { startMs: dayStart(y), endMs: dayEnd(y) }, "yesterday");
  }

  m = lower.match(/\b(this\s+week)\b/);
  if (m) return make(m, weekRange(now, 0), "this week");

  m = lower.match(/\b(last\s+week)\b/);
  if (m) return make(m, weekRange(now, -1), "last week");

  m = lower.match(/\b(this\s+month)\b/);
  if (m) return make(m, monthRange(now.getFullYear(), now.getMonth()), "this month");

  m = lower.match(/\b(last\s+month)\b/);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return make(m, monthRange(d.getFullYear(), d.getMonth()), "last month");
  }

  m = lower.match(/\b(this\s+year)\b/);
  if (m) return make(m, yearRange(now.getFullYear()), "this year");

  m = lower.match(/\b(last\s+year)\b/);
  if (m) return make(m, yearRange(now.getFullYear() - 1), "last year");

  // Indian summer: March–May. The most recent past summer.
  m = lower.match(/\b(last\s+summer)\b/);
  if (m) {
    const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return make(m, { startMs: new Date(year, 2, 1).getTime(), endMs: new Date(year, 5, 1).getTime() }, "last summer");
  }

  m = lower.match(/\bchristmas(?:\s+((?:19|20)\d{2}))?\b/);
  if (m) {
    const year = m[1] ? parseInt(m[1], 10) : now.getMonth() <= 11 ? now.getFullYear() : now.getFullYear();
    return make(
      m,
      { startMs: new Date(year, 11, 24).getTime(), endMs: new Date(year, 11, 27).getTime() },
      `Christmas ${year}`
    );
  }

  m = lower.match(/\blast\s+(\d+)\s+(day|days|week|weeks|month|months)\b/);
  if (m) {
    const n = Math.max(1, parseInt(m[1], 10));
    const unit = m[2];
    const ms =
      unit.startsWith("day") ? n * 86400000 : unit.startsWith("week") ? n * 7 * 86400000 : n * 30 * 86400000;
    return make(m, { startMs: now.getTime() - ms, endMs: now.getTime() + 1 }, `last ${n} ${unit}`);
  }

  // Bare year last (so "march 2023" wins first).
  m = lower.match(/\b((?:19|20)\d{2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    return make(m, yearRange(year), String(year));
  }

  return null;
}
