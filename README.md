# Markdown Manual Renderer

`@tobisk/markdown-manuals` turns a numbered folder of CommonMark, GFM, and
Obsidian-flavored Markdown into two outputs from one parsed document model:

- a searchable, responsive, self-contained offline HTML manual and deterministic ZIP; and
- a paginated PDF produced with React-PDF, including metadata, bookmarks, internal links,
  running headers, footers, and page numbers.

It supports headings, paragraphs, emphasis, code, links, local images, tables, nested lists,
task lists, blockquotes, Obsidian callouts, `[[wikilinks]]`, environment placeholders, and
build-time Mermaid diagrams. Raw Markdown HTML is not executed.

> [!IMPORTANT]
> This project was vibe coded to solve a particular documentation problem in ToskLight. It was
> built through rapid, AI-assisted iteration against that manual rather than designed from a
> complete general-purpose publishing specification. The repository includes automated and visual
> checks, but adopters should review generated documents carefully and expect to adapt hooks and
> configuration for their own publishing requirements.

## Try the example

The repository contains a complete small manual under [`examples/basic`](examples/basic). After
installing dependencies, render it with:

```sh
npm run example
```

This writes offline HTML, a ZIP, and an A4 PDF under `examples/basic/output/`. The example covers
folder-derived heading levels, Obsidian callouts, environment placeholders, Mermaid, tables, and a
custom render hook.

## CLI

```sh
npx --package @tobisk/markdown-manuals markdown-manual build \
  --source docs/help \
  --config docs/help/manual.json \
  --allowed-env-vars LIGHT_MANUAL_VERSION \
  --html-dir .artifacts/manual/html \
  --html-archive .artifacts/manual/manual-html.zip \
  --pdf .artifacts/manual/manual.pdf
```

The three output flags are optional overrides. Paths in the JSON config are resolved relative to
the config file; CLI paths are resolved relative to the current working directory.

## Configuration

```json
{
  "title": "ToskLight Operator Manual",
  "subtitle": "Control, Architect, and Pixel",
  "author": "ToskLight contributors",
  "language": "en",
  "version": "${LIGHT_MANUAL_VERSION}",
  "description": "ToskLight operator documentation",
  "brand": { "logo": "../../assets/brand/icon.png" },
  "chapterIndexNames": ["index.md", "index.markdown"],
  "output": {
    "htmlDir": "../../.artifacts/generated/manual/html/tosklight-manual",
    "htmlArchive": "../../.artifacts/generated/manual/html/tosklight-manual-html.zip",
    "pdf": "../../.artifacts/generated/manual/pdf/tosklight-manual.pdf"
  },
  "theme": {
    "accent": "#0f8f82",
    "navigationBackground": "#071621",
    "calloutDanger": "#b42318",
    "callouts": { "warning": "#b7791f", "tip": "#16803c" }
  },
  "pdf": {
    "pageSize": "A4",
    "contentsDepth": 3,
    "header": "{title} - {chapter}",
    "footer": "ToskLight Operator Manual",
    "margins": { "top": 54, "right": 50, "bottom": 54, "left": 50 }
  },
  "mermaid": {
    "theme": "base",
    "backgroundColor": "transparent",
    "width": 1400,
    "height": 900,
    "scale": 2,
    "themeVariables": {
      "primaryColor": "#d7f3ef",
      "primaryBorderColor": "#0f8f82",
      "lineColor": "#425466",
      "edgeLabelBackground": "#ffffff"
    }
  },
  "inlineTokens": [
    { "pattern": "\\[([A-Z0-9.]+)\\]", "kind": "desk-key", "labelGroup": 1 }
  ],
  "hookModules": ["manual-hooks.mjs"],
  "layout": {
    "columns": 1,
    "columnGap": 18,
    "hierarchyHeadings": true,
    "maxHeadingDepth": 6,
    "justifyText": true
  }
}
```

`${NAME}` placeholders in both the JSON configuration and Markdown sources are read from the
environment only when `NAME` is listed by `--allowed-env-vars`. The option accepts a comma-separated
allowlist such as `--allowed-env-vars APP_VERSION,BUILD_NUMBER`. Unlisted placeholders remain
literal even when the process has a matching environment variable, preventing Markdown from
accidentally exposing CI secrets or other ambient values. An allowed but unset variable fails the
build. Write `\${NAME}` when the literal placeholder syntax should be printed. Inline-token patterns
are JavaScript regular-expression sources and must not match an empty string.

