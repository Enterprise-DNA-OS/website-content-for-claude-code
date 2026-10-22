# Move structured content from Sanity

Sources checked 22 October 2026: [Export a dataset](https://www.sanity.io/docs/content-lake/exporting-data) and [Export API](https://www.sanity.io/docs/http-reference/export).

## Get the source export

In your existing Sanity project, sign in with read access and run the vendor's documented export:

```bash
npx sanity@latest datasets export production production.tar.gz
```

Keep that archive privately. Extract it using your archive utility. It contains a dataset directory with data.ndjson, assets.json and images/files directories. Sanity's authenticated export includes records your account can read; public requests omit private content. Read export warnings and investigate skipped asset downloads before retiring the old system.

## Import once

Create the destination dataset with add-dataset. Then:

```bash
node scripts/content.mjs import sanity imports/data.ndjson --dataset="Main website" --owner="Content lead" --actor="Migration operator" --dry-run
node scripts/content.mjs import sanity imports/data.ndjson --dataset="Main website" --owner="Content lead" --actor="Migration operator"
```

The free base accepts the extracted NDJSON file, up to 50 MB per batch. It does not unpack archives or fetch assets. Every nonempty line needs a JSON object with _id and _type. Duplicate IDs, invalid JSON and reserved object keys reject the complete batch. Same dataset and same payload means unchanged. Changed or archived source IDs stop the batch for reconciliation through revise. Nothing is silently overwritten, removed or marked current by an export's omission.

## What maps

| Sanity value | Owned record |
|---|---|
| Dataset selected by the operator | Dataset name supplied at import |
| _id | Source ID, unique within that dataset |
| _type | Content type name |
| title or name | Display name, falling back to _id |
| Entire document | Preserved JSON payload, including Portable Text and metadata |
| Nested _ref | Reference record with path, weak flag and external-dataset flag |
| drafts.* ID | Draft variant, excluded from delivery bundles |
| versions.* ID | Scheduled-release variant, preserved and excluded from bundles |
| sanity.imageAsset / sanity.fileAsset | Asset metadata, with binaries kept separately |
| _. IDs or system.* types | System variant, excluded from bundles |

Source _rev and timestamps remain in the payload. Local revisions and reviewer evidence start at import; this is not historical Sanity version recovery. A local edit preserves source metadata as historical source values, not as new Sanity revision tokens.

## Reconcile before use

Compare total counts by variant, IDs, titles, nested fields, references and asset records. Roundtrip with export --format=sanity and compare payloads. Classify information, define field rules using set-type, record owners and review dates, and inspect the generated content briefs. Resolve cross-dataset links and missing targets. Approve the exact local revisions before building a delivery bundle.

No Studio schemas, validation code, plugins, permissions, comments, webhook configuration, scheduled jobs, image transformations or delivery endpoints are recreated by import. Binary assets stay in the original archive and need a controlled move into your own storage. The base checks required top-level field names and types; custom Sanity validation requires explicit translation. Portable Text is preserved as data, not visually edited or rendered into a site.

Keep the existing site and Sanity service until the website adapter, media migration, access controls and every required content shape pass an end-to-end check. Enterprise DNA handles that agreed migration in the custom version. A local bundle is a handover artifact, never a live deployment.
