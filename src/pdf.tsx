import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToFile,
} from "@react-pdf/renderer";
import type { ManualControlSequencePresentation, ManualKey, ManualModel, ManualNode, ResolvedConfig, SourcePage } from "./types.js";
import { resolvePageLink } from "./markdown.js";
import { tableColumnWidths } from "./tables.js";
import { calloutAppearance } from "./callouts.js";
import { imageDisplayWidth, imageWidthFraction } from "./images.js";

const require = createRequire(import.meta.url);
Font.register({
  family: "ManualSymbols",
  src: require.resolve("@fontsource/noto-sans-symbols-2/files/noto-sans-symbols-2-symbols-400-normal.woff"),
});

const MAX_CONTENTS_ENTRIES_PER_PAGE = 80;

const base = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.1, lineHeight: 1.38 },
  body: { flexGrow: 1 },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 23, lineHeight: 1.12 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 16, lineHeight: 1.18 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 15, lineHeight: 1.18 },
  h4: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 9, marginBottom: 5 },
  h5: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 8, marginBottom: 4 },
  paragraph: { marginBottom: 6, orphans: 2, widows: 2 },
  code: { fontFamily: "Courier", fontSize: 7.4, lineHeight: 1.35, padding: 8, marginVertical: 5 },
  inlineCode: { fontFamily: "Courier", fontSize: 8 },
  list: { marginBottom: 3, paddingLeft: 11 },
  listItem: { flexDirection: "row", marginBottom: 1 },
  bullet: { width: 16 },
  listContent: { flexGrow: 1, flexBasis: 0 },
  quote: { marginVertical: 6, padding: 8, borderLeftWidth: 3 },
  callout: { marginVertical: 7, padding: 9, borderLeftWidth: 4 },
  calloutTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  table: { marginVertical: 6, borderTopWidth: 0.5 },
  row: { flexDirection: "row", alignItems: "stretch" },
  cell: { flexGrow: 0, padding: 4, borderRightWidth: 0.5, borderBottomWidth: 0.5, fontSize: 6.9, lineHeight: 1.32 },
  headerCell: { fontFamily: "Helvetica-Bold" },
  figure: { marginVertical: 8, alignItems: "center" },
  image: { maxWidth: "100%", maxHeight: 390, objectFit: "contain" },
  caption: { marginTop: 3, fontSize: 7, color: "#64748b", textAlign: "center" },
  rule: { height: 1, marginVertical: 7 },
  inlineToken: { fontFamily: "Helvetica-Bold", fontSize: 7.3, lineHeight: 1.55, paddingHorizontal: 5, paddingVertical: 2.5, borderWidth: 0.8, borderBottomWidth: 2.2, borderRadius: 5 },
  commandLine: { fontFamily: "Courier-Bold", fontSize: 7.4, lineHeight: 1.55, paddingHorizontal: 5, paddingVertical: 2.5, borderWidth: 0.8, borderBottomWidth: 2, borderRadius: 5, borderColor: "#aeb8c2", backgroundColor: "#4b5563", color: "#ffffff" },
  controlSequence: { fontFamily: "Courier-Bold", fontSize: 7.4, lineHeight: 1.75, paddingHorizontal: 5, paddingVertical: 3, borderWidth: 0.8, borderRadius: 6, borderColor: "#334554", backgroundColor: "#071621", color: "#f4f7f9" },
  contentsItem: { flexDirection: "row", alignItems: "center", minHeight: 16 },
  contentsLabel: { flexGrow: 1 },
  coverEyebrow: { fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 2.2, textTransform: "uppercase" },
  coverTitle: { maxWidth: 440, marginTop: 24, fontFamily: "Helvetica-Bold", fontSize: 32, lineHeight: 1.08 },
  coverSubtitle: { maxWidth: 400, marginTop: 14, fontSize: 14, lineHeight: 1.35 },
  coverVersion: { marginTop: 38, fontSize: 9 },
  chapterHeading: { marginBottom: 14, padding: 14, borderTopWidth: 5 },
  sectionHeading: { marginTop: 13, marginBottom: 8, paddingLeft: 10, borderLeftWidth: 5, flexDirection: "row", alignItems: "center" },
  keySequence: { fontFamily: "Helvetica-Bold", fontSize: 7.2 },
  keyRegular: { borderColor: "#59636d", borderBottomColor: "#11161b", backgroundColor: "#20272e", color: "#f4f7f9" },
  keyRecord: { borderColor: "#ff6872", borderBottomColor: "#70181f", backgroundColor: "#421116", color: "#ff8b93" },
  keyClear: { borderColor: "#d6a600", borderBottomColor: "#806000", backgroundColor: "#493b05", color: "#f0c52f" },
  keyPreload: { borderColor: "#4ea8de", borderBottomColor: "#15577e", backgroundColor: "#123d58", color: "#8bd3ff" },
  keyKeyboard: { borderColor: "#d8dee5", borderBottomColor: "#8b98a4", backgroundColor: "#ffffff", color: "#17202a", fontFamily: "Courier-Bold" },
  keyShift: { borderColor: "#8d99a6", borderBottomColor: "#20272e", backgroundColor: "#39434d", color: "#ffffff" },
  richLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  keyBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 0.7, marginVertical: 0.35, paddingHorizontal: 3.5, paddingVertical: 1.8, borderWidth: 0.7, borderBottomWidth: 1.8, borderRadius: 4 },
  keyGroup: { flexDirection: "row", alignItems: "center" },
  shiftChord: { flexDirection: "row", alignItems: "flex-end", paddingTop: 1 },
  commandBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 0.7, marginVertical: 0.35, paddingHorizontal: 3.5, paddingVertical: 1.8, borderWidth: 0.7, borderRadius: 4, borderColor: "#aeb8c2", backgroundColor: "#4b5563" },
  controlBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 0.7, marginVertical: 0.35, paddingHorizontal: 2.5, paddingVertical: 1.5, borderWidth: 0.7, borderRadius: 4.5, borderColor: "#334554", backgroundColor: "#071621" },
});

