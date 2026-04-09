# /forge-review

Review the last pipeline run for a given spec and print a structured summary.
Useful for auditing what each agent decided and tuning prompts accordingly.

## Usage

```
/forge-review <spec-title-kebab-case>
```

## Steps

1. Read `forge/runs/<spec-title-kebab-case>/run-summary.json`
2. Read `forge/runs/<spec-title-kebab-case>/architect-output.json`
3. Read `forge/runs/<spec-title-kebab-case>/implementer-output.json`
4. Read `forge/runs/<spec-title-kebab-case>/linter-output.json`
5. Read `forge/runs/<spec-title-kebab-case>/qa-output.json`
6. Print the usage summary table first:

   | Stage       | Model             | Input tokens | Output tokens | Total      | Duration |
   | ----------- | ----------------- | ------------ | ------------- | ---------- | -------- |
   | architect   | claude-sonnet-4-6 | 4,821        | 1,204         | 6,025      | 38s      |
   | implementer | claude-sonnet-4-6 | 12,043       | 3,891         | 15,934     | 187s     |
   | linter      | claude-haiku-4-5  | 3,201        | 412           | 3,613      | 22s      |
   | qa          | claude-sonnet-4-6 | 18,204       | 5,103         | 23,307     | 265s     |
   | **total**   |                   | **38,269**   | **10,610**    | **48,879** | **512s** |

7. Print a structured summary for each agent:
   - Status
   - Key decisions (schema changes, affected modules, edge cases, issues)
   - Any `needs_revision` reasons
8. Highlight any stage that failed and explain why

If a run directory does not exist, print a clear error message.
If `run-summary.json` does not exist but agent output files do, print the agent
summaries without usage data and note that usage metadata is unavailable.
