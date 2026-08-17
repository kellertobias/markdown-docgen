import { renderMermaid } from "@mermaid-js/mermaid-cli";
import puppeteer from "puppeteer";
import type { MermaidConfig } from "mermaid";
import type { ManualMermaidConfig, ManualNode } from "./types.js";

function diagrams(nodes: ManualNode[]): ManualNode[] {
  const result: ManualNode[] = [];
  const visit = (node: ManualNode): void => {
    if (node.type === "code" && node.lang?.trim().toLocaleLowerCase() === "mermaid") result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return result;
}

export async function renderMermaidNodes(nodes: ManualNode[], options: ManualMermaidConfig): Promise<void> {
  const targets = diagrams(nodes);
  if (!targets.length) return;
  const browserArgs = options.browserArgs ?? (process.env.CI ? ["--no-sandbox", "--disable-setuid-sandbox"] : []);
  const browser = await puppeteer.launch({ headless: true, args: browserArgs });
  try {
    for (const [index, node] of targets.entries()) {
      const source = node.value ?? "";
      const svgId = `markdown-manual-mermaid-${index + 1}`;
      const mermaidConfig: MermaidConfig = {
        theme: options.theme,
        themeVariables: options.themeVariables,
        ...options.config,
        securityLevel: "strict",
      };
      let svg;
      let png;
      try {
        [svg, png] = await Promise.all([
          renderMermaid(browser, source, "svg", {
            backgroundColor: options.backgroundColor,
            mermaidConfig,
            svgId,
            viewport: { width: options.width, height: options.height, deviceScaleFactor: options.scale },
          }),
          renderMermaid(browser, source, "png", {
            backgroundColor: options.backgroundColor,
            mermaidConfig,
            svgId: `${svgId}-png`,
            viewport: { width: options.width, height: options.height, deviceScaleFactor: options.scale },
          }),
        ]);
      } catch (error) {
        throw new Error(`Mermaid diagram ${index + 1} could not be rendered: ${error instanceof Error ? error.message : String(error)}`);
      }
      node.type = "mermaid";
      node.alt = svg.desc ?? svg.title ?? undefined;
      node.data = {
        ...node.data,
        mermaidSvg: new TextDecoder().decode(svg.data),
        mermaidPng: Buffer.from(png.data).toString("base64"),
      };
    }
  } finally {
    await browser.close();
  }
}