interface PdfContext {
  model: ManualModel;
  page: SourcePage;
  config: ResolvedConfig;
  headingIndex: number;
  listDepth: number;
}

function pageFrame(config: ResolvedConfig): { width: number; height: number; minHeight: number; maxHeight: number } {
  const width = config.pdf.pageSize === "A4" ? 595.28 : 612;
  const height = config.pdf.pageSize === "A4" ? 841.89 : 792;
  return { width, height, minHeight: height, maxHeight: height };
}

function plain(node: ManualNode): string {
  return node.value ?? (node.children ?? []).map(plain).join("");
}

function localImage(context: PdfContext, url: string): string {
  return path.resolve(path.dirname(context.page.absolutePath), decodeURIComponent(url.split("#", 1)[0]));
}

function standaloneImage(node: ManualNode): ManualNode | undefined {
  if (node.type === "image" || node.type === "wikiImage") return node;
  if (node.type !== "paragraph") return undefined;
  const meaningful = (node.children ?? []).filter((child) => child.type !== "text" || child.value?.trim());
  return meaningful.length === 1 && ["image", "wikiImage"].includes(meaningful[0].type) ? meaningful[0] : undefined;
}

function pdfImageWidth(node: ManualNode): string | number | undefined {
  const width = imageDisplayWidth(node);
  if (!width) return undefined;
  const value = Number.parseFloat(width);
  if (width.endsWith("%")) return width;
  return width.endsWith("px") ? value * 0.75 : value;
}

function renderKeys(keys: ManualKey[]): React.ReactNode {
  return <Text style={base.keySequence}>{keys.map((key, index) => {
    const style = key.variant === "record" ? base.keyRecord
      : key.variant === "clear" ? base.keyClear
        : key.variant === "preload" ? base.keyPreload
          : key.variant === "keyboard" ? base.keyKeyboard
            : key.variant === "shift" ? base.keyShift
              : base.keyRegular;
    const icon = key.icon === "shift" ? "⇧" : key.icon === "backspace" ? "⌫" : "";
    return <Text key={`${key.label}-${index}`}>{index ? <Text style={{ color: "#94a3b8" }}> + </Text> : null}<Text style={[base.inlineToken, style]}>{"\u00a0"}{icon ? <Text style={{ fontFamily: "ManualSymbols" }}>{icon} </Text> : null}{key.label}{"\u00a0"}</Text></Text>;
  })}</Text>;
}

function keyStyle(key: ManualKey): object {
  return key.variant === "record" ? base.keyRecord
    : key.variant === "clear" ? base.keyClear
      : key.variant === "preload" ? base.keyPreload
        : key.variant === "keyboard" ? base.keyKeyboard
          : key.variant === "shift" ? base.keyShift
            : base.keyRegular;
}

function keyBoxes(keys: ManualKey[], prefix: string): React.ReactNode {
  const box = (key: ManualKey, index: number, extraStyle?: any): React.ReactNode => {
    const icon = key.icon === "shift" ? "⇧" : key.icon === "backspace" ? "⌫" : "";
    const style = keyStyle(key) as { color?: string };
    return <View key={`${prefix}-${key.label}-${index}`} style={[base.keyBox, style, extraStyle]}><Text style={{ fontFamily: key.variant === "keyboard" ? "Courier-Bold" : "Helvetica-Bold", fontSize: 7.1, color: style.color ?? "#f4f7f9" }}>{icon ? <Text style={{ fontFamily: "ManualSymbols" }}>{icon}</Text> : null}{icon && key.label ? " " : null}{key.label}</Text></View>;
  };
  const groups: React.ReactNode[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (groups.length) groups.push(<Text key={`${prefix}-plus-${index}`} style={{ marginHorizontal: 1.4, color: "#64748b", fontSize: 6.8 }}>+</Text>);
    if (key.variant === "shift" && keys[index + 1]) {
      groups.push(<View key={`${prefix}-shift-chord-${index}`} style={base.shiftChord}>{box(key, index, { top: 1.5, paddingHorizontal: 1.75, paddingVertical: 0.9 })}{box(keys[index + 1], index + 1, { marginLeft: -2.5, top: -1 })}</View>);
      index += 1;
    } else groups.push(box(key, index));
  }
  return <View style={base.keyGroup}>{groups}</View>;
}

