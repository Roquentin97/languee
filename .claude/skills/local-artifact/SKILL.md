---
name: local-artifact
description: Use when the user asks for a local artifact, /local-artifact, or wants artifact-style output saved into the repo instead of published to claude.ai. Produces a self-contained HTML page under .lab/artifacts/html/ and an LLM-optimized Markdown twin under .lab/artifacts/md/.
---

# Local Artifact

Mirror of the `/artifact` (Artifact tool) workflow, except nothing is published to
claude.ai. Every invocation produces two local files sharing one slug:

1. `.lab/artifacts/html/<slug>.html` - the human-facing page, equivalent to what the
   Artifact tool would render.
2. `.lab/artifacts/md/<slug>.md` - the same content restructured for LLM consumption.

Both paths are relative to the monorepo root. Create the directories if missing.

## Workflow

1. Load the `artifact-design` skill first (via the Skill tool) to calibrate how much
   design investment the request warrants - exactly as the Artifact tool requires. If
   the content includes any chart, graph, or data visualization, also load `dataviz`
   before writing chart code.
2. Choose a short, stable kebab-case slug describing the deliverable
   (e.g. `competitor-report`, `srs-flow-diagram`). The slug names both files.
3. Write the HTML file, then the Markdown file.
4. Report both file paths to the user. Do not call the Artifact tool and do not
   publish anything unless the user explicitly asks for a claude.ai artifact too.

## Updating an existing local artifact

When the user asks to update a local artifact, reuse the same slug and overwrite both
files - this is the local equivalent of redeploying to the same URL. Keep both files in
sync: never update one without regenerating the other. Use a new slug only when the
deliverable is genuinely a new, separate artifact. To find existing local artifacts,
list `.lab/artifacts/html/`.

## HTML file rules (`.lab/artifacts/html/<slug>.html`)

Unlike the Artifact tool, no skeleton is added at publish time, so the file must be a
complete standalone document: include `<!doctype html>`, `<html>`, `<head>` with
`<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`,
a concise `<title>`, and `<body>`. It must render correctly when opened directly with
`file://` in a browser.

Follow the same constraints the Artifact tool enforces:

- Self-contained only: no external hosts - no CDN scripts, external stylesheets,
  remote fonts, or remote images. Inline all CSS/JS; embed assets as `data:` URIs.
  Mermaid renders only where a runtime provides it, so for diagrams prefer inline SVG
  in the HTML file.
- Responsive: relative units, flexbox/grid, `max-width: 100%` on images. Wide content
  (tables, diagrams, code blocks) scrolls inside its own `overflow-x: auto` container;
  the page body never scrolls horizontally.
- Theme-aware: style light and dark via `@media (prefers-color-scheme: dark)` unless
  the design deliberately commits to a single look.
- Favicon: since there is no `favicon` parameter, embed an emoji favicon inline, e.g.
  `<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">`.
  Keep it stable across updates of the same slug.

## Markdown file rules (`.lab/artifacts/md/<slug>.md`)

This file is for LLM processing, not visual polish. Same substance as the HTML, but:

- Start with YAML frontmatter:

  ```yaml
  ---
  title: <same title as the HTML <title>>
  slug: <slug>
  updated: <YYYY-MM-DD>
  summary: <one-sentence description of the content>
  ---
  ```

- Plain, semantic structure: a single `#` title, hierarchical `##`/`###` headings,
  short paragraphs, lists, and pipe tables. No HTML tags, no inline CSS, no emoji
  decoration, no horizontal-rule flourishes.
- Prefer explicit data over presentation: where the HTML uses a chart or diagram,
  the Markdown states the underlying numbers or relationships in a table or list,
  plus a one-line description of what the visualization shows.
- Spell out everything the HTML conveys visually (color coding, ordering, emphasis)
  as text so no information is lost to a reader without rendering.
- Keep facts atomic and self-contained per section so chunked retrieval still makes
  sense; avoid "see above"-style references.

## Never produce

The Artifact tool's content restrictions apply to local artifacts too: no pages
impersonating a real person or organization, no fabricated records presented as
genuine, no credential- or payment-harvesting flows, no content targeting a private
individual.
