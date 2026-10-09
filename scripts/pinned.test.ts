// The pinned-URL rule of WISP 1200 (Stores), as scripts/check-store.ts applies it to each listing.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { isPinnedUrl, pinnedUrlProblem } from "./pinned.ts";

const COMMIT = "8430aa609f7ccc4bdef1db4566a298358fc07aab";
const PINNED = `https://cdn.jsdelivr.net/gh/MiguelMedeiros/ghostly-store@${COMMIT}/apps/chess.odcgw6wjw8dynqop/app.ghostlyapp`;
const RAW_HEAD = "https://raw.githubusercontent.com/MiguelMedeiros/ghostly-store/HEAD/apps/chess.odcgw6wjw8dynqop/app.ghostlyapp";
const EXAMPLE = "https://cdn.jsdelivr.net/gh/<owner>/<repo>@<40-character commit>/app.ghostlyapp";

test("a jsDelivr URL at a full commit passes", () => {
  assert.equal(pinnedUrlProblem([PINNED], EXAMPLE), null);
});

test("one pinned URL is enough beside others", () => {
  assert.equal(pinnedUrlProblem([RAW_HEAD, PINNED], EXAMPLE), null);
  assert.equal(pinnedUrlProblem([PINNED, "https://cdn.jsdelivr.net/gh/a/b@main/app.ghostlyapp"], EXAMPLE), null);
});

test("a branch, a tag, a range or latest is not pinned", () => {
  for (const ref of ["main", "HEAD", "v1.0.2", "1", "^1.0.0", "latest"]) {
    const url = `https://cdn.jsdelivr.net/gh/MiguelMedeiros/ghostly-store@${ref}/app.ghostlyapp`;
    assert.equal(isPinnedUrl(url), false, url);
    const problem = pinnedUrlProblem([url], EXAMPLE);
    assert.ok(problem?.includes(url), problem ?? "");
    assert.ok(problem?.includes("names a branch, a tag, latest or a short commit"), problem ?? "");
  }
  assert.equal(isPinnedUrl("https://cdn.jsdelivr.net/gh/MiguelMedeiros/ghostly-store/app.ghostlyapp"), false);
});

test("a short or uppercase commit is not pinned", () => {
  assert.equal(isPinnedUrl(`https://cdn.jsdelivr.net/gh/a/b@${COMMIT.slice(0, 7)}/app.ghostlyapp`), false);
  assert.equal(isPinnedUrl(`https://cdn.jsdelivr.net/gh/a/b@${COMMIT.slice(0, 39)}/app.ghostlyapp`), false);
  assert.equal(isPinnedUrl(`https://cdn.jsdelivr.net/gh/a/b@${COMMIT.toUpperCase()}/app.ghostlyapp`), false);
  assert.ok(pinnedUrlProblem([`https://cdn.jsdelivr.net/gh/a/b@${COMMIT.slice(0, 7)}/app.ghostlyapp`], EXAMPLE));
});

test("only URLs off jsDelivr fail, and the error names them and a valid one", () => {
  const problem = pinnedUrlProblem([RAW_HEAD, "https://example.com/app.ghostlyapp"], EXAMPLE);
  assert.ok(problem);
  assert.ok(problem.includes(RAW_HEAD) && problem.includes("https://example.com/app.ghostlyapp"), problem);
  assert.ok(problem.includes(EXAMPLE), problem);
  assert.ok(!problem.includes("names a branch"), problem);
});

test("no URLs, or no urls at all, fail", () => {
  assert.match(pinnedUrlProblem([], EXAMPLE) ?? "", /it has no URL/);
  assert.match(pinnedUrlProblem(undefined, EXAMPLE) ?? "", /it has no URL/);
});

test("a pinned path on another jsDelivr host, http, a port or a user is not pinned", () => {
  const path = `/gh/a/b@${COMMIT}/app.ghostlyapp`;
  assert.equal(isPinnedUrl(`https://fastly.jsdelivr.net${path}`), false);
  assert.equal(isPinnedUrl(`http://cdn.jsdelivr.net${path}`), false);
  assert.equal(isPinnedUrl(`https://cdn.jsdelivr.net:8443${path}`), false);
  assert.equal(isPinnedUrl(`https://u@cdn.jsdelivr.net${path}`), false);
  assert.equal(isPinnedUrl(`https://cdn.jsdelivr.net/gh/a/b@${COMMIT}/`), false);
  assert.equal(isPinnedUrl(`https://CDN.jsDelivr.net${path}`), true);
});