function hasPresentation(nodes: ManualNode[] | undefined): boolean {
  return (nodes ?? []).some((node) => Boolean((node.data?.presentation as { component?: string } | undefined)?.component) || hasPresentation(node.children));
}

function presentationCount(nodes: ManualNode[] | undefined): number {
  return (nodes ?? []).reduce((count, node) => count + (Boolean((node.data?.presentation as { component?: string } | undefined)?.component) ? 1 : 0) + presentationCount(node.children), 0);
}

function flowText(value: string, style: any, prefix: string): React.ReactNode[] {
  return (value.replace(/\r?\n/gu, " ").match(/\S+\s*|\s+/gu) ?? []).map((part, index) => <Text key={`${prefix}-${index}`} style={style}>{part}</Text>);
}

function flowNodes(nodes: ManualNode[] | undefined, context: PdfContext, inherited: any = {}, prefix = "flow"): React.ReactNode[] {
  return (nodes ?? []).flatMap((node, index) => {
    const key = `${prefix}-${node.type}-${index}`;
    if (node.type === "text") return flowText(node.value ?? "", inherited, key);
    if (node.type === "strong") return flowNodes(node.children, context, { ...inherited, fontFamily: "Helvetica-Bold" }, key);
    if (node.type === "emphasis") return flowNodes(node.children, context, { ...inherited, fontFamily: "Helvetica-Oblique" }, key);
    if (node.type === "break") return [<View key={key} style={{ width: "100%" }} />];
    if (node.type === "inlineToken") {
      const presentation = node.data?.presentation as { component?: string; keys?: ManualKey[] } | undefined;
      if (presentation?.component === "key-sequence" && presentation.keys) return [<React.Fragment key={key}>{keyBoxes(presentation.keys, key)}</React.Fragment>];
      return [<View key={key} style={[base.keyBox, { borderColor: "#59636d", backgroundColor: context.config.theme.navigationBackground }]}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.3, color: "#ffb30f" }}>{node.value}</Text></View>];
    }
    if (node.type === "inlineCode") {
      const presentation = node.data?.presentation as ManualControlSequencePresentation | { component?: string } | undefined;
      if (presentation?.component === "command-line") return [<View key={key} style={base.commandBox}><Text style={{ fontFamily: "Courier-Bold", fontSize: 7.4, color: "#ffffff" }}>{node.value}</Text></View>];
      if (presentation?.component === "control-sequence") {
        const sequence = presentation as ManualControlSequencePresentation;
        return [<View key={key} style={base.controlBox}>{sequence.segments.map((segment, segmentIndex) => segment.keys
        ? <React.Fragment key={`${key}-${segmentIndex}`}>{keyBoxes(segment.keys, `${key}-${segmentIndex}`)}</React.Fragment>
        : segment.text?.trim() ? <Text key={`${key}-${segmentIndex}`} style={{ marginHorizontal: 2, fontFamily: "Courier-Bold", fontSize: 7.4, color: "#f4f7f9" }}>{segment.text.trim()}</Text> : null)}</View>];
      }
      return [<Text key={key} style={[base.inlineCode, inherited, { color: context.config.theme.accent }]}>{node.value}</Text>];
    }
    if (node.type === "link") return [<Link key={key} src={node.url ?? ""} style={{ ...inherited, color: context.config.theme.accent }}>{plain(node)}</Link>];
    return flowNodes(node.children, context, inherited, key);
  });
}

function keyPresentation(node: ManualNode): React.ReactNode | undefined {
  const presentation = node.data?.presentation as { component?: string; keys?: ManualKey[] } | undefined;
  return presentation?.component === "key-sequence" && presentation.keys ? renderKeys(presentation.keys) : undefined;
}

function controlSequence(node: ManualNode): React.ReactNode | undefined {
  const presentation = node.data?.presentation as ManualControlSequencePresentation | undefined;
  if (presentation?.component !== "control-sequence") return undefined;
  return <Text style={base.controlSequence}>{"\u00a0"}{presentation.segments.map((segment, index) => <React.Fragment key={`segment-${index}`}>{segment.keys ? renderKeys(segment.keys) : segment.text}</React.Fragment>)}{"\u00a0"}</Text>;
}

