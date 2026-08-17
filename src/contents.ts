import type { ManualNode } from "./types.js";

function directive(value: string): "exclude" | "exclude-headings" | undefined {
  const match = /^<!--\s*toc\s*:\s*(exclude|exclude-headings)\s*-->$/iu.exec(value.trim());
  return match?.[1].toLocaleLowerCase() as "exclude" | "exclude-headings" | undefined;
}

export function applyContentsDirectives(nodes: ManualNode[], source = "Markdown"): ManualNode[] {
  const excludeHeadings = nodes.some((node) => node.type === "html" && node.value && directive(node.value) === "exclude-headings");
  const output: ManualNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const action = node.type === "html" && node.value ? directive(node.value) : undefined;
    if (action === "exclude-headings") continue;
    if (action === "exclude") {
      const next = nodes[index + 1];
      if (!next || next.type !== "heading") throw new Error(`${source}: toc exclude directive must be directly before a heading`);
      output.push({ ...next, data: { ...next.data, excludeFromContents: true } });
      index += 1;
      continue;
    }
    const exclude = excludeHeadings && node.type === "heading" && Number(node.depth ?? 1) > 1;
    output.push(exclude ? { ...node, data: { ...node.data, excludeFromContents: true } } : node);
  }
  return output;
}
