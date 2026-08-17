#!/usr/bin/env node
import path from "node:path";
import { loadConfig } from "./config.js";
import { renderHtml } from "./html.js";
import { loadManual } from "./markdown.js";
import { renderPdf } from "./pdf.js";
import { loadRenderHooks } from "./hooks.js";
import { parseAllowedEnvironmentVariables } from "./environment.js";

interface Arguments {
  command?: string;
  source?: string;
  config?: string;
  htmlDir?: string;
  htmlArchive?: string;
  pdf?: string;
  allowedEnvVars?: string;
}

function usage(): string {
  return `Usage:
  markdown-manual build --source <dir> --config <json> [--allowed-env-vars <NAME,...>] [--html-dir <dir>] [--html-archive <zip>] [--pdf <file>]

The JSON config supplies branding, theme and default output paths. Command-line output paths
override the config and are resolved from the current working directory. Only environment variables
listed by --allowed-env-vars are substituted in the config and Markdown sources.`;
}

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${option}`);
    if (option === "--source") result.source = value;
    else if (option === "--config") result.config = value;
    else if (option === "--html-dir") result.htmlDir = value;
    else if (option === "--html-archive") result.htmlArchive = value;
    else if (option === "--pdf") result.pdf = value;
    else if (option === "--allowed-env-vars") result.allowedEnvVars = value;
    else throw new Error(`unknown option: ${option}`);
    index += 1;
  }
  return result;
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const args = parseArguments(argv);
  if (args.command !== "build" || !args.source || !args.config) throw new Error(usage());
  const allowedEnvironmentVariables = parseAllowedEnvironmentVariables(args.allowedEnvVars);
  const config = await loadConfig(args.config, { allowedEnvironmentVariables });
  const hooks = await loadRenderHooks(config.hookModules);
  if (args.htmlDir) config.output.htmlDir = path.resolve(args.htmlDir);
  if (args.htmlArchive) config.output.htmlArchive = path.resolve(args.htmlArchive);
  if (args.pdf) config.output.pdf = path.resolve(args.pdf);
  const model = await loadManual(args.source, {
    chapterIndexNames: config.chapterIndexNames,
    inlineTokens: config.inlineTokens,
    mermaid: config.mermaid,
    hooks,
    hierarchyHeadings: config.layout.hierarchyHeadings,
    maxHeadingDepth: config.layout.maxHeadingDepth,
    allowedEnvironmentVariables,
  });
  await renderHtml(model, config);
  await renderPdf(model, config);
  process.stdout.write(`Rendered ${model.pages.length} Markdown pages\nHTML: ${config.output.htmlDir}\nPDF: ${config.output.pdf}\n`);
}

run().catch((error: unknown) => {
  process.stderr.write(`markdown-manual failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
