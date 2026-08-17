import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadManual, parseMarkdown } from "../src/markdown.js";
import { expandEnvironment, parseAllowedEnvironmentVariables } from "../src/environment.js";
import { calloutAppearance, OBSIDIAN_CALLOUT_TYPES } from "../src/callouts.js";

describe("Obsidian Markdown extensions", () => {
  it("expands only explicitly allowed environment placeholders", () => {
    expect(expandEnvironment("Version ${APP_VERSION}; secret ${SECRET_VALUE}; literal \\${APP_VERSION}", { APP_VERSION: "4.2.0", SECRET_VALUE: "must-not-leak" }, ["APP_VERSION"]))
      .toBe("Version 4.2.0; secret ${SECRET_VALUE}; literal ${APP_VERSION}");
    expect(() => expandEnvironment("Version ${MISSING_VERSION}", {}, ["MISSING_VERSION"])).toThrow("environment variable MISSING_VERSION is required");
    expect(expandEnvironment("Version ${APP_VERSION}", { APP_VERSION: "4.2.0" })).toBe("Version ${APP_VERSION}");
  });

  it("parses and validates comma-separated allowed environment names", () => {
    expect(parseAllowedEnvironmentVariables("APP_VERSION, BUILD_NUMBER,APP_VERSION")).toEqual(["APP_VERSION", "BUILD_NUMBER"]);
    expect(parseAllowedEnvironmentVariables(undefined)).toEqual([]);
    expect(() => parseAllowedEnvironmentVariables("APP_VERSION,lowercase")).toThrow("invalid allowed environment variable name: lowercase");
  });

  it("normalizes callouts and wikilinks in the shared AST", () => {
    const nodes = parseMarkdown(`> [!danger] Graphic missing
> Add a diagram that links to [[Workflow|the workflow]].

![[diagram.png|System diagram]]`);
    expect(nodes[0]).toMatchObject({
      type: "callout",
      calloutType: "danger",
      calloutTitle: "Graphic missing",
    });
    expect(JSON.stringify(nodes)).toContain('"type":"wikiLink"');
    expect(JSON.stringify(nodes)).toContain('"type":"wikiImage"');
  });

  it("supports every standard Obsidian callout type and semantic alias", () => {
    const source = OBSIDIAN_CALLOUT_TYPES.map((kind) => `> [!${kind}] ${kind}\n> Body`).join("\n\n");
    const nodes = parseMarkdown(source);
    expect(nodes.map((node) => node.calloutType)).toEqual([...OBSIDIAN_CALLOUT_TYPES]);
    expect(calloutAppearance("caution")).toMatchObject({ canonical: "warning", background: "#fff3c4" });
    expect(calloutAppearance("error")).toMatchObject({ canonical: "danger", background: "#ffe6e3" });
    expect(calloutAppearance("done")).toMatchObject({ canonical: "success", background: "#e9f7ed" });
  });

  it("turns configured text and command-code patterns into inline tokens", () => {
    const nodes = parseMarkdown("Press [GO], `[STOP]`, then <target>.<br>Continue.", [
      { pattern: "\\[([A-Z]+)\\]", kind: "key" },
      { pattern: "<([a-z]+)>", kind: "placeholder" },
    ]);
    expect(JSON.stringify(nodes)).toContain('"type":"inlineToken","value":"GO"');
    expect(JSON.stringify(nodes)).toContain('"type":"inlineToken","value":"STOP"');
    expect(JSON.stringify(nodes)).toContain('"type":"inlineToken","value":"target"');
    expect(JSON.stringify(nodes)).toContain('"type":"html","value":"<br>"');
    expect(JSON.stringify(nodes)).not.toContain('"type":"inlineToken","value":"br"');
  });

  it("derives effective heading depth from folders and index pages", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "manual-hierarchy-"));
    await mkdir(path.join(root, "01-Desk", "01-Patching"), { recursive: true });
    await writeFile(path.join(root, "01-Desk", "index.md"), "# Desk\n");
    await writeFile(path.join(root, "01-Desk", "commands.md"), "# Commands\n\n## Syntax\n");
    await writeFile(path.join(root, "01-Desk", "01-Patching", "index.md"), "# Patching\n");
    await writeFile(path.join(root, "01-Desk", "01-Patching", "fixtures.md"), "# Fixtures\n");
    const model = await loadManual(root, { hierarchyHeadings: true });
    expect(model.pages.map((page) => [page.title, page.headings.map((heading) => heading.depth)])).toEqual([
      ["Desk", [1]],
      ["Patching", [2]],
      ["Fixtures", [3]],
      ["Commands", [2, 3]],
    ]);
  });
});
