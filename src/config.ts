import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ManualConfig, ResolvedConfig } from "./types.js";
import { expandEnvironment } from "./environment.js";

const DEFAULT_THEME = {
  accent: "#0f8f82",
  accentContrast: "#ffffff",
  background: "#f7f6f1",
  calloutDanger: "#b42318",
  calloutInfo: "#087f8c",
  codeBackground: "#071621",
  ink: "#17202a",
  muted: "#64748b",
  navigationBackground: "#071621",
  navigationInk: "#ffffff",
  callouts: {},
};

function absolute(base: string, value: string | undefined): string | undefined {
  return value ? path.resolve(base, value) : undefined;
}

export async function loadConfig(configPath: string, options: { environment?: NodeJS.ProcessEnv; allowedEnvironmentVariables?: Iterable<string> } = {}): Promise<ResolvedConfig> {
  const absoluteConfig = path.resolve(configPath);
  const directory = path.dirname(absoluteConfig);
  const raw = await readFile(absoluteConfig, "utf8");
  const expanded = expandEnvironment(raw, options.environment, options.allowedEnvironmentVariables);
  const parsed = JSON.parse(expanded) as ManualConfig;
  if (!parsed.title?.trim()) throw new Error("manual config must define a title");
  if (!parsed.output?.htmlDir || !parsed.output.pdf) {
    throw new Error("manual config must define output.htmlDir and output.pdf");
  }
  const depth = parsed.pdf?.contentsDepth ?? 3;
  if (!Number.isInteger(depth) || depth < 1 || depth > 6) {
    throw new Error("pdf.contentsDepth must be an integer from 1 to 6");
  }
  return {
    ...parsed,
    configDirectory: directory,
    logo: absolute(directory, parsed.brand?.logo ?? parsed.logo),
    output: {
      htmlDir: path.resolve(directory, parsed.output.htmlDir),
      htmlArchive: absolute(directory, parsed.output.htmlArchive),
      pdf: path.resolve(directory, parsed.output.pdf),
    },
    theme: { ...DEFAULT_THEME, ...parsed.theme, callouts: { ...DEFAULT_THEME.callouts, ...parsed.theme?.callouts } },
    pdf: {
      pageSize: parsed.pdf?.pageSize ?? "A4",
      footer: parsed.pdf?.footer ?? parsed.title,
      contentsDepth: depth,
      header: parsed.pdf?.header ?? parsed.title,
      margins: {
        top: parsed.pdf?.margins?.top ?? 54,
        right: parsed.pdf?.margins?.right ?? 50,
        bottom: parsed.pdf?.margins?.bottom ?? 54,
        left: parsed.pdf?.margins?.left ?? 50,
      },
    },
    mermaid: {
      theme: parsed.mermaid?.theme ?? "base",
      backgroundColor: parsed.mermaid?.backgroundColor ?? "transparent",
      width: parsed.mermaid?.width ?? 1400,
      height: parsed.mermaid?.height ?? 900,
      scale: parsed.mermaid?.scale ?? 2,
      themeVariables: parsed.mermaid?.themeVariables,
      config: parsed.mermaid?.config,
      browserArgs: parsed.mermaid?.browserArgs,
    },
    hookModules: (parsed.hookModules ?? []).map((entry) => path.resolve(directory, entry)),
    layout: {
      columns: parsed.layout?.columns ?? 1,
      columnGap: parsed.layout?.columnGap ?? 18,
      hierarchyHeadings: parsed.layout?.hierarchyHeadings ?? false,
      maxHeadingDepth: parsed.layout?.maxHeadingDepth ?? 6,
      justifyText: parsed.layout?.justifyText ?? true,
    },
  };
}
