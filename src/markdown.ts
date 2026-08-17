import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { InlineTokenPattern, ManualHeading, ManualModel, ManualNode, ManualRenderHook, SourcePage } from "./types.js";
import type { ManualMermaidConfig } from "./types.js";
import { expandEnvironment } from "./environment.js";
import { renderMermaidNodes } from "./mermaid.js";
import { applyRenderHooks } from "./hooks.js";
import { applyTableDirectives } from "./tables.js";
import { applyImageDirectives } from "./images.js";
import { applyContentsDirectives } from "./contents.js";

type AstNode = ManualNode & { position?: unknown };

export function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "section";
}

function textContent(node: ManualNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function splitWikilinks(value: string): ManualNode[] {
  const output: ManualNode[] = [];
  const expression = /(!)?\[\[([^\]]+)\]\]/gu;
  let cursor = 0;
  for (const match of value.matchAll(expression)) {
    const offset = match.index ?? 0;
    if (offset > cursor) output.push({ type: "text", value: value.slice(cursor, offset) });
    const [target, label] = match[2].split("|", 2);
    output.push({
      type: match[1] ? "wikiImage" : "wikiLink",
      value: label?.trim() || target.split("#", 1)[0].trim(),
      url: target.trim(),
      alt: label?.trim(),
    });
    cursor = offset + match[0].length;
  }
  if (cursor < value.length) output.push({ type: "text", value: value.slice(cursor) });
  return output.length ? output : [{ type: "text", value }];
}

function splitInlineTokens(nodes: ManualNode[], patterns: InlineTokenPattern[]): ManualNode[] {
  let current = nodes;
  for (const definition of patterns) {
    const flags = definition.flags?.includes("g") ? definition.flags : `${definition.flags ?? ""}g`;
    const expression = new RegExp(definition.pattern, flags);
    current = current.flatMap((node) => {
      if (!["text", "html"].includes(node.type) || node.value === undefined) return [node];
      if (node.type === "html" && /^<!--[\s\S]*-->$/u.test(node.value.trim())) return [node];
      if (node.type === "html" && /^<\/?(?:a|abbr|b|br|code|del|em|i|img|kbd|mark|small|span|strong|sub|sup|time)(?:\s[^>]*)?\s*\/?>$/iu.test(node.value)) return [node];
      const remainderType = node.type === "html" ? "text" : node.type;
      const output: ManualNode[] = [];
      let cursor = 0;
      for (const match of node.value.matchAll(expression)) {
        const offset = match.index ?? 0;
        if (offset > cursor) output.push({ type: remainderType, value: node.value.slice(cursor, offset) });
        output.push({ type: "inlineToken", value: match[definition.labelGroup ?? 1] ?? match[0], data: { kind: definition.kind } });
        cursor = offset + match[0].length;
        if (match[0].length === 0) throw new Error(`inline token pattern must not match an empty string: ${definition.pattern}`);
      }
      if (cursor < node.value.length) output.push({ type: remainderType, value: node.value.slice(cursor) });
      return output.length ? output : [node];
    });
  }
  return current;
}

const obsidianExtensions: Plugin<[InlineTokenPattern[]]> = (patterns = []) => {
  return (tree): void => {
    const manualTree = tree as unknown as AstNode;
    visit(manualTree as never, "text", (node: AstNode, index: number | undefined, parent: AstNode | undefined) => {
      if (!parent || index === undefined || !node.value?.includes("[[")) return;
      parent.children?.splice(index, 1, ...splitWikilinks(node.value));
    });
    visit(manualTree as never, "blockquote", (node: AstNode) => {
      const first = node.children?.[0];
      const firstText = first?.type === "paragraph" ? first.children?.[0] : undefined;
      if (firstText?.type !== "text" || !firstText.value) return;
      const match = /^\[!([a-z][a-z0-9_-]*)([+-])?\](?:[ \t]+(.*))?$/iu.exec(firstText.value.split("\n", 1)[0]);
      if (!match) return;
      const remainder = firstText.value.slice(match[0].length).replace(/^\n/u, "");
      node.type = "callout";
      node.calloutType = match[1].toLocaleLowerCase();
      node.calloutTitle = match[3]?.trim() || match[1][0].toLocaleUpperCase() + match[1].slice(1);
      node.collapsed = match[2] === "-" ? true : match[2] === "+" ? false : null;
      if (remainder) firstText.value = remainder;
      else first?.children?.shift();
      if (first?.children?.length === 0) node.children?.shift();
    });
    if (patterns.length) {
      visit(manualTree as never, (node: AstNode) => {
        if (!node.children || ["code", "inlineCode"].includes(node.type)) return;
        node.children = splitInlineTokens(node.children, patterns);
      });
    }
  };
};

