// Bundles scripts/check-store.mjs with @ghostly/core from a Ghostly checkout, into one plain .mjs file.
//
// Run from the Ghostly checkout's root (scripts/check.sh copies it there), so `vite` resolves from its node_modules:
//
//   node bundle-check.mjs <check-store.mjs> <out dir> <ghostly checkout>

import { join, resolve } from "node:path";
import { build } from "vite";

const [entry, out, ghostly] = process.argv.slice(2);
if (!entry || !out || !ghostly) {
  console.error("usage: node bundle-check.mjs <check-store.mjs> <out dir> <ghostly checkout>");
  process.exit(2);
}

await build({
  configFile: false,
  logLevel: "warn",
  resolve: { alias: { "@ghostly/core": join(resolve(ghostly), "packages/core/src/index.ts") } },
  ssr: { noExternal: true },
  build: {
    ssr: resolve(entry),
    outDir: resolve(out),
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: { output: { entryFileNames: "check.mjs" } },
  },
});
