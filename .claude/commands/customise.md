# Customise

Read CLAUDE.md, the current field rules and docs/cli.md. For a new content field, use set-type with a reviewed rules JSON and revise the record payload. Explain which existing approvals become stale. For a stored workflow field, write the next numbered SQL migration in supabase/migrations, update the CLI, seed and affected views, then apply npm run migrate to a disposable database. Run npm test. Take a database backup before applying to business records. Preserve record IDs and evidence. No destructive change without the operator's explicit approval. Hand the result back in chat.
