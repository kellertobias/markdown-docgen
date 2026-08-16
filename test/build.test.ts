import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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

Press [REC].

\`\`\`mermaid
flowchart LR
  Desk[Control] --> Output[DMX Output]
\`\`\`

> [!danger] Graphic missing
> Add the drawing.
`);
    await writeFile(path.join(source, "01-Chapter", "index.md"), `# Operations

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
    const config = await loadConfig(configPath);
    const hooks = await loadRenderHooks(config.hookModules);
    const model = await loadManual(source, {
      environment: { ...process.env, SOFTWARE_VERSION: "9.8.7" },
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
    expect(html).toContain('class="callout callout-danger"');
    expect(html).not.toContain("[!danger]");
    expect(html).toContain('href="#page-01-chapter-index-md"');
    expect(html).toContain("Software version: 9.8.7");
    expect(html).toContain('class="mermaid-diagram"');
    expect(html).toContain('manual-page-content columns-2');
    expect(html).toContain('manual-key-record');
    expect(html).toContain("<svg");
    expect(html).not.toContain("flowchart LR");
    expect((await stat(config.output.pdf)).size).toBeGreaterThan(1_000);
    expect((await readFile(config.output.pdf)).subarray(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(await readFile(config.output.pdf));
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(595.28, 1);
      expect(height).toBeCloseTo(841.89, 1);
    }
  }, 30_000);
});
