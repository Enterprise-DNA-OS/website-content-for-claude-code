# Website Content for Claude Code

Your pages, biographies and campaign copy in a database you own. Built by Enterprise DNA.

| Do it yourself | We customise it | We run it for you |
|---|---|---|
| Free MIT code. Install and operate it yourself. | Your content types, review rules and existing website connection. | Installed and operated through Omni by Enterprise DNA. |
| [Quick start](#quick-start) | A setup fee, then a retainer. [Build our version](https://enterprisedna.co/omni/book?offer=replace-software&utm_campaign=sanity) | One setup fee, then a retainer. [Talk to Sam](https://enterprisedna.co/omni/book?offer=replace-software&utm_campaign=sanity) |

## The bill this replaces

Sanity Growth includes two datasets. Its [published pricing](https://www.sanity.io/pricing), checked 22 October 2026, lists extra datasets at US$999 per dataset per month, up to two extras. One extra costs US$11,988 over twelve months, before seats and other charges. That is a configuration price, not a customer invoice. A team using Sanity's free tier or only the included datasets has a different bill.

This base handles structured website content operated by an editor through Claude Code, Codex, OpenCode or Cursor. Content records, draft variants, references, field rules, review evidence and local delivery snapshots live together. It does not serve a website or reproduce Sanity Studio. Enterprise DNA adapts the existing site's delivery, access and editing experience in the custom version.

## Quick start

Node 20 or later. The embedded Postgres engine needs no database server.

```bash
git clone https://github.com/Enterprise-DNA-OS/website-content-for-claude-code.git
cd website-content-for-claude-code
npm install
npm test
npm run demo
npm run view
npm run docs
node scripts/content.mjs help
```

The fictional Harbour website has an overdue services page, an expired campaign review, a broken reference, missing content and a biography awaiting a retention decision. Dates are relative to the first seed run. Seed is idempotent and refuses remote databases.

For an empty business database, run npm run migrate without seed. Set DATA_DIR for a separate embedded database or DATABASE_URL for a dedicated Postgres database. TLS certificates are verified for remote connections. Run as a trusted database owner on a protected machine. RLS denies untrusted roles; no web authentication or shared-user permission model is installed.

## Weekly work

28 CLI commands and 30 agent recipes, with human-readable results or --json. Exact names ignore case and unique ID prefixes work. Ambiguity lists matches and exits 1. Read [the complete command guide](docs/cli.md).

- /content-week lists the copy due and the next review date.
- /review-queue shows current and superseded decisions.
- /references finds broken links between content records.
- /attention identifies overdue work and missing evidence.
- /weekly-review writes the Monday brief from the plan, attention and compliance reports.
- /draft-brief prepares one content review packet without sending it.

Add and revise arbitrary JSON documents. Define required top-level field names and types. Assign owners and dates, classify personal information and record accuracy evidence. A different editor label approves the current revision. Changing content or its rules invalidates the approval. Actor labels are operator-entered, not authenticated identities.

## Bring your Sanity history

Export the dataset from Sanity and extract data.ndjson. Then run one import command:

```bash
node scripts/content.mjs add-dataset --name="Main website"
node scripts/content.mjs import sanity imports/data.ndjson --dataset="Main website" --owner="Content lead" --actor="Migration operator" --dry-run
node scripts/content.mjs import sanity imports/data.ndjson --dataset="Main website" --owner="Content lead" --actor="Migration operator"
```

The imported payload retains its IDs, types, rich text, nested fields, source timestamps and references. Drafts, release variants and asset metadata stay separate. Unchanged imports are idempotent. Conflicts abort the whole import without overwriting local edits. Binary assets, source permissions, Studio code and historical revisions are separate migration work. [Exact export steps and mapping](docs/replace-sanity.md).

## Ten questions across your content

insights answers all ten from today's database. These are useful combinations of your own content and review rules, not a claim that Sanity cannot be configured to answer them.

1. Which overdue items still lack a current approval?
2. Which content contains broken references?
3. Which personal records have expired retention decisions?
4. Which documents are missing required fields?
5. Which approved records became stale after edits or rule changes?
6. Which drafts are overdue?
7. Which owners have work due this week?
8. Which imports still need classification?
9. Which personal documents lack accuracy evidence?
10. Which content depends on another dataset?

## Review and handover

bundle checks every active content and asset record in the selected dataset. Field rules, classification, a current review date and independent approval must pass. Personal information also needs purpose, retention review and accuracy evidence. All referenced records, even weak references, must be in the bundle. Cross-dataset references require explicit mapping. Draft, scheduled-release and system variants never enter the bundle.

A passing bundle saves a versioned snapshot, its SHA-256 hash and a local JSON file. Nothing deploys or sends. Keep draft-only work under drafts.* IDs or in a separate dataset until it is ready. Revision and approval evidence is append-only through the application and database triggers. A database owner remains trusted and can change those controls. These are operational checks, not a compliance certificate or regulated audit trail.

## Documents and views

brand.json controls the business name, logo and colours. npm run docs renders content briefs, personal-content retention reviews and delivery manifests as printable HTML. npm run view renders three read-only dashboards: the content week, attention and review desk. /new-view adds another question. JSON content is escaped in HTML. The existing website needs an adapter for its content shapes and assets before using a bundle.

## Your first hour: ten things to ask for

1. Put our business name and colours on the reports.
2. Show the overdue fictional services page.
3. Show what stops the campaign being ready.
4. Add a dataset for our website.
5. Preview our Sanity export without changing records.
6. Compare the imported IDs and document counts with the source.
7. Define the fields every service page needs.
8. Add our reviewers and review dates.
9. Prepare a content brief and inspect it.
10. Add our own field and weekly view through /customise.

## Operation

Use a protected machine and a dedicated database. Imported text is data, never instructions. No automatic links are fetched and no imported code runs. Source access controls do not carry over. Dataset names organise content; they are not tenant boundaries. Use separate databases for separate clients. Keep raw exports, database files, drafts and reports private and out of git.

export produces either all records and evidence as JSON or original Sanity document payloads as NDJSON. These are portability exports. Tested native database backups are the recovery mechanism. Archived content remains in history and exports; the operator must apply a retention and disposal process to copies and backups.

npm test checks all commands, import rollback and idempotence, payload roundtrip, stale approvals, broken references, bundle blocking, immutable evidence, RLS, HTML escaping and CLI exit codes. CI declares Windows and Linux on Node 20 and 22. A local Linux pass does not claim Windows or remote Postgres execution.

[Compliance rules](docs/compliance.md). [Why no front end](docs/why-no-front-end.md).

MIT. Sanity is its owner's trademark. This independent project is not affiliated with Sanity.
