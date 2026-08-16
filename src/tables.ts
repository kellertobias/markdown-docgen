import type { ManualNode } from "./types.js";

function text(node: ManualNode): string {
  const presentation = node.data?.presentation as { keys?: Array<{ label?: string }> } | undefined;
  if (presentation?.keys) return presentation.keys.map((key) => key.label ?? "").join(" ");
  return node.value ?? (node.children ?? []).map(text).join("");
}

function hasImage(node: ManualNode): boolean {
  return node.type === "image" || node.type === "wikiImage" || (node.children ?? []).some(hasImage);
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
