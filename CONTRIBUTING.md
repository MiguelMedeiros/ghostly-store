# Submitting an app

Thank you for building for Ghostly. This page is how an app gets into the official store. Read the
[review rules](README.md#review-rules) first.

## 1. Build the app

A Ghostly mini-app is a static web app in **one self-contained HTML file**: scripts, styles, images and WebAssembly
inline. It runs in a sandbox with no network (unless it asks for `internet`) and talks to Ghostly only through
`window.ghostly`. [WISP 1200](https://github.com/MiguelMedeiros/ghostly/blob/dev/docs/wisps/1200-marketplace.md)
("What an app and a plugin are", "Permissions", "The runner and the broker") has the rules. Chess
([apps/mini/chess](https://github.com/MiguelMedeiros/ghostly/tree/dev/apps/mini/chess)) is a full example.

## 2. Bundle and sign it

Put your built `index.html` in a folder with a `ghostly-app.json` (the manifest without `publisher`, `sequence` and
`files`, which the CLI writes), and optionally `icon.png` (square, at most 256 KiB) and `screenshots/`:

```json
{
  "name": "my-game",
  "version": "1.0.0",
  "kind": "mini-app",
  "title": "My Game",
  "tagline": "One line about it",
  "entry": "index.html",
  "permissions": ["chat"],
  "runtime": { "host": ">=1.2", "clients": ["web", "desktop"] },
  "license": "MIT",
  "sources": ["https://raw.githubusercontent.com/<you>/<repo>/HEAD/app.ghostlyapp"]
}
```

Then, with the [Ghostly CLI](https://github.com/MiguelMedeiros/ghostly/tree/dev/packages/cli):

```sh
ghostly app publish ./my-game --key ~/ghostly-keys/my-game.key --out app.ghostlyapp
ghostly app verify app.ghostlyapp
```

The first run makes your publisher key. **Back it up**: an app is updated only with the key that signed it, and there
is no recovery. Never commit it.

## 3. Publish the bundle

Commit `app.ghostlyapp` to the root of your **public** GitHub repository (or a `ghostly` branch). Ghostly reads it from
`raw.githubusercontent.com`. You may add a jsDelivr URL pinned to the full 40-character commit:
`https://cdn.jsdelivr.net/gh/<you>/<repo>@<commit>/app.ghostlyapp` (a branch, a tag or `latest` is refused).

## 4. Open the pull request

Add one folder, `apps/<name>.<prefix>/`, where `<name>` is your manifest's `name` and `<prefix>` the first 16
characters of your publisher key (`ghostly app verify` prints the key). It holds `listing.json`:

```json
{
  "ref": "<publisher key>/<name>",
  "sequence": 1,
  "digest": "<the digest ghostly app verify prints>",
  "urls": ["https://raw.githubusercontent.com/<you>/<repo>/HEAD/app.ghostlyapp"],
  "title": "My Game",
  "tagline": "One line about it",
  "category": "Games",
  "developer": "Your name",
  "submitter": "Your GitHub login",
  "repo": "https://github.com/<you>/<repo>",
  "support": "https://github.com/<you>/<repo>/issues"
}
```

| Field | Rule |
|---|---|
| `ref`, `sequence`, `digest` | Exactly what `ghostly app verify` prints for the bundle you submit |
| `urls` | 1 to 4 https URLs on `raw.githubusercontent.com`, or on `cdn.jsdelivr.net` at a full commit |
| `title`, `tagline` | One line each, at most 40 and 80 characters |
| `category`, `developer`, `submitter` | Optional, one line of at most 40 characters |
| `repo`, `support` | Optional https URLs. `repo` is where the source is |

The icon, screenshots and description come from your signed bundle, never from the listing.

Only touch your own folder. Never edit `ghostly-store.json`, `ghostly-store.sig` or `STORE_KEY`: the owner signs the
index, and CI refuses an unsigned change to it.

## Updates

Publish again with the same key (`ghostly app publish` raises `sequence` by itself), commit the new bundle, and open a
pull request that changes `sequence` and `digest` in your listing.

## Revoking a version

If your key leaked or a version is harmful, run `ghostly app revoke <dir> --key <your key> --digest <digest>` (or
`--up-to <sequence>`), and send the `ghostly-revoke.json` it writes into your app's folder here. Ghostly stops those
versions on every device. A leaked key cannot be replaced: publish the app again under a new key and a new folder.

## What CI checks

`scripts/check.sh`, with the Ghostly CLI at `GHOSTLY_COMMIT`:

- each `listing.json` is a valid listing, in a folder named after its `ref`;
- the bundle at every URL verifies as Ghostly verifies it, and holds this app at the listed `sequence` and `digest`
  (a newer one at your `HEAD` is fine);
- every URL is on a host Ghostly reads;
- a revocation file verifies and names your app;
- the signed index, when it changes, is signed by `STORE_KEY` and raises its `sequence`.
- the store's own scripts type-check against Ghostly's sources (`npm run typecheck`).

Run it locally with `GHOSTLY=<a Ghostly checkout> scripts/check.sh`.

## Maintainers

Changes to `.github/`, `scripts/`, `package.json`, `package-lock.json`, `tsconfig.json`, `GHOSTLY_COMMIT` and `STORE_KEY`
change what CI trusts: they need the owner's review, and a reviewer reads them line by line. Merge with a merge commit
or a squash; the listing is what counts, not its commits.
