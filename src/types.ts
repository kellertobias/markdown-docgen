export interface ManualTheme {
  accent?: string;
  accentContrast?: string;
  background?: string;
  calloutDanger?: string;
  calloutInfo?: string;
  codeBackground?: string;
  ink?: string;
  muted?: string;
  navigationBackground?: string;
  navigationInk?: string;
  callouts?: Record<string, string>;
}

export interface InlineTokenPattern {
  pattern: string;
  flags?: string;
  kind: string;
  labelGroup?: number;
}

export interface ManualMermaidConfig {
  theme: "default" | "neutral" | "dark" | "forest" | "base";
  backgroundColor: string;
  width: number;
  height: number;
  scale: number;
  themeVariables?: Record<string, string | number | boolean>;
  config?: Record<string, unknown>;
  browserArgs?: string[];
}

export interface ManualKey {
    label: string;
    icon?: "shift" | "backspace";
    variant?: "regular" | "record" | "clear" | "preload" | "keyboard" | "shift";
}

export interface ManualKeyPresentation {
  component: "key-sequence";
  keys: ManualKey[];
}

export interface ManualControlSequencePresentation {
  component: "control-sequence";
  segments: Array<{ text?: string; keys?: ManualKey[] }>;
}

export interface ManualRenderHookContext {
  relativePath: string;
}

export interface ManualRenderHook {
  name: string;
  transform: (node: ManualNode, context: ManualRenderHookContext) => ManualNode | ManualNode[] | undefined;
}

export interface ManualLayoutConfig {
  columns: 1 | 2;
  columnGap: number;
  hierarchyHeadings: boolean;
  maxHeadingDepth: number;
  justifyText: boolean;
}

export interface ManualConfig {
  title: string;
  subtitle?: string;
  author?: string;
  language?: string;
  version?: string;
  description?: string;
  logo?: string;
  brand?: { logo?: string };
  chapterIndexNames?: string[];
  inlineTokens?: InlineTokenPattern[];
  mermaid?: Partial<ManualMermaidConfig>;
  hookModules?: string[];
  layout?: Partial<ManualLayoutConfig>;
  output: {
    htmlDir: string;
    htmlArchive?: string;
    pdf: string;
  };
  pdf?: {
    pageSize?: "A4" | "LETTER";
    footer?: string;
    contentsDepth?: number;
    header?: string;
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
  };
  theme?: ManualTheme;
}

export interface ManualNode {
  type: string;
  value?: string;
  lang?: string | null;
  url?: string;
  alt?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  align?: Array<"left" | "right" | "center" | null>;
  children?: ManualNode[];
  calloutType?: string;
  calloutTitle?: string;
  collapsed?: boolean | null;
  data?: Record<string, unknown>;
}

export interface ManualHeading {
  depth: number;
  sourceDepth: number;
  title: string;
  id: string;
  excludeFromContents?: boolean;
}

export interface SourcePage {
  absolutePath: string;
  relativePath: string;
  title: string;
  id: string;
  isChapter: boolean;
  hierarchyDepth: number;
  chapterTitle: string;
  nodes: ManualNode[];
  headings: ManualHeading[];
}

export interface ManualModel {
  sourceRoot: string;
  pages: SourcePage[];
  pageByRelativePath: Map<string, SourcePage>;
  pageByStem: Map<string, SourcePage[]>;
}

export interface ResolvedConfig extends ManualConfig {
  configDirectory: string;
  output: {
    htmlDir: string;
    htmlArchive?: string;
    pdf: string;
  };
  logo?: string;
  theme: Required<ManualTheme>;
  pdf: {
    pageSize: "A4" | "LETTER";
    footer: string;
    contentsDepth: number;
    header: string;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  mermaid: ManualMermaidConfig;
  hookModules: string[];
  layout: ManualLayoutConfig;
}
