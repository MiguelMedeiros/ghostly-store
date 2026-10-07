// Builds the unsigned store index from store.json, every apps/*/listing.json and every apps/*/ghostly-revoke.json.
// The owner signs the result offline with the Ghostly CLI:
//
//   npm run build-index -- --out /tmp/ghostly-store.draft.json
//   ghostly store sign /tmp/ghostly-store.draft.json --key ~/ghostly-keys/store.key --out .
//
// The sequence is one more than the signed index's (or --sequence). `expires` is --days ahead (default 80, at most
// 85): clients refuse an index more than 90 days ahead of their own clock, so the margin covers a clock that is late.
// It needs no Ghostly checkout to run: it only takes @ghostly/core's types (erased when it runs). The CLI checks the
// index again when it signs it, and CI checks what it signed.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppListing, AppRemoval, AppStoreIndex, SignedAppRevocation } from "@ghostly/core";
import { parseArgs } from "./args.ts";

/** store.json: what the index is built from, beside the listings. */
interface StoreMeta {
  name: string;
  description?: string;
  kind: AppStoreIndex["kind"];
  removed?: AppRemoval[];
  revoked?: SignedAppRevocation[];
}
/** The index as the CLI signs it: `key` is left out while STORE_KEY is empty. */
type DraftIndex = Omit<AppStoreIndex, "key"> & { key?: string };

const store = join(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const out = args.out;
if (!out) {
  console.error("usage: npm run build-index -- --out <file> [--days 80] [--sequence n]");
  process.exit(2);
}
const days = Number(args.days ?? 80);
if (!Number.isInteger(days) || days < 1 || days > 85) {
  console.error("--days is a whole number from 1 to 85");
  process.exit(2);
}

const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const meta = json<StoreMeta>(join(store, "store.json"));
const key = readFileSync(join(store, "STORE_KEY"), "utf8").trim();

let previous = 0;
if (existsSync(join(store, "ghostly-store.json"))) previous = json<AppStoreIndex>(join(store, "ghostly-store.json")).sequence;
const sequence = args.sequence ? Number(args.sequence) : previous + 1;
if (!Number.isSafeInteger(sequence) || sequence <= previous) {
  console.error(`--sequence must be higher than the signed index's ${previous}`);
  process.exit(2);
}

const apps: AppListing[] = [];
const revoked: SignedAppRevocation[] = [...(meta.revoked ?? [])];
const seen = new Set(revoked.map((r) => JSON.stringify(r)));
const appsDir = join(store, "apps");
for (const name of existsSync(appsDir) ? readdirSync(appsDir).sort() : []) {
  const listing = join(appsDir, name, "listing.json");
  if (!existsSync(listing)) continue;
  apps.push(json<AppListing>(listing));
  const revokeFile = join(appsDir, name, "ghostly-revoke.json");
  if (existsSync(revokeFile)) {
    for (const r of json<SignedAppRevocation[]>(revokeFile)) {
      const id = JSON.stringify(r);
      if (!seen.has(id)) { seen.add(id); revoked.push(r); }
    }
  }
}

const index: DraftIndex = {
  ghostlyStore: 1,
  ...(key ? { key } : {}),
  name: meta.name,
  ...(meta.description ? { description: meta.description } : {}),
  kind: meta.kind,
  sequence,
  expires: Math.floor(Date.now() / 1000) + days * 86_400,
  apps,
  removed: meta.removed ?? [],
  revoked,
};
writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
console.log(`${out}: sequence ${sequence}, ${apps.length} apps, ${index.removed.length} removed, ${revoked.length} revoked, expires ${new Date(index.expires * 1000).toISOString()}`);