function inlineNodes(nodes: ManualNode[] | undefined, context: PdfContext): React.ReactNode[] {
  return (nodes ?? []).map((node, index) => {
    const key = `${node.type}-${index}`;
    switch (node.type) {
      case "text": return (node.value ?? "").replace(/\r?\n/gu, " ");
      case "html": return /^<br\s*\/?>$/iu.test(node.value ?? "") ? "\n" : node.value ?? "";
      case "strong": return <Text key={key} style={{ fontFamily: "Helvetica-Bold" }}>{inlineNodes(node.children, context)}</Text>;
      case "emphasis": return <Text key={key} style={{ fontFamily: "Helvetica-Oblique" }}>{inlineNodes(node.children, context)}</Text>;
      case "delete": return <Text key={key} style={{ textDecoration: "line-through" }}>{inlineNodes(node.children, context)}</Text>;
      case "inlineCode": {
        const presentation = node.data?.presentation as { component?: string } | undefined;
        const sequence = controlSequence(node);
        if (sequence) return <React.Fragment key={key}>{sequence}</React.Fragment>;
        return <Text key={key} style={presentation?.component === "command-line" ? base.commandLine : [base.inlineCode, { color: context.config.theme.accent }]}>{presentation?.component === "command-line" ? `\u00a0${node.value ?? ""}\u00a0` : node.value}</Text>;
      }
      case "inlineToken": return <React.Fragment key={key}>{keyPresentation(node) ?? <Text style={[base.inlineToken, { backgroundColor: context.config.theme.navigationBackground, color: "#ffb30f" }]}>{node.value}</Text>}</React.Fragment>;
      case "break": return "\n";
      case "link": {
        const url = node.url ?? "";
        const external = /^(?:https?:|mailto:)/iu.test(url);
        const target = !external ? resolvePageLink(context.model, context.page, url) : undefined;
        if (!external && !target && !url.startsWith("#")) return <Text key={key}>{inlineNodes(node.children, context)}</Text>;
        return <Link key={key} src={target ? `#${target}` : url} style={{ color: context.config.theme.accent }}>{inlineNodes(node.children, context)}</Link>;
      }
      case "wikiLink": {
        const target = resolvePageLink(context.model, context.page, node.url ?? "");
        return target ? <Link key={key} src={`#${target}`} style={{ color: context.config.theme.accent }}>{node.value}</Link> : <Text key={key} style={{ color: context.config.theme.calloutDanger }}>{node.value}</Text>;
      }
      default: return inlineNodes(node.children, context);
    }
  });
}

function blockNodes(nodes: ManualNode[] | undefined, context: PdfContext): React.ReactNode[] {
  return (nodes ?? []).map((node, index) => renderBlock(node, context, `${node.type}-${index}`));
}

function renderListItem(node: ManualNode, context: PdfContext, key: string, index: number, ordered: boolean, start: number): React.ReactNode {
  const marker = node.checked === true ? "[x]" : node.checked === false ? "[ ]" : ordered ? `${start + index}.` : "•";
  return <View key={key} style={base.listItem} wrap={false}><Text style={base.bullet}>{marker}</Text><View style={base.listContent}>{blockNodes(node.children, { ...context, listDepth: context.listDepth + 1 })}</View></View>;
}

function renderTable(node: ManualNode, context: PdfContext, key: string): React.ReactNode {
  const widths = tableColumnWidths(node);
  const continuation = Number(node.data?.tablePart ?? 0) > 0;
  return <View key={key} style={[base.table, continuation ? { marginTop: 0 } : {}, { borderColor: "#cbd5df" }]}>{(node.children ?? []).map((row, rowIndex) => <View key={`row-${rowIndex}`} style={[base.row, rowIndex === 0 ? { backgroundColor: context.config.theme.navigationBackground } : rowIndex % 2 === 0 ? { backgroundColor: "#f2f5f6" } : { backgroundColor: "#ffffff" }]} wrap={false}>{(row.children ?? []).map((cell, cellIndex, cells) => <View key={`cell-${cellIndex}`} style={[base.cell, rowIndex === 0 ? base.headerCell : {}, { width: `${(widths[cellIndex] ?? 1 / cells.length) * 100}%`, flexBasis: `${(widths[cellIndex] ?? 1 / cells.length) * 100}%`, borderRightWidth: cellIndex === cells.length - 1 ? 0 : 0.5, borderColor: "#cbd5df" }]}>{renderTableCell(cell, context, rowIndex === 0)}</View>)}</View>)}</View>;
}

function renderTableCell(cell: ManualNode, context: PdfContext, header: boolean): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let inline: ManualNode[] = [];
  const flush = (): void => {
    if (!inline.length) return;
    result.push(hasPresentation(inline)
      ? <View key={`cell-text-${result.length}`} style={base.richLine}>{flowNodes(inline, context, header ? { color: context.config.theme.navigationInk } : {})}</View>
      : <Text key={`cell-text-${result.length}`} style={header ? { color: context.config.theme.navigationInk } : {}}>{inlineNodes(inline, context)}</Text>);
    inline = [];
  };
  const items = (cell.children ?? []).flatMap((child) => child.type === "paragraph" ? child.children ?? [] : [child]);
  for (const item of items) {
    if (item.type === "image" || item.type === "wikiImage") {
      flush();
      result.push(<Image key={`cell-image-${result.length}`} src={localImage(context, item.url ?? "")} style={{ width: "100%", maxHeight: 90, objectFit: "contain", marginVertical: 2 }} />);
    } else inline.push(item);
  }
  flush();
  return result;
}

