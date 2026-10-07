// Checks this store as a Ghostly client would read it (WISP 1200, "Stores"), and the listings waiting to be signed.
//
// It imports @ghostly/core straight from the sources of a Ghostly checkout at the pinned commit (scripts/check.sh links
// it as .ghostly; tsconfig.json maps the import there), so it reads the index, the listings and the revocations with
// the very code the app uses. Bundles are checked with the Ghostly CLI's `app verify`, which runs every check a client
// makes before it stores a bundle.
//
//   tsx scripts/check-store.ts --store <dir> --cli <ghostly.mjs> [--base <dir>]
//
// --base is the same repository before the change (a pull request's base). With it, a change to the signed index must
// raise its sequence, and a store key, once set, must not change.
//
// Exit 0: everything a client reads is valid. Exit 1: something is not; each problem is printed (as a GitHub
// annotation in Actions).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  appStoreDecision, canonicalJson, isAppKey, isAppUrl, readAppListing, readAppRevocations, readAppStore,
  type AppListing, type AppStoreReading,
} from "@ghostly/core";
import { parseArgs } from "./args.ts";

const args = parseArgs(process.argv.slice(2));
const STORE = args.store;
const CLI = args.cli;
const BASE = args.base && existsSync(args.base) ? args.base : null;
if (!STORE || !CLI) {
  console.error("usage: tsx scripts/check-store.ts --store <dir> --cli <ghostly.mjs> [--base <dir>]");
  process.exit(2);
}

/** This repository, as raw.githubusercontent.com names it: a bundle hosted here is read from the checkout. */
const REPO = process.env.STORE_REPOSITORY || process.env.GITHUB_REPOSITORY || "MiguelMedeiros/ghostly-store";
const HOSTED = `https://raw.githubusercontent.com/${REPO}/HEAD/`;
/** The only hosts a client reads apps and stores from in release 1.2 (packages/browser/src/engine/appFetch.ts). */
const FETCH_HOSTS = ["raw.githubusercontent.com", "cdn.jsdelivr.net"];
/** What a client reads of an index at most (APP_FETCH_LIMITS.storeIndexBytes), under the format's 16 MiB. */
const CLIENT_INDEX_BYTES = 4 * 1024 * 1024;
/** The files an app's folder may hold. */
const FOLDER_FILES = new Set(["listing.json", "app.ghostlyapp", "ghostly-revoke.json"]);
const FOLDER = /^([a-z][a-z0-9-]{0,31})\.([ybndrfg8ejkmcpqxot1uwisza345h769]{16})$/;

const now = Math.floor(Date.now() / 1000);
const inActions = process.env.GITHUB_ACTIONS === "true";
let errors = 0;
const error = (file: string, message: string): void => {
  errors++;
  console.log(inActions ? `::error file=${file}::${message.replace(/\n/g, " ")}` : `error: ${file}: ${message}`);
};
const notice = (file: string, message: string): void =>
  console.log(inActions ? `::notice file=${file}::${message.replace(/\n/g, " ")}` : `note: ${file}: ${message}`);
const ok = (message: string): void => console.log(`ok: ${message}`);

const read = (root: string, path: string): Uint8Array | null =>
  existsSync(join(root, path)) ? new Uint8Array(readFileSync(join(root, path))) : null;
const text = (root: string, path: string): string | null => {
  const bytes = read(root, path);
  return bytes ? new TextDecoder().decode(bytes) : null;
};
/** A refusal from a core reader, in words. */
const why = (reading: { reason: string; detail?: string }): string => `${reading.reason}${reading.detail ? `: ${reading.detail}` : ""}`;

/** A URL a client fetches: https, no port, no user, and only on the two hosts (jsDelivr only at a full commit). */
function fetchable(url: string): boolean {
  if (!isAppUrl(url)) return false;
  const parsed = new URL(url);
  return parsed.port === "" && FETCH_HOSTS.includes(parsed.hostname.toLowerCase());
}

/** What `ghostly app verify` prints on its last line (packages/cli, `app verify`). */
interface VerifyOutput {
  valid?: boolean;
  ref: string;
  sequence: number;
  digest: string;
  bytes: number;
  error?: { message?: string };
}
type Verified = { ok: true; bundle: VerifyOutput } | { ok: false; message: string };

/** `ghostly app verify <file|url>`: the bundle's ref, sequence and digest, or why it was refused. */
function verifyBundle(cli: string, source: string): Verified {
  const run = spawnSync(process.execPath, [cli, "app", "verify", source], { encoding: "utf8", timeout: 120_000 });
  const out = `${run.stdout ?? ""}`.trim() || `${run.stderr ?? ""}`.trim();
  let value: VerifyOutput | undefined;
  try { value = JSON.parse(out.split("\n").pop() ?? "") as VerifyOutput; } catch { /* said below */ }
  if (run.status === 0 && value?.valid) return { ok: true, bundle: value };
  return { ok: false, message: value?.error?.message ?? (out || `exit ${run.status}`) };
}

