// Builds the unsigned store index from store.json, every apps/*/listing.json and every apps/*/ghostly-revoke.json.
// The owner signs the result offline with the Ghostly CLI:
//
//   node scripts/build-index.mjs --out /tmp/ghostly-store.draft.json
//   ghostly store sign /tmp/ghostly-store.draft.json --key ~/ghostly-keys/store.key --out .
//
// The sequence is one more than the signed index's (or --sequence). `expires` is --days ahead (default 80, at most
// 85): clients refuse an index more than 90 days ahead of their own clock, so the margin covers a clock that is late.
// Plain Node, no dependencies: the CLI checks the index again when it signs it, and CI checks what it signed.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const store = join(dirname(new URL(import.meta.url).pathname), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const out = args.out;
if (!out) {
  console.error("usage: node scripts/build-index.mjs --out <file> [--days 80] [--sequence n]");
  process.exit(2);
}
const days = Number(args.days ?? 80);
if (!Number.isInteger(days) || days < 1 || days > 85) {
  console.error("--days is a whole number from 1 to 85");
  process.exit(2);
}

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const meta = json(join(store, "store.json"));
const key = readFileSync(join(store, "STORE_KEY"), "utf8").trim();

let previous = 0;
if (existsSync(join(store, "ghostly-store.json"))) previous = json(join(store, "ghostly-store.json")).sequence;
const sequence = args.sequence ? Number(args.sequence) : previous + 1;
if (!Number.isSafeInteger(sequence) || sequence <= previous) {
  console.error(`--sequence must be higher than the signed index's ${previous}`);
  process.exit(2);
}

const apps = [];
const revoked = [...(meta.revoked ?? [])];
const seen = new Set(revoked.map((r) => JSON.stringify(r)));
const appsDir = join(store, "apps");
for (const name of existsSync(appsDir) ? readdirSync(appsDir).sort() : []) {
  const listing = join(appsDir, name, "listing.json");
  if (!existsSync(listing)) continue;
  apps.push(json(listing));
  const revokeFile = join(appsDir, name, "ghostly-revoke.json");
  if (existsSync(revokeFile)) {
    for (const r of json(revokeFile)) {
      const id = JSON.stringify(r);
      if (!seen.has(id)) { seen.add(id); revoked.push(r); }
    }
  }
}

const index = {
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