function renderBlock(node: ManualNode, context: PdfContext, key: string): React.ReactNode {
  switch (node.type) {
    case "paragraph": {
      const image = standaloneImage(node);
      if (image) return renderBlock(image, context, `${key}-image`);
      if (hasPresentation(node.children)) return <View key={key} style={[base.paragraph, base.richLine, context.listDepth ? { marginBottom: 4 } : {}]}>{flowNodes(node.children, context)}</View>;
      return <Text key={key} style={[base.paragraph, context.listDepth ? { marginBottom: 1 } : {}, { color: context.config.theme.ink, textAlign: context.config.layout.justifyText ? "justify" : "left" }]}>{inlineNodes(node.children, context)}</Text>;
    }
    case "heading": {
      const heading = context.page.headings[context.headingIndex++];
      const depth = Number(node.data?.effectiveDepth ?? node.depth ?? 1);
      if (depth <= 2) return <View key={key} id={heading.id} wrap={false} style={[base.chapterHeading, { borderColor: context.config.theme.accent, backgroundColor: context.config.theme.navigationBackground }]}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: context.config.theme.accent, letterSpacing: 1.6 }}>CHAPTER</Text><Text style={[base.h1, { marginTop: 5, color: context.config.theme.navigationInk }]}>{inlineNodes(node.children, context)}</Text></View>;
      if (depth === 3) return <View key={key} id={heading.id} wrap={false} style={[base.sectionHeading, { borderColor: context.config.theme.accent }]}><Text style={[base.h3, { color: context.config.theme.accent }]}>{inlineNodes(node.children, context)}</Text><View style={{ flexGrow: 1, marginLeft: 10, borderBottomWidth: 5, borderColor: context.config.theme.accent }} /></View>;
      if (depth === 4) return <Text key={key} id={heading.id} minPresenceAhead={24} style={[base.h4, { color: context.config.theme.accent }]}>{inlineNodes(node.children, context)}</Text>;
      return <Text key={key} id={heading.id} minPresenceAhead={24} style={[base.h5, { color: context.config.theme.navigationBackground }]}>{inlineNodes(node.children, context)}</Text>;
    }
    case "code": return <Text key={key} style={[base.code, { backgroundColor: context.config.theme.codeBackground, color: "#e5f8f5" }]}>{node.value || " "}</Text>;
    case "mermaid": {
      const png = typeof node.data?.mermaidPng === "string" ? node.data.mermaidPng : "";
      return <View key={key} style={base.figure} wrap={false}><Image src={`data:image/png;base64,${png}`} style={base.image} />{node.alt ? <Text style={base.caption}>{node.alt}</Text> : null}</View>;
    }
    case "thematicBreak": return <View key={key} style={[base.rule, { backgroundColor: context.config.theme.muted }]} />;
    case "blockquote": return <View key={key} style={[base.quote, { borderColor: context.config.theme.calloutInfo, backgroundColor: "#eef8f8" }]}>{blockNodes(node.children, context)}</View>;
    case "callout": {
      const kind = node.calloutType ?? "note";
      const appearance = calloutAppearance(kind, context.config.theme);
      return <View key={key} style={[base.callout, { borderColor: appearance.color, backgroundColor: appearance.background }]}><Text minPresenceAhead={18} style={[base.calloutTitle, { color: appearance.color }]}>{appearance.icon}  {node.calloutTitle}</Text>{blockNodes(node.children, context)}</View>;
    }
    case "list": {
      const start = node.start ?? 1;
      return <View key={key} style={base.list}>{(node.children ?? []).map((item, index) => renderListItem(item, context, `${key}-${index}`, index, Boolean(node.ordered), start))}</View>;
    }
    case "table": return renderTable(node, context, key);
    case "image":
    case "wikiImage": {
      const src = localImage(context, node.url ?? "");
      const caption = node.alt ?? node.value ?? "";
      const width = pdfImageWidth(node);
      return <View key={key} style={base.figure} wrap={false}><Image src={src} style={[base.image, width ? { width } : {}]} />{caption ? <Text style={base.caption}>{caption}</Text> : null}</View>;
    }
    default: {
      const children = blockNodes(node.children, context);
      return children.length ? <View key={key}>{children}</View> : null;
    }
  }
}

interface ContentChunk { page: SourcePage; nodes: ManualNode[]; headingIndex: number; divider?: boolean }
interface TocEntry { id: string; title: string; depth: number; pageNumber: number }

