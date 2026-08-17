import type { ManualNode } from "./types.js";

function text(node: ManualNode): string {
  const presentation = node.data?.presentation as { keys?: Array<{ label?: string }> } | undefined;
  if (presentation?.keys) return presentation.keys.map((key) => key.label ?? "").join(" ");
  return node.value ?? (node.children ?? []).map(text).join("");
}

function hasImage(node: ManualNode): boolean {
  return node.type === "image" || node.type === "wikiImage" || (node.children ?? []).some(hasImage);
}

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`table directive ${option} must be a positive number`);
  return parsed;
}

function tableDirective(value: string): Record<string, unknown> | undefined {
  const match = /^<!--\s*table\s*:\s*([\s\S]*?)\s*-->$/iu.exec(value.trim());
  if (!match) return undefined;
  const data: Record<string, unknown> = {};
  for (const rawPart of match[1].split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [rawName, rawValue] = part.split("=", 2);
    const name = rawName.trim().toLocaleLowerCase();
    const value = rawValue?.trim();
    if (name === "columns") {
      if (!value) throw new Error("table directive columns requires comma-separated widths");
      data.columnWidths = value.split(",").map((entry) => positiveNumber(entry.trim(), "columns"));
    } else if (name === "rows-per-page") {
      if (!value) throw new Error("table directive rows-per-page requires a value");
      const rows = positiveNumber(value, "rows-per-page");
      if (!Number.isInteger(rows)) throw new Error("table directive rows-per-page must be an integer");
      data.rowsPerPage = rows;
    } else if (name === "row-weight") {
      if (!value) throw new Error("table directive row-weight requires a value");
      data.rowWeight = positiveNumber(value, "row-weight");
    } else if (name === "continue-after-table") {
      if (value && !["true", "false"].includes(value.toLocaleLowerCase())) throw new Error("table directive continue-after-table must be true or false");
      data.continueAfterTable = value ? value.toLocaleLowerCase() === "true" : true;
    } else throw new Error(`unknown table directive option: ${rawName.trim()}`);
  }
  return data;
}

export function applyTableDirectives(nodes: ManualNode[], source = "Markdown"): ManualNode[] {
  const output: ManualNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const directive = node.type === "html" && node.value ? tableDirective(node.value) : undefined;
    if (!directive) {
      output.push(node.children ? { ...node, children: applyTableDirectives(node.children, source) } : node);
      continue;
    }
    const table = nodes[index + 1];
    if (table?.type !== "table") throw new Error(`${source}: table directive must be directly before a table`);
    const widths = directive.columnWidths;
    const columnCount = table.children?.[0]?.children?.length ?? 0;
    if (Array.isArray(widths) && widths.length !== columnCount) {
      throw new Error(`${source}: table directive defines ${widths.length} columns, but the table has ${columnCount}`);
    }
    output.push({ ...table, data: { ...table.data, ...directive } });
    index += 1;
  }
  return output;
}

export function tableColumnWidths(table: ManualNode): number[] {
  const configured = table.data?.columnWidths;
  if (Array.isArray(configured) && configured.every((value) => typeof value === "number" && value > 0)) {
    const total = configured.reduce((sum, value) => sum + value, 0);
    return configured.map((value) => value / total);
  }
  const rows = table.children ?? [];
  const count = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
  const scores = Array.from({ length: count }, (_, column) => {
    const lengths = rows.map((row) => text(row.children?.[column] ?? { type: "text", value: "" }).trim().length).sort((left, right) => left - right);
    const percentile = lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.75))] ?? 4;
    const image = rows.some((row) => hasImage(row.children?.[column] ?? { type: "text" }));
    return Math.max(image ? 7 : 2.4, Math.sqrt(Math.max(4, percentile)));
  });
  const total = scores.reduce((sum, value) => sum + value, 0);
  return scores.map((score) => score / total);
}
