import type { ManualNode } from "./types.js";

function normalizedWidth(value: string): string {
  const match = /^(\d+(?:\.\d+)?)(%|px|pt)$/u.exec(value.trim());
  if (!match || Number(match[1]) <= 0) throw new Error("image directive width must be a positive %, px, or pt value");
  if (match[2] === "%" && Number(match[1]) > 100) throw new Error("image directive percentage width cannot exceed 100%");
  return `${Number(match[1])}${match[2]}`;
}

function imageDirective(value: string): Record<string, unknown> | undefined {
  const match = /^<!--\s*image\s*:\s*([\s\S]*?)\s*-->$/iu.exec(value.trim());
  if (!match) return undefined;
  const data: Record<string, unknown> = {};
  for (const rawPart of match[1].split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [rawName, rawValue] = part.split("=", 2);
    const name = rawName.trim().toLocaleLowerCase();
    if (name !== "width") throw new Error(`unknown image directive option: ${rawName.trim()}`);
    if (!rawValue?.trim()) throw new Error("image directive width requires a value");
    data.displayWidth = normalizedWidth(rawValue);
  }
  return data;
}

function standaloneImage(node: ManualNode | undefined): ManualNode | undefined {
  if (!node) return undefined;
  if (["image", "wikiImage"].includes(node.type)) return node;
  if (node.type !== "paragraph") return undefined;
  const meaningful = (node.children ?? []).filter((child) => child.type !== "text" || child.value?.trim());
  return meaningful.length === 1 && ["image", "wikiImage"].includes(meaningful[0].type) ? meaningful[0] : undefined;
}

function attachImageData(node: ManualNode, image: ManualNode, data: Record<string, unknown>): ManualNode {
  if (node === image) return { ...image, data: { ...image.data, ...data } };
  return {
    ...node,
    children: node.children?.map((child) => child === image ? { ...child, data: { ...child.data, ...data } } : child),
  };
}

export function applyImageDirectives(nodes: ManualNode[], source = "Markdown"): ManualNode[] {
  const output: ManualNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const directive = node.type === "html" && node.value ? imageDirective(node.value) : undefined;
    if (!directive) {
      output.push(node.children ? { ...node, children: applyImageDirectives(node.children, source) } : node);
      continue;
    }
    const next = nodes[index + 1];
    const image = standaloneImage(next);
    if (!next || !image) throw new Error(`${source}: image directive must be directly before a standalone image`);
    output.push(attachImageData(next, image, directive));
    index += 1;
  }
  return output;
}

export function imageDisplayWidth(node: ManualNode): string | undefined {
  return typeof node.data?.displayWidth === "string" ? node.data.displayWidth : undefined;
}

export function imageWidthFraction(node: ManualNode): number {
  const width = imageDisplayWidth(node);
  if (!width) return 1;
  const value = Number.parseFloat(width);
  if (width.endsWith("%")) return Math.min(1, value / 100);
  const points = width.endsWith("px") ? value * 0.75 : value;
  return Math.min(1, points / 495);
}