function Contents({ chunks, config }: { chunks: TocEntry[][]; config: ResolvedConfig }): React.ReactElement {
  return <>{chunks.map((chunk, chunkIndex) => {
    const columnSize = Math.ceil(chunk.length / 2);
    const columns = [chunk.slice(0, columnSize), chunk.slice(columnSize)];
    return <Page
      key={`contents-${chunkIndex}`}
      size={config.pdf.pageSize}
      wrap={false}
      style={[base.page, pageFrame(config), {
        paddingTop: config.pdf.margins.top,
        paddingRight: config.pdf.margins.right,
        paddingBottom: config.pdf.margins.bottom,
        paddingLeft: config.pdf.margins.left,
        color: config.theme.ink,
      }]}
      bookmark={chunkIndex === 0 ? "Contents" : undefined}
    >
      <View style={{ marginBottom: 14, paddingBottom: 8, borderBottomWidth: 2, borderColor: config.theme.accent }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: config.theme.accent, letterSpacing: 1.8 }}>NAVIGATION</Text>
        <Text style={[base.h1, { marginTop: 5, color: config.theme.navigationBackground }]}>Contents</Text>
      </View>
      <View style={{ flexDirection: "row", flexGrow: 1, alignItems: "stretch" }}>
        {columns.map((column, columnIndex) => <View key={`column-${columnIndex}`} style={{ width: "50%", height: "100%", justifyContent: "space-between", paddingRight: columnIndex === 0 ? 11 : 0, paddingLeft: columnIndex === 1 ? 11 : 0 }}>
          {column.map((entry) => <View
            key={entry.id}
            style={[
              base.contentsItem,
              entry.depth === 1
                ? { marginTop: 2, marginBottom: 1, padding: 4, backgroundColor: config.theme.navigationBackground }
                : { paddingLeft: Math.max(0, entry.depth - 2) * 8 },
            ]}
          >
            <Link src={`#${entry.id}`} style={[base.contentsLabel, {
              color: entry.depth === 1 ? config.theme.navigationInk : entry.depth === 2 ? config.theme.accent : config.theme.ink,
              fontFamily: entry.depth <= 2 ? "Helvetica-Bold" : "Helvetica",
              fontSize: entry.depth === 1 ? 8.5 : entry.depth === 2 ? 7.8 : 7.2,
            }]}>{entry.title}</Link>
            <View style={{ flexGrow: 1, marginHorizontal: 5, borderBottomWidth: entry.depth === 1 ? 0 : 0.5, borderColor: "#cbd5df" }} />
            <Text style={{ width: 20, textAlign: "right", color: entry.depth === 1 ? config.theme.navigationInk : config.theme.muted, fontSize: 6.8 }}>{entry.pageNumber}</Text>
          </View>)}
        </View>)}
      </View>
    </Page>;
  })}</>;
}

function splitColumns(nodes: ManualNode[]): [ManualNode[], ManualNode[]] {
  const target = nodes.reduce((sum, node) => sum + estimateNode(node), 0) / 2;
  let weight = 0;
  let split = 0;
  while (split < nodes.length && (weight < target || split === 0)) weight += estimateNode(nodes[split++]);
  return [nodes.slice(0, split), nodes.slice(split)];
}

function ContentPage({ chunk, model, config, index }: { chunk: ContentChunk; model: ManualModel; config: ResolvedConfig; index: number }): React.ReactElement {
  const context: PdfContext = { model, page: chunk.page, config, headingIndex: chunk.headingIndex, listDepth: 0 };
  if (chunk.divider) {
    const headingNode = chunk.nodes.find((node) => node.type === "heading")!;
    const heading = chunk.page.headings[chunk.headingIndex];
    const headingPosition = chunk.nodes.indexOf(headingNode);
    const before = chunk.nodes.slice(0, headingPosition).map(standaloneImage).filter((node): node is ManualNode => Boolean(node));
    const after = chunk.nodes.slice(headingPosition + 1).map(standaloneImage).filter((node): node is ManualNode => Boolean(node));
    const imageView = (node: ManualNode, position: string) => <Image key={position} src={localImage(context, node.url ?? "")} style={{ width: 150, height: 150, objectFit: "contain", marginVertical: 28 }} />;
    return <Page key={`${chunk.page.id}-${index}`} size={config.pdf.pageSize} wrap={false} bookmark={chunk.page.title} style={[base.page, pageFrame(config), { padding: 58, backgroundColor: config.theme.navigationBackground, color: config.theme.navigationInk }]}><View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, backgroundColor: config.theme.accent }} /><View style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>{before.map((node, imageIndex) => imageView(node, `before-${imageIndex}`))}<Text id={heading.id} style={{ maxWidth: 460, fontFamily: "Helvetica-Bold", fontSize: 34, lineHeight: 1.08, textAlign: "center" }}>{plain(headingNode)}</Text><View style={{ width: 90, height: 4, marginTop: 20, backgroundColor: config.theme.accent }} />{after.map((node, imageIndex) => imageView(node, `after-${imageIndex}`))}</View></Page>;
  }
  const first = chunk.nodes[0];
  const spansColumns = config.layout.columns === 2 && first?.type === "heading" && Number(first.data?.effectiveDepth ?? first.depth ?? 1) <= 2;
  const bodyNodes = spansColumns ? chunk.nodes.slice(1) : chunk.nodes;
  const columns = config.layout.columns === 2 ? splitColumns(bodyNodes) : [bodyNodes];
  return <Page key={`${chunk.page.id}-${index}`} size={config.pdf.pageSize} wrap={false} bookmark={chunk.headingIndex === 0 ? chunk.page.title : undefined} style={[base.page, pageFrame(config), { paddingTop: config.pdf.margins.top, paddingRight: config.pdf.margins.right, paddingBottom: config.pdf.margins.bottom, paddingLeft: config.pdf.margins.left, color: config.theme.ink }]}>{spansColumns ? renderBlock(first, context, "spanning-heading") : null}<View style={[base.body, config.layout.columns === 2 ? { flexDirection: "row" } : {}]}>{columns.map((nodes, columnIndex) => <View key={`column-${columnIndex}`} style={config.layout.columns === 2 ? { width: "50%", paddingRight: columnIndex === 0 ? config.layout.columnGap / 2 : 0, paddingLeft: columnIndex === 1 ? config.layout.columnGap / 2 : 0 } : { width: "100%" }}>{blockNodes(nodes, context)}</View>)}</View></Page>;
}

