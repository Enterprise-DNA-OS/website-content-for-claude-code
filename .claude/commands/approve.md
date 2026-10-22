# approve

ID --decision=approved|changes --evidence=TEXT --actor=NAME.

Run node scripts/content.mjs approve with the arguments from the operator's request. Run help when an argument is missing. The command guide is docs/cli.md. Use --json when composing a result. Read the affected record first for changes. Resolve ambiguous names by listing candidates, never by choosing the first.

Report the returned records, dates and evidence. Do not infer missing facts.

Read show and the current content brief. Confirm the operator has supplied a real decision and evidence for that revision. Never approve on their behalf or invent a reviewer.