// ---------- the store key ----------

const keyText = (text(STORE, "STORE_KEY") ?? "").trim();
const baseKey = BASE ? (text(BASE, "STORE_KEY") ?? "").trim() : "";
if (keyText && !isAppKey(keyText)) error("STORE_KEY", "is not a store public key (52 z-base32 characters)");
if (baseKey && keyText !== baseKey) error("STORE_KEY", "changed: a store is its key, and a new key would be another store. Only the owner changes it, in a change of its own");
else if (BASE && !baseKey && keyText) notice("STORE_KEY", "set for the first time: only the owner sets it, with the key Ghostly pins (DEFAULT_STORE_KEY)");
const storeKey = isAppKey(keyText) ? keyText : null;

// ---------- the signed index ----------

const indexBytes = read(STORE, "ghostly-store.json");
const sigBytes = read(STORE, "ghostly-store.sig");
let signed: AppStoreReading | null = null;
if (!storeKey) {
  if (indexBytes || sigBytes) error("ghostly-store.json", "there is a signed index but STORE_KEY is empty: the index is read only under the key in STORE_KEY");
  else notice("STORE_KEY", "empty: the store is not signed yet, so clients do not read it");
} else if (!indexBytes || !sigBytes) {
  error("ghostly-store.json", "STORE_KEY is set, so ghostly-store.json and ghostly-store.sig must both be here");
} else if (indexBytes.length > CLIENT_INDEX_BYTES) {
  error("ghostly-store.json", `is ${indexBytes.length} bytes: a client reads at most ${CLIENT_INDEX_BYTES}`);
} else {
  const reading = readAppStore(indexBytes, sigBytes, now, storeKey);
  if (!reading.ok) {
    error("ghostly-store.json", `a client refuses it (${why(reading)}). Build it with scripts/build-index.ts and sign it with ghostly store sign`);
  } else {
    signed = reading.store;
    const { index } = signed;
    ok(`ghostly-store.json: "${index.name}", sequence ${index.sequence}, ${index.apps.length} apps, ${index.removed.length} removed, ${index.revoked.length} revoked`);
    if (signed.expired) error("ghostly-store.json", `expired on ${new Date(index.expires * 1000).toISOString()}: build and sign it again`);
    else if (index.expires - now < 14 * 86_400) notice("ghostly-store.json", `expires on ${new Date(index.expires * 1000).toISOString()}: sign it again soon`);
    for (const app of index.apps) {
      if (!app.urls.some(fetchable)) error("ghostly-store.json", `${app.ref}: no URL a client reads (only ${FETCH_HOSTS.join(" and ")})`);
    }
  }
}

// The index this change follows: the same key's index may only move forward.
if (BASE && signed) {
  const baseIndex = read(BASE, "ghostly-store.json");
  const baseSig = read(BASE, "ghostly-store.sig");
  const held = baseIndex && baseSig ? readAppStore(baseIndex, baseSig, now) : null;
  if (held?.ok && held.store.index.key === signed.index.key) {
    const decision = appStoreDecision(
      { key: held.store.index.key, sequence: held.store.index.sequence, digest: held.store.digest },
      { key: signed.index.key, sequence: signed.index.sequence, digest: signed.digest },
    );
    if (decision === "rollback" || decision === "equivocation") {
      error("ghostly-store.json", `${decision}: the base holds sequence ${held.store.index.sequence}, and clients refuse ${decision === "rollback" ? "a lower one" : "the same one with other content"}`);
    } else if (decision === "update") ok(`ghostly-store.json: sequence ${held.store.index.sequence} -> ${signed.index.sequence}`);
  }
}

// ---------- listings ----------

