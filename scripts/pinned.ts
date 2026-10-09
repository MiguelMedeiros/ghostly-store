/**
 * WISP 1200, Stores: "Every listing MUST carry at least one such immutable URL, a jsDelivr URL at a full commit; for a
 * bundle the store hosts itself, that is the store repository's own commit. [...] A store's check refuses a listing
 * without one." A raw `HEAD` URL alone serves the listed version only until the repository moves on.
 *
 * No @ghostly/core here, so the rule is tested on its own (scripts/pinned.test.ts).
 */

/** `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<40-hex commit>/<path>`, as core's isAppUrl reads a jsDelivr URL. */
const PINNED_PATH = /^\/gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}\/./;

/** A jsDelivr URL pinned to a full commit: the immutable copy a listing must carry. */
export function isPinnedUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === "https:" && !url.username && !url.password && url.port === ""
    && url.hostname.toLowerCase() === "cdn.jsdelivr.net" && PINNED_PATH.test(url.pathname);
}

/** A jsDelivr URL that names a branch, a tag, a range, `latest` or a short commit: jsDelivr serves those from a copy that moves. */
function isMovingJsDelivr(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (host === "jsdelivr.net" || host.endsWith(".jsdelivr.net")) && !isPinnedUrl(value);
  } catch { return false; }
}

/**
 * Why a listing's `urls` break the rule, in words, or null when one of them is pinned. `example` is the pinned URL to
 * suggest (for a bundle hosted in the store, the store repository's commit).
 */
export function pinnedUrlProblem(urls: unknown, example: string): string | null {
  const list = Array.isArray(urls) ? urls : [];
  if (list.some(isPinnedUrl)) return null;
  const strings = list.filter((u): u is string => typeof u === "string");
  const has = strings.length ? `it has ${strings.join(", ")}` : "it has no URL";
  const moving = strings.filter(isMovingJsDelivr);
  const hint = moving.length ? ` (${moving.join(", ")} names a branch, a tag, latest or a short commit, not a full commit)` : "";
  return `no jsDelivr URL pinned to a full commit: ${has}${hint}. Every listing carries at least one (WISP 1200, Stores), like ${example}`;
}
