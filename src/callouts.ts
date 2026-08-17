import type { ResolvedConfig } from "./types.js";

export const OBSIDIAN_CALLOUT_TYPES = [
  "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important",
  "success", "check", "done", "question", "help", "faq", "warning", "caution", "attention",
  "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite",
] as const;

export interface CalloutAppearance {
  canonical: string;
  color: string;
  background: string;
  icon: string;
}

const appearances: Record<string, CalloutAppearance> = {
  note: { canonical: "note", color: "#086ddd", background: "#eaf3ff", icon: "i" },
  abstract: { canonical: "abstract", color: "#008da8", background: "#e5f8fb", icon: "=" },
  info: { canonical: "info", color: "#086ddd", background: "#eaf3ff", icon: "i" },
  todo: { canonical: "todo", color: "#086ddd", background: "#eaf3ff", icon: "[ ]" },
  tip: { canonical: "tip", color: "#008f7a", background: "#e4f7f3", icon: "*" },
  success: { canonical: "success", color: "#16803c", background: "#e9f7ed", icon: "+" },
  question: { canonical: "question", color: "#a76f00", background: "#fff7d6", icon: "?" },
  warning: { canonical: "warning", color: "#b7791f", background: "#fff3c4", icon: "!" },
  failure: { canonical: "failure", color: "#c53030", background: "#ffebeb", icon: "x" },
  danger: { canonical: "danger", color: "#b42318", background: "#ffe6e3", icon: "!!" },
  bug: { canonical: "bug", color: "#c2185b", background: "#fde7f0", icon: "#" },
  example: { canonical: "example", color: "#6b46c1", background: "#f1ebff", icon: ">" },
  quote: { canonical: "quote", color: "#64748b", background: "#f1f4f6", icon: "\"" },
};

const aliases: Record<string, string> = {
  summary: "abstract", tldr: "abstract",
  hint: "tip", important: "tip",
  check: "success", done: "success",
  help: "question", faq: "question",
  caution: "warning", attention: "warning",
  fail: "failure", missing: "failure",
  error: "danger", cite: "quote",
};

export function calloutAppearance(kind: string, theme?: ResolvedConfig["theme"]): CalloutAppearance {
  const raw = kind.toLocaleLowerCase();
  const canonical = aliases[raw] ?? raw;
  const base = appearances[canonical] ?? appearances.note;
  const configured = theme?.callouts[raw] ?? theme?.callouts[canonical]
    ?? (canonical === "danger" ? theme?.calloutDanger : ["note", "info", "todo"].includes(canonical) ? theme?.calloutInfo : undefined);
  return { ...base, color: configured ?? base.color };
}
