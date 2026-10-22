# Content CLI

Run node scripts/content.mjs COMMAND. Arguments with spaces need quotes. Reads default to aligned text; --json returns structured results. Dates use YYYY-MM-DD. Record arguments accept an exact case-insensitive name or unique ID prefix. Ambiguity exits 1 and lists candidates. Errors print to stderr.

| Command | Arguments or result |
|---|---|
| help | Show commands |
| datasets | List datasets |
| add-dataset | --name=NAME |
| types | --dataset=NAME |
| set-type | --dataset=NAME --name=TYPE --rules=FILE --actor=NAME |
| list | [--dataset=NAME] [--type=TYPE] |
| show | ID or exact name |
| content-week | Content plan |
| attention | Overdue work and missing evidence |
| review-queue | Current review decisions |
| references | Missing or cross-dataset references |
| compliance | Evidence checks, not a compliance certificate |
| insights | Ten cross-record questions |
| add | --dataset=NAME --data=FILE --owner=NAME --due=DATE --actor=NAME |
| revise | ID --data=FILE --actor=NAME --note=TEXT |
| assign | ID --owner=NAME --due=DATE --review-due=DATE --actor=NAME |
| classify | ID --privacy=business / personal --purpose=TEXT --retention=DATE --actor=NAME |
| verify | ID --evidence=TEXT --actor=NAME |
| approve | ID --decision=approved / changes --evidence=TEXT --actor=NAME |
| archive | ID --note=TEXT --actor=NAME |
| history | ID |
| import | sanity FILE.ndjson --dataset=NAME --owner=NAME --actor=NAME [--dry-run] |
| imports | Import receipts |
| export | --out=FILE.json [--format=sanity --dataset=NAME] |
| bundle | --dataset=NAME --name=NAME --actor=NAME |
| bundles | Saved local delivery snapshots |
| draft-brief | ID |
| weekly-review | Draft Monday summary from week, attention and compliance |

## Field rules

Create a JSON file such as:

```json
{"title":{"type":"string","required":true},"body":{"type":"array","required":false}}
```

Supported types: string, number, boolean, array, object. Rules check top-level fields only. Extra content fields are preserved. A rule edit increments the rule version and invalidates prior approvals. Documents need _id and _type. IDs and type are fixed after creation. Use a new record for a new identity.

## Review example

```bash
node scripts/content.mjs assign "Services overview" --owner="Content lead" --due=2026-12-01 --review-due=2026-12-31 --actor="Editor"
node scripts/content.mjs classify "Services overview" --privacy=business --actor="Editor"
node scripts/content.mjs approve "Services overview" --decision=approved --evidence="Compared the wording with the service list" --actor="Reviewer"
```

Approval is a recorded operator decision, never something the agent invents. A personal record needs purpose, retention date and verify evidence. Every record revision invalidates approval. An edited payload clears accuracy evidence.

## Outputs

export without a format writes all records as JSON. export --format=sanity --dataset=NAME writes the preserved content payloads, including drafts, system and archived records, to NDJSON. It is a migration export, not a delivery bundle. Neither export overwrites an existing file.

bundle writes only approved active content and asset metadata from one dataset, excluding drafts, release variants and system records. It blocks missing references, including weak references. Use the saved bundle after building and testing the existing-site adapter. No website is deployed. Binary media is separate. A process or disk failure can leave an orphan output file; compare its hash and bundle ID with the database before handover.

OUTPUT_DIR moves generated views, documents, drafts and bundles to another directory. Explicit export --out paths are used as supplied. Protect these files as business records.