`layout.columns` accepts `1` or `2`. In two-column mode, major headings, tables, figures, code,
and callouts span both columns. With `hierarchyHeadings` enabled, a folder index keeps the folder's
heading level, an ordinary file is one level deeper, and nested folders deepen the hierarchy even
when they have no index. `maxHeadingDepth` caps the effective level.

Every top-level folder index becomes a dedicated section-divider page in PDF and a full-height
divider in HTML. If a standalone image is immediately before or after that index's H1, the image
stays with the centered title. With hierarchical headings enabled, effective H2 headings are
rendered as labelled chapters, H3 headings as ruled sections, H4 headings in the accent color, and
H5 headings as compact subheads.

## Render hooks

Hook modules are resolved relative to the configuration file. They export one hook, an array of
hooks, or a default export. A hook can replace any normalized Markdown node before both HTML and
PDF rendering:

```js
export default {
  name: "control-keys",
  transform(node, context) {
    if (node.type !== "inlineToken" || node.data?.kind !== "desk-key") return;
    return {
      ...node,
      data: {
        ...node.data,
        presentation: {
          component: "key-sequence",
          keys: [{ label: node.value, variant: node.value === "REC" ? "record" : "regular" }],
        },
      },
    };
  },
};
```

The built-in `key-sequence` presentation supports `regular`, `record`, `clear`, `preload`,
`keyboard`, and `shift` variants. A key with `icon: "shift"` receives the Shift symbol. Table hooks
may set `data.columnWidths` to relative weights; PDF-oriented hooks may additionally set
`data.rowsPerPage` and `data.rowWeight` for unusually dense or verbose tables.

## Mermaid diagrams

Use an ordinary fenced Mermaid block:

````md
```mermaid
flowchart LR
  Control[ToskLight Control] -->|Art-Net or sACN| Architect[ToskLight Architect]
  Control -->|DMX and CITP/MSEX| Pixel[ToskLight Pixel]
```
````

The build uses Mermaid's official renderer once and embeds its scalable SVG in HTML and a
high-resolution PNG in the React-PDF document. Invalid diagrams fail with the diagram number and
Mermaid's parsing error. The `mermaid` configuration controls the Mermaid theme, theme variables,
background, viewport, and scale. Puppeteer supplies the isolated build-time browser; the generated
HTML does not need Mermaid JavaScript or a network connection.

## Obsidian syntax

```md
> [!danger] Graphic missing
> Add the missing workflow diagram here.

See [[Patching|the patching chapter]].
```

Callout types are case-insensitive. `[!note]+` and `[!note]-` fold markers are retained in the
shared model; static HTML and PDF intentionally render their content expanded. A wikilink resolves
by unique page title, basename, or root-relative Markdown path. `![[image.png|Caption]]` embeds a
local image.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run example
```

The package targets Node.js 22 or newer. It does not fetch remote images, execute raw Markdown
HTML, or allow local Markdown assets to escape the supplied source root.

## Releases

Forgejo is authoritative for `main`, release commits, and `vX.Y.Z` tags. Its configured mirror
delivers those commits and tags to GitHub. Forgejo CI runs semantic-release after typecheck, tests,
build, and package inspection; it updates `package.json`, `package-lock.json`, and `CHANGELOG.md`,
then creates the release commit and tag. GitHub Actions rebuilds a mirrored tag, publishes
`@tobisk/markdown-manuals` through npm trusted publishing, and creates the GitHub Release.
No npm token is stored in the repository.

Conventional Commits control releases: `fix:` and `perf:` create a patch, `feat:` creates a minor,
and `!` or a `BREAKING CHANGE:` footer creates a major. Documentation, tests, refactors, build, CI,
and chores do not release by default. Preview the next release locally with
`npm run release:dry-run`; it requires access to full repository history and the Forgejo remote but
does not publish in dry-run mode. The remote is private, so the local Git credentials must be able
to read it.

Publishing requires two repository-side settings:

- Forgejo secret `SEMANTIC_RELEASE_TOKEN`, scoped to push the release commit and tags.
- An npm trusted publisher for package `@tobisk/markdown-manuals`, GitHub repository
  `kellertobias/markdown-docgen`, workflow `release.yml`.