const listings = new Map<string, { listing: AppListing; at: string }>();
const appsDir = join(STORE, "apps");
for (const name of existsSync(appsDir) ? readdirSync(appsDir).sort() : []) {
  const dir = join(appsDir, name);
  const at = relative(STORE, dir);
  if (!statSync(dir).isDirectory()) {
    if (name !== "README.md") error(at, "apps/ holds one folder per app, apps/<name>.<publisher prefix>/");
    continue;
  }
  const folder = FOLDER.exec(name);
  if (!folder) { error(at, "is not <name>.<first 16 characters of the publisher key>"); continue; }
  const [, folderName = "", folderPrefix = ""] = folder;
  for (const file of readdirSync(dir)) if (!FOLDER_FILES.has(file)) error(`${at}/${file}`, `an app's folder holds only ${[...FOLDER_FILES].join(", ")}`);

  const listingText = text(dir, "listing.json");
  if (listingText === null) { error(`${at}/listing.json`, "is missing"); continue; }
  const parsed = readAppListing(listingText);
  if (!parsed.ok) { error(`${at}/listing.json`, `is not a listing (${why(parsed)})`); continue; }
  const listing = parsed.listing;
  const [publisher = "", appName = ""] = listing.ref.split("/");
  if (appName !== folderName || !publisher.startsWith(folderPrefix)) {
    error(`${at}/listing.json`, `ref ${listing.ref} does not match the folder: it is apps/${appName}.${publisher.slice(0, 16)}/`);
  }
  listings.set(listing.ref, { listing, at });

  // Each URL serves this app, at this version or (for a publisher's own HEAD) a newer one.
  let hostedHere = false;
  for (const url of listing.urls) {
    if (!fetchable(url)) { error(`${at}/listing.json`, `${url}: a client reads only https on ${FETCH_HOSTS.join(" and ")} (jsDelivr pinned to a full commit)`); continue; }
    const local = url.startsWith(HOSTED) ? url.slice(HOSTED.length) : null;
    if (local !== null) {
      if (local !== `${at}/app.ghostlyapp`) { error(`${at}/listing.json`, `${url}: a bundle hosted here is ${at}/app.ghostlyapp`); continue; }
      hostedHere = true;
    }
    const checked = verifyBundle(CLI, local !== null ? join(STORE, local) : url);
    if (!checked.ok) { error(`${at}/listing.json`, `${url}: ${checked.message}`); continue; }
    const b = checked.bundle;
    if (b.ref !== listing.ref) { error(`${at}/listing.json`, `${url} holds ${b.ref}, not ${listing.ref}`); continue; }
    const exact = local !== null || url.startsWith("https://cdn.jsdelivr.net/");
    if (b.sequence < listing.sequence) error(`${at}/listing.json`, `${url} holds sequence ${b.sequence}, older than the listed ${listing.sequence}`);
    else if (b.sequence === listing.sequence && b.digest !== listing.digest) error(`${at}/listing.json`, `${url} holds another bundle under sequence ${b.sequence} (digest ${b.digest}, listed ${listing.digest})`);
    else if (exact && b.sequence !== listing.sequence) error(`${at}/listing.json`, `${url} is pinned and holds sequence ${b.sequence}, not the listed ${listing.sequence}`);
    else if (b.sequence > listing.sequence) notice(`${at}/listing.json`, `${url} already holds sequence ${b.sequence}; the listing names ${listing.sequence}`);
    else ok(`${listing.ref}: ${url} (sequence ${b.sequence}, ${b.bytes} bytes)`);
  }
  if (existsSync(join(dir, "app.ghostlyapp")) && !hostedHere) error(`${at}/app.ghostlyapp`, `no URL of the listing names it (${HOSTED}${at}/app.ghostlyapp)`);

  const revokeBytes = read(dir, "ghostly-revoke.json");
  if (revokeBytes) {
    const revocations = readAppRevocations(revokeBytes);
    if (!revocations.ok) error(`${at}/ghostly-revoke.json`, `a client refuses it (${why(revocations)})`);
    else for (const r of revocations.revocations) if (r.statement.app !== listing.ref) error(`${at}/ghostly-revoke.json`, `revokes ${r.statement.app}, another app`);
  }
}

// ---------- store.json, what the index is built from ----------

const meta = text(STORE, "store.json");
if (meta === null) error("store.json", "is missing");
else {
  try {
    // Any JSON value, read as the old check did: null throws (said as "is not JSON"), a string's keys are its indexes.
    const value = JSON.parse(meta) as Record<string, unknown>;
    for (const key of Object.keys(value)) if (!["name", "description", "kind", "removed", "revoked"].includes(key)) error("store.json", `unknown key ${key}`);
    if (value.kind !== "curated") error("store.json", "kind is curated: this store is a list the maintainers choose");
  } catch (e) { error("store.json", `is not JSON: ${(e as Error).message}`); }
}

// ---------- what waits to be signed ----------

if (signed) {
  const inIndex = new Map(signed.index.apps.map((a) => [a.ref, a]));
  for (const [ref, { listing, at }] of listings) {
    const listed = inIndex.get(ref);
    if (!listed) notice(`${at}/listing.json`, `${ref} is not in the signed index yet: it waits for the owner's next signing`);
    else if (canonicalJson(listed) !== canonicalJson(listing)) notice(`${at}/listing.json`, `differs from the signed index: the change waits for the owner's next signing`);
  }
  for (const ref of inIndex.keys()) if (!listings.has(ref)) notice("ghostly-store.json", `${ref} is in the signed index but has no folder: it leaves at the next signing`);
} else if (listings.size) notice("apps", `${listings.size} listing(s) wait for the first signed index`);

if (listings.size === 0) ok("no listings yet");
console.log(errors ? `\n${errors} problem(s).` : "\nThe store is valid.");
process.exit(errors ? 1 : 0);