function ManualDocument({ model, config, content, toc }: { model: ManualModel; config: ResolvedConfig; content: ContentChunk[]; toc: TocEntry[][] }): React.ReactElement {
  return <Document title={config.title} author={config.author} subject={config.description ?? config.subtitle} creator="markdown-manual" producer="@tobisk/markdown-manuals" language={config.language ?? "en"} keywords={`manual, ${config.title}`}>
    <Page size={config.pdf.pageSize} wrap={false} style={[base.page, pageFrame(config), { padding: 58, backgroundColor: config.theme.navigationBackground, color: config.theme.navigationInk }]} bookmark={config.title}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, backgroundColor: config.theme.accent }} />
      <View style={{ flexGrow: 1, justifyContent: "center" }}>
        <Text style={[base.coverEyebrow, { color: config.theme.accent }]}>OPERATOR DOCUMENTATION</Text>
        {config.logo ? <Image src={config.logo} style={{ width: 82, height: 82, objectFit: "contain", marginTop: 32, marginBottom: 8 }} /> : null}
        <Text style={base.coverTitle}>{config.title}</Text>
        {config.subtitle ? <Text style={[base.coverSubtitle, { color: config.theme.accent }]}>{config.subtitle}</Text> : null}
        {config.description ? <Text style={{ maxWidth: 380, marginTop: 22, color: "#cbd5df", fontSize: 9.5, lineHeight: 1.45 }}>{config.description}</Text> : null}
        {config.version ? <Text style={[base.coverVersion, { color: config.theme.navigationInk }]}>VERSION  {config.version}</Text> : null}
      </View>
      <View style={{ paddingTop: 12, borderTopWidth: 1, borderColor: "#ffffff33" }}><Text style={{ color: "#94a3b8", fontSize: 7.5 }}>{config.author ?? ""}</Text></View>
    </Page>
    <Contents chunks={toc} config={config} />
    {content.map((chunk, index) => <ContentPage key={`${chunk.page.id}-${index}`} chunk={chunk} model={model} config={config} index={index} />)}
  </Document>;
}

function estimateNode(node: ManualNode): number {
  const length = plain(node).trim().length;
  const image = standaloneImage(node);
  if (image) return Math.max(8, 28 * imageWidthFraction(image));
  if (node.type === "heading") return Number(node.data?.effectiveDepth ?? node.depth ?? 1) <= 2 ? 6 : 3;
  if (node.type === "paragraph") {
    const ordinary = Math.max(1.5, Math.ceil(length / 88) * 1.25);
    return hasPresentation(node.children) ? Math.max(ordinary, Math.ceil(length / 70) * 1.6 + presentationCount(node.children) * 0.6) : ordinary;
  }
  if (node.type === "table") {
    const rowWeight = Number(node.data?.rowWeight ?? 3.7);
    return Math.max(10, (node.children?.length ?? 1) * rowWeight);
  }
  if (["image", "wikiImage"].includes(node.type)) return Math.max(8, 28 * imageWidthFraction(node));
  if (node.type === "mermaid") return 28;
  if (node.type === "code") return Math.max(4, (node.value?.split("\n").length ?? 1) * 1.1);
  if (node.type === "list") return Math.max(2, (node.children ?? []).reduce((sum, child) => sum + estimateNode(child), 0));
  return Math.max(1, (node.children ?? []).reduce((sum, child) => sum + estimateNode(child), 0));
}

function pageChunks(page: SourcePage, config: ResolvedConfig): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let sourceNodes = page.nodes;
  let headingIndex = 0;
  const isTopLevelIndex = page.isChapter && page.relativePath.split("/").length === 2;
  if (isTopLevelIndex) {
    const titleIndex = sourceNodes.findIndex((node) => node.type === "heading" && Number(node.depth ?? 1) === 1);
    const dividerIndexes = new Set([titleIndex]);
    if (titleIndex > 0 && standaloneImage(sourceNodes[titleIndex - 1])) dividerIndexes.add(titleIndex - 1);
    if (titleIndex >= 0 && standaloneImage(sourceNodes[titleIndex + 1])) dividerIndexes.add(titleIndex + 1);
    chunks.push({ page, nodes: sourceNodes.filter((_, index) => dividerIndexes.has(index)), headingIndex: 0, divider: true });
    sourceNodes = sourceNodes.filter((_, index) => !dividerIndexes.has(index));
    headingIndex = 1;
  }
  const expanded = sourceNodes.flatMap(splitLongTable);
  const maximum = config.layout.columns === 2 ? 88 : 56;
  let start = 0;
  while (start < expanded.length) {
    let end = start;
    let weight = 0;
    while (end < expanded.length) {
      let unitEnd = end + 1;
      if (expanded[end].type === "heading") {
        while (unitEnd < expanded.length && expanded[unitEnd].type === "heading") unitEnd += 1;
        if (unitEnd < expanded.length) unitEnd += 1;
      }
      const candidateWeight = expanded.slice(end, unitEnd).reduce((sum, node) => sum + estimateNode(node), 0);
      if (end > start && weight + candidateWeight > maximum) break;
      weight += candidateWeight;
      end = unitEnd;
      if (expanded[end - 1]?.type === "table" && (Number(expanded[end - 1]?.data?.tableParts ?? 1) > 1 || expanded[end - 1]?.data?.continueAfterTable !== true)) break;
      if (expanded[end - 1]?.type === "list" && hasPresentation(expanded[end - 1].children) && estimateNode(expanded[end - 1]) > 35) break;
    }
    const nodes = expanded.slice(start, end);
    chunks.push({ page, nodes, headingIndex });
    headingIndex += nodes.filter((node) => node.type === "heading").length;
    start = end;
  }
  return chunks;
}