export function parseMarkdown(markdown: string, patterns: InlineTokenPattern[] = []): ManualNode[] {
  const parser = unified().use(remarkParse).use(remarkGfm).use(obsidianExtensions, patterns);
  const tree = parser.runSync(parser.parse(markdown)) as unknown as AstNode;
  return tree.children ?? [];
}

async function markdownFiles(root: string, chapterIndexNames: string[]): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const name of await readdir(directory)) {
      if (name.startsWith(".")) continue;
      const candidate = path.join(directory, name);
      const details = await stat(candidate);
      if (details.isDirectory()) await walk(candidate);
      else if (/\.(?:md|markdown)$/iu.test(name)) result.push(candidate);
    }
  }
  await walk(root);
  return result.sort((left, right) => manualOrder(root, left, chapterIndexNames).localeCompare(manualOrder(root, right, chapterIndexNames), "en", { numeric: true }));
}

function manualOrder(root: string, file: string, chapterIndexNames: string[]): string {
  const parts = path.relative(root, file).split(path.sep);
  if (chapterIndexNames.some((name) => name.toLocaleLowerCase() === (parts.at(-1) ?? "").toLocaleLowerCase())) parts[parts.length - 1] = "!index";
  return parts.join("/");
}

function headingData(nodes: ManualNode[], pageId: string, pageDepth: number, maxDepth: number): ManualHeading[] {
  const counts = new Map<string, number>();
  return nodes.filter((node) => node.type === "heading").map((node) => {
    const title = textContent(node);
    const sourceDepth = node.depth ?? 1;
    const depth = Math.min(maxDepth, pageDepth + sourceDepth - 1);
    node.data = { ...node.data, effectiveDepth: depth };
    const base = sourceDepth === 1 ? pageId : `${pageId}-${slug(title)}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return { depth, sourceDepth, title, id: count === 1 ? base : `${base}-${count}`, excludeFromContents: node.data?.excludeFromContents === true };
  });
}

function normalizeRelative(value: string): string {
  return value.split(path.sep).join("/");
}

export async function loadManual(sourceRoot: string, options: { chapterIndexNames?: string[]; inlineTokens?: InlineTokenPattern[]; environment?: NodeJS.ProcessEnv; allowedEnvironmentVariables?: Iterable<string>; mermaid?: ManualMermaidConfig; hooks?: ManualRenderHook[]; hierarchyHeadings?: boolean; maxHeadingDepth?: number } = {}): Promise<ManualModel> {
  const root = path.resolve(sourceRoot);
  const chapterIndexNames = options.chapterIndexNames ?? ["index.md", "index.markdown"];
  const pages: SourcePage[] = [];
  for (const absolutePath of await markdownFiles(root, chapterIndexNames)) {
    const relativePath = normalizeRelative(path.relative(root, absolutePath));
    let source: string;
    try {
      source = expandEnvironment(await readFile(absolutePath, "utf8"), options.environment, options.allowedEnvironmentVariables);
    } catch (error) {
      throw new Error(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let nodes = applyContentsDirectives(applyImageDirectives(applyTableDirectives(parseMarkdown(source, options.inlineTokens), relativePath), relativePath), relativePath);
    if (options.hooks?.length) nodes = applyRenderHooks(nodes, options.hooks, { relativePath });
    const h1 = nodes.filter((node) => node.type === "heading" && node.depth === 1);
    if (h1.length !== 1) throw new Error(`${relativePath} must contain exactly one first-level heading`);
    const id = `page-${slug(relativePath)}`;
    const isChapter = chapterIndexNames.some((name) => name.toLocaleLowerCase() === path.basename(relativePath).toLocaleLowerCase()) || !relativePath.includes("/");
    const directoryDepth = relativePath.split("/").length - 1;
    const hierarchyDepth = options.hierarchyHeadings ? Math.max(1, directoryDepth + (isChapter ? 0 : 1)) : 1;
    const headings = headingData(nodes, id, hierarchyDepth, options.maxHeadingDepth ?? 6);
    pages.push({
      absolutePath,
      relativePath,
      title: textContent(h1[0]),
      id,
      isChapter,
      hierarchyDepth,
      chapterTitle: "",
      nodes,
      headings,
    });
  }
  if (pages.length === 0) throw new Error(`no Markdown files found below ${root}`);
  for (const page of pages) {
    const ancestors = pages.filter((candidate) => candidate.isChapter && page.relativePath.startsWith(path.posix.dirname(candidate.relativePath).replace(/^\.$/u, "") + "/"));
    page.chapterTitle = ancestors.sort((left, right) => right.hierarchyDepth - left.hierarchyDepth)[0]?.title ?? page.title;
  }
  if (options.mermaid) await renderMermaidNodes(pages.flatMap((page) => page.nodes), options.mermaid);
  const pageByRelativePath = new Map(pages.map((page) => [page.relativePath, page]));
  const pageByStem = new Map<string, SourcePage[]>();
  for (const page of pages) {
    for (const key of [page.relativePath.replace(/\.(?:md|markdown)$/iu, ""), path.basename(page.relativePath).replace(/\.(?:md|markdown)$/iu, ""), page.title]) {
      const normalized = key.toLocaleLowerCase();
      pageByStem.set(normalized, [...(pageByStem.get(normalized) ?? []), page]);
    }
  }
  const model = { sourceRoot: root, pages, pageByRelativePath, pageByStem };
  await validateManual(model);
  return model;
}

function localTarget(value: string): string {
  return decodeURIComponent(value.split("#", 1)[0]);
}

async function validateManual(model: ManualModel): Promise<void> {
  for (const page of model.pages) {
    const directory = path.dirname(page.absolutePath);
    visit({ type: "root", children: page.nodes } as never, (node: AstNode) => {
      if (!node.url || !["link", "image"].includes(node.type)) return;
      if (/^(?:https?:|mailto:|data:|#)/iu.test(node.url)) return;
      const target = path.resolve(directory, localTarget(node.url));
      if (node.type === "image" && !target.startsWith(`${model.sourceRoot}${path.sep}`) && target !== model.sourceRoot) {
        throw new Error(`${page.relativePath}: local image escapes the Markdown root: ${node.url}`);
      }
    });
  }
  const checks: Promise<void>[] = [];
  for (const page of model.pages) {
    visit({ type: "root", children: page.nodes } as never, (node: AstNode) => {
      if (!node.url || !["link", "image"].includes(node.type) || /^(?:https?:|mailto:|data:|#)/iu.test(node.url)) return;
      const target = path.resolve(path.dirname(page.absolutePath), localTarget(node.url));
      checks.push(stat(target).then(() => undefined, () => { throw new Error(`${page.relativePath}: missing local target ${node.url}`); }));
    });
  }
  await Promise.all(checks);
}

export function resolvePageLink(model: ManualModel, page: SourcePage, raw: string): string | undefined {
  const [clean, fragment] = raw.split("#", 2);
  let target: SourcePage | undefined;
  if (!clean) target = page;
  else if (/\.(?:md|markdown)$/iu.test(clean)) {
    const relative = normalizeRelative(path.relative(model.sourceRoot, path.resolve(path.dirname(page.absolutePath), decodeURIComponent(clean))));
    target = model.pageByRelativePath.get(relative);
  } else {
    const matches = model.pageByStem.get(clean.toLocaleLowerCase()) ?? [];
    if (matches.length === 1) target = matches[0];
  }
  if (!target) return undefined;
  return fragment ? `${target.id}-${slug(fragment)}` : target.id;
}
