/**
 * Free-form pin labels ("brunch", "rooftop", "cheap eats").
 *
 * Tags are user-typed, so the same idea arrives spelled a dozen ways. Every
 * tag is normalized on the way in — that's what makes filtering, counting and
 * autocomplete behave as though there's a controlled vocabulary when there
 * isn't one.
 */

/** Hard caps, so one pin can't carry an unbounded tag list. */
export const MAX_TAGS_PER_PIN = 8;
export const MAX_TAG_LENGTH = 24;

/**
 * Canonical form of a tag: lowercase, accent-folded, collapsed whitespace,
 * punctuation stripped. "Brunch!", "brunch", and " BRUNCH " all land on the
 * same string, so they group instead of fragmenting.
 */
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Keep letters, numbers, spaces and internal hyphens; drop the rest.
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .trim()
    .slice(0, MAX_TAG_LENGTH);
}

/** Normalizes a list, dropping empties and duplicates, preserving order. */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_PIN) break;
  }
  return out;
}

/** Reads a pin's tags defensively — the field is optional and user-writable. */
export function pinTags(pin: { tags?: unknown }): string[] {
  if (!Array.isArray(pin.tags)) return [];
  return pin.tags.filter((t): t is string => typeof t === "string");
}

/** Display form — tags are stored lowercase but read better capitalized. */
export function formatTag(tag: string): string {
  return tag.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

export type TagCount = { tag: string; count: number };

/**
 * Every tag in use, most-used first, then alphabetical for stable ordering.
 * Drives both the Find filter row and composer autocomplete, so the
 * vocabulary grows from what people actually write.
 */
export function collectTags(pins: { tags?: unknown }[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const pin of pins) {
    for (const tag of pinTags(pin)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Autocomplete for the composer: existing tags matching what's been typed,
 * excluding any already on the pin. Prefix matches rank above substring ones.
 */
export function suggestTags(
  all: TagCount[],
  input: string,
  exclude: string[],
  limit = 6,
): string[] {
  const query = normalizeTag(input);
  const taken = new Set(exclude);
  const pool = all.filter((entry) => !taken.has(entry.tag));

  if (!query) return pool.slice(0, limit).map((entry) => entry.tag);

  return pool
    .filter((entry) => entry.tag.includes(query))
    .sort((a, b) => {
      const aStarts = a.tag.startsWith(query);
      const bStarts = b.tag.startsWith(query);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return b.count - a.count || a.tag.localeCompare(b.tag);
    })
    .slice(0, limit)
    .map((entry) => entry.tag);
}