function splitLongTable(node: ManualNode): ManualNode[] {
  if (node.type !== "table") return [node];
  const [header, ...rows] = node.children ?? [];
  const containsImages = rows.some((row) => (row.children ?? []).some((cell) => (cell.children ?? []).some((child) => child.type === "image" || child.type === "wikiImage")));
  const configuredRowsPerPart = Number(node.data?.rowsPerPage);
  const rowsPerPart = Number.isFinite(configuredRowsPerPart) && configuredRowsPerPart > 0
    ? Math.floor(configuredRowsPerPart)
    : containsImages ? 4 : 11;
  if (rows.length <= rowsPerPart) return [node];
  const parts = Math.ceil(rows.length / rowsPerPart);
  const tables: ManualNode[] = [];
  for (let index = 0; index < rows.length; index += rowsPerPart) tables.push({ ...node, data: { ...node.data, tablePart: index / rowsPerPart, tableParts: parts }, children: [header, ...rows.slice(index, index + rowsPerPart)] });
  return tables;
}

export async function renderPdf(model: ManualModel, config: ResolvedConfig): Promise<void> {
  await mkdir(path.dirname(config.output.pdf), { recursive: true });
  const content = model.pages.flatMap((page) => pageChunks(page, config));
  const filteredHeadings = model.pages.flatMap((page) => page.headings.filter((heading) => !heading.excludeFromContents && heading.depth <= config.pdf.contentsDepth));
  const tocPageCount = Math.max(1, Math.ceil(filteredHeadings.length / MAX_CONTENTS_ENTRIES_PER_PAGE));
  const contentsEntriesPerPage = Math.max(1, Math.ceil(filteredHeadings.length / tocPageCount));
  const headingPages = new Map<string, number>();
  content.forEach((chunk, index) => {
    const physicalPage = 2 + tocPageCount + index;
    chunk.page.headings.slice(chunk.headingIndex, chunk.headingIndex + chunk.nodes.filter((node) => node.type === "heading").length).forEach((heading) => headingPages.set(heading.id, physicalPage));
  });
  const tocEntries = filteredHeadings.map((heading) => ({ ...heading, pageNumber: headingPages.get(heading.id) ?? 0 }));
  const toc: TocEntry[][] = [];
  for (let index = 0; index < tocEntries.length; index += contentsEntriesPerPage) toc.push(tocEntries.slice(index, index + contentsEntriesPerPage));
  if (!toc.length) toc.push([]);
  const headers = ["", ...toc.map(() => "Contents"), ...content.map((chunk) => chunk.divider ? "" : chunk.page.chapterTitle)];
  await renderToFile(<ManualDocument model={model} config={config} content={content} toc={toc} />, config.output.pdf);
  await stampRunningFurniture(config, headers);
}

function pdfColor(value: string): ReturnType<typeof rgb> {
  const hex = value.replace(/^#/u, "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}

async function stampRunningFurniture(config: ResolvedConfig, headers: string[]): Promise<void> {
  const document = await PDFDocument.load(await readFile(config.output.pdf));
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const color = pdfColor(config.theme.muted);
  const size = 7;
  if (pages.length !== headers.length) throw new Error(`PDF pagination mismatch: rendered ${pages.length} pages for ${headers.length} explicit A4 pages`);

  pages.forEach((page, index) => {
    if (index === 0) return;
    const { width, height } = page.getSize();
    const header = config.pdf.header.replaceAll("{chapter}", headers[index] ?? config.title).replaceAll("{title}", config.title);
    if (header) page.drawText(header, { x: config.pdf.margins.left, y: height - 27, size, font, color });
    if (config.pdf.footer) page.drawText(config.pdf.footer, { x: config.pdf.margins.left, y: 20, size, font, color });
    const counter = `${index + 1} / ${pages.length}`;
    page.drawText(counter, { x: width - config.pdf.margins.right - font.widthOfTextAtSize(counter, size), y: 20, size, font, color });
  });

  await writeFile(config.output.pdf, await document.save());
}
