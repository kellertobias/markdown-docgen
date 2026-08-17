import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { loadConfig } from "../src/config.js";
import { renderHtml } from "../src/html.js";
import { loadRenderHooks } from "../src/hooks.js";
import { loadManual } from "../src/markdown.js";
import { renderPdf } from "../src/pdf.js";

describe("manual build", () => {
  it("writes offline HTML, a deterministic ZIP and a React-PDF document", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markdown-manual-"));
    const source = path.join(root, "manual");
    await mkdir(path.join(source, "01-Chapter"), { recursive: true });
    await writeFile(path.join(source, "index.md"), `# Start

Read [[01-Chapter/index|Operations]].

Software version: \${SOFTWARE_VERSION}.

Unlisted secret: \${SECRET_VALUE}.

Press [REC].

\`\`\`mermaid
flowchart LR
  Desk[Control] --> Output[DMX Output]
\`\`\`

> [!danger] Graphic missing
> Add the drawing.

> [!warning] Check this
> A yellow warning.

Soft source
line.

Hard source${"  "}
line.

![Operator screenshot](screenshot.png)
`);
    await writeFile(path.join(source, "screenshot.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMTdUMDA6NTU6NDIrMDA6MDCJOGoUAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTE3VDAwOjU1OjQyKzAwOjAw+GXSqAAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0xN1QwMDo1NTo0MiswMDowMK9w83cAAAAhSURBVDjLY+Tvb2KgJWCiqemjFoxaMGrBqAWjFoxaAAUAK5sBRBWab+AAAAAASUVORK5CYII=", "base64"));
    await writeFile(path.join(source, "01-Chapter", "index.md"), `# Operations

## Prepare

| Control | Result |
| --- | --- |
| Go | Starts |

1. Select
2. Run

\`\`\`text
example
\`\`\`
`);
    await writeFile(path.join(root, "manual-hooks.mjs"), `export default {
  name: "test-keys",
  transform(node) {
    if (node.type === "inlineToken") return { ...node, data: { ...node.data, presentation: { component: "key-sequence", keys: [{ label: node.value, variant: "record" }] } } };
  },
};\n`);
    const configPath = path.join(root, "manual.json");
    await writeFile(configPath, JSON.stringify({
      title: "Test Manual",
      version: "${MANUAL_TEST_VERSION}",
      output: { htmlDir: "out/html", htmlArchive: "out/manual.zip", pdf: "out/manual.pdf" },
      hookModules: ["manual-hooks.mjs"],
      inlineTokens: [{ pattern: "\\[([A-Z]+)\\]", kind: "desk-key" }],
      layout: { hierarchyHeadings: true, columns: 2 },
      pdf: { header: "{title} - {chapter}" },
    }));
    process.env.MANUAL_TEST_VERSION = "1.2.3";
    const config = await loadConfig(configPath, { environment: process.env, allowedEnvironmentVariables: ["MANUAL_TEST_VERSION"] });
    const hooks = await loadRenderHooks(config.hookModules);
    const model = await loadManual(source, {
      environment: { ...process.env, SOFTWARE_VERSION: "9.8.7" },
      allowedEnvironmentVariables: ["SOFTWARE_VERSION"],
      mermaid: config.mermaid,
      hooks,
      inlineTokens: config.inlineTokens,
      hierarchyHeadings: config.layout.hierarchyHeadings,
      maxHeadingDepth: config.layout.maxHeadingDepth,
    });
    await renderHtml(model, config);
    const firstZip = await readFile(config.output.htmlArchive!);
    await renderHtml(model, config);
    expect(await readFile(config.output.htmlArchive!)).toEqual(firstZip);
    await renderPdf(model, config);
    const html = await readFile(path.join(config.output.htmlDir, "index.html"), "utf8");
    expect(html).toContain('class="callout callout-danger callout-type-danger"');
    expect(html).toContain('class="callout callout-warning callout-type-warning"');
    expect(html).toContain("--callout-background:#fff3c4");
    expect(html).not.toContain("[!danger]");
    expect(html).toContain("Soft source line.");
    expect(html).toContain("Hard source<br>line.");
    expect(html).toContain('href="#page-01-chapter-index-md"');
    expect(html).toContain("Software version: 9.8.7");
    expect(html).toContain("Unlisted secret: ${SECRET_VALUE}");
    expect(html).toContain('class="mermaid-diagram"');
    expect(html).toContain('manual-page-content columns-2');
    expect(html).toContain('class="manual-section-divider"');
    expect(html).toContain('<h2 id="page-01-chapter-index-md-prepare">Prepare</h2>');
    expect(html).toContain('manual-key-record');
    expect(html).toContain("<svg");
    expect(html).not.toContain("flowchart LR");
    expect((await stat(config.output.pdf)).size).toBeGreaterThan(1_000);
    expect((await readFile(config.output.pdf)).subarray(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(await readFile(config.output.pdf));
    const embeddedScreenshots = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream
      && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"
      && object.dict.get(PDFName.of("Width"))?.toString() === "32"
      && object.dict.get(PDFName.of("Height"))?.toString() === "18");
    expect(embeddedScreenshots.length).toBeGreaterThan(0);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(595.28, 1);
      expect(height).toBeCloseTo(841.89, 1);
    }
  }, 30_000);
});
