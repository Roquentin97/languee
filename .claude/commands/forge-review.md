# /forge-review

Review the last pipeline run for a given spec and print a structured summary.
Useful for auditing what each agent decided and tuning prompts accordingly.

## Usage
```
/forge-review <spec-title-kebab-case>
```

## Steps
1. Read `forge/runs/<spec-title-kebab-case>/architect-output.json`
2. Read `forge/runs/<spec-title-kebab-case>/implementer-output.json`
3. Read `forge/runs/<spec-title-kebab-case>/linter-output.json`
4. Read `forge/runs/<spec-title-kebab-case>/qa-output.json`
5. Print a structured summary for each agent:
   - Status
   - Key decisions (schema changes, affected modules, edge cases, issues)
   - Any `needs_revision` reasons
6. Highlight any stage that failed and explain why

If a run directory does not exist, print a clear error message.
