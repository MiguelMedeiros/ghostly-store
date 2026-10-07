# Ghostly Store

The official store of [Ghostly](https://github.com/MiguelMedeiros/ghostly): free mini-apps and games that run in a
sandbox inside the app and can play with a contact in a chat.

This repository is the store. There is no server: Ghostly reads one signed file, `ghostly-store.json`, straight from
here. The format is [WISP 1200](https://github.com/MiguelMedeiros/ghostly/blob/dev/docs/wisps/1200-marketplace.md)
("Stores").

**Status:** not signed yet. `STORE_KEY` is empty and there is no `ghostly-store.json`, so no Ghostly app reads this
store. Apps arrive in Ghostly 1.2.

## The policy: official, curated

- **Curated.** The maintainers choose what is listed. A listing is a pull request, and a person reviews each one. A
  passing check is needed, and not enough.
- **Signed offline.** The owner signs `ghostly-store.json` with the store key, on a machine offline, in batches. No key
  is held by CI or GitHub, so taking over this repository or a GitHub account does not take over the store.
- **The store lists, the publisher signs.** Every app is signed by its own publisher key. The store key never signs an
  app, so the store cannot change an app's code, and Ghostly checks every bundle against its publisher's signature
  wherever it came from.
- **One source among many.** Ghostly preloads this store, and people can remove it. An app can also be installed from
  another store, from its URL, or from a card a contact sends.
- **Free apps only** for now. No payments, no ads, no tracking.

## What is here

| Path | What it is |
|---|---|
| `ghostly-store.json`, `ghostly-store.sig` | The signed index and its signature: what Ghostly reads. Written only by the owner with `ghostly store sign` |
| `STORE_KEY` | The store's public key (z-base32). Empty until the first signing. Ghostly pins the same key |
| `store.json` | The store's name and description, and its takedowns (`removed`). The index is built from it |
| `apps/<name>.<prefix>/listing.json` | One app's listing: exactly one entry of the index's `apps`. `<prefix>` is the first 16 characters of the publisher key |
| `apps/<name>.<prefix>/app.ghostlyapp` | The bundle, only for apps this store hosts (Ghostly's own, such as Chess). Other publishers host their bundle in their own repository |
| `apps/<name>.<prefix>/ghostly-revoke.json` | The publisher's signed revocations, copied into the index |
| `scripts/` | The check CI runs, and the index builder the owner runs before signing |
| `GHOSTLY_COMMIT` | The Ghostly commit whose CLI and reader the check uses |

## Submitting an app

Open a pull request that adds one folder, `apps/<name>.<prefix>/listing.json`. [CONTRIBUTING.md](CONTRIBUTING.md) has
the steps, the listing's fields and the checklist. In short:

1. Build your app as one self-contained HTML file (scripts, styles and images inline).
2. Bundle and sign it with the Ghostly CLI: `ghostly app publish <dir> --key <your publisher key>`.
3. Commit `app.ghostlyapp` to your own public GitHub repository.
4. Open a pull request here with your listing. CI checks it; a maintainer reviews it; the owner signs the next index.

## Review rules

A maintainer reads the app's code before listing it. An app is listed when:

- the check passes: the bundle at every URL verifies, and its `ref`, `sequence` and `digest` match the listing;
- it does what its title, tagline and description say, and nothing else;
- it asks only for the permissions it needs, and says why in the pull request (`internet` is looked at closely);
- it sends nothing about the person to anyone without saying so on its screen, and collects no data it does not need;
- it has no ads, no tracking, no crypto mining, no gambling for money, and no adult content;
- it does not copy another app's name, icon or look, or pretend to be Ghostly;
- its license allows us to list it, and the source is public, so anyone can read what runs;
- its publisher answers questions in the pull request.

An update of a listed app is a pull request too, with a higher `sequence`. The same review applies to what changed.

## Takedowns and revocations

- **A takedown by the store.** A maintainer adds `{"ref", "digest", "reason", "at"}` to `removed` in `store.json` and,
  for the whole app, deletes its folder. At the next signing Ghostly stops that version on every device that has the
  store and asks the person what to do. A reason is always shown.
- **A revocation by the publisher.** A publisher whose key leaked, or who shipped a bad version, signs a revocation
  with `ghostly app revoke` and sends `ghostly-revoke.json` here. Ghostly stops those versions with no way to run them.
- **To report an app** that breaks these rules, open an issue. For malware or a security flaw that people could exploit,
  write to the owner privately first (see the
  [security policy](https://github.com/MiguelMedeiros/ghostly/security/policy)).
- A takedown here has no effect on stores other people run. It only changes what this store lists.

## Signing (owner only)

The store key never leaves the owner's machine. To sign a new batch:

```sh
git pull
node scripts/build-index.mjs --out /tmp/ghostly-store.draft.json
ghostly store sign /tmp/ghostly-store.draft.json --key ~/ghostly-keys/store.key --out .
GHOSTLY=~/code/ghostly scripts/check.sh
git add ghostly-store.json ghostly-store.sig && git commit -m "Sign the store" && git push
```

An index expires 80 days after it is signed (Ghostly refuses one more than 90 days ahead of its clock). Past that,
apps still install and Ghostly says the store was not updated. Sign again before then, even with no change.

## Checking locally

```sh
GHOSTLY=<a Ghostly checkout at GHOSTLY_COMMIT, with npm ci run> scripts/check.sh
```

## License

The scripts and listings in this repository are MIT. Each app is under its own license, named in its manifest.
