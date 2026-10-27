import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { loadManual } from "../src/markdown.js";
import { renderPdf } from "../src/pdf.js";

interface PrintedText {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PrintedManual {
  text: PrintedText[];
  pageHeight: number;
  top: number;
  bottom: number;
}

// A short content area makes each boundary case small without depending on a particular
// number of generated pages. Extraction measures the final PDF, including any overflow.
async function print(markdown: string): Promise<PrintedManual> {
  const root = await mkdtemp(path.join(os.tmpdir(), "markdown-manual-pagination-"));
  const source = path.join(root, "manual");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "index.md"), `# Pagination fixture\n\n${markdown}\n`);
  const top = 100;
  const bottom = 292;
  const configPath = path.join(root, "manual.json");
  await writeFile(configPath, JSON.stringify({
    title: "Pagination fixture",
    output: { htmlDir: "output/html", pdf: "output/manual.pdf" },
    layout: { columns: 1, justifyText: false },
    pdf: {
      pageSize: "LETTER",
      contentsDepth: 1,
      header: "",
      footer: "",
      margins: { top, bottom, left: 50, right: 50 },
    },
  }));
  const config = await loadConfig(configPath);
  const model = await loadManual(source, { maxHeadingDepth: config.layout.maxHeadingDepth });
  await renderPdf(model, config);
  const document = await getDocument({
    data: new Uint8Array(await readFile(config.output.pdf)),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const text: PrintedText[] = [];
  let pageHeight = 0;
  try {
    // The cover and contents precede the single source file. Ignore their duplicate titles.
    for (let pageNumber = 3; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      pageHeight = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        text.push({
          text: item.str,
          page: pageNumber,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
    }
  } finally {
    await document.destroy();
  }
  return { text, pageHeight, top, bottom };
}

function positions(manual: PrintedManual, token: string): PrintedText[] {
  return manual.text.filter((item) => item.text.includes(token));
}

function once(manual: PrintedManual, token: string): PrintedText {
  const found = positions(manual, token);
  expect(found, `Expected exactly one printed occurrence of ${token}`).toHaveLength(1);
  // Count within an extracted run too, in case duplicated content was coalesced.
  expect(found[0].text.split(token).length - 1, token).toBe(1);
  return found[0];
}

function insideContent(manual: PrintedManual, items: PrintedText[]): void {
  for (const item of items) {
    expect(item.y, `${item.text} falls below the bottom margin on page ${item.page}`).toBeGreaterThanOrEqual(manual.bottom - 1);
    expect(item.y + item.height, `${item.text} crosses the top margin on page ${item.page}`).toBeLessThanOrEqual(manual.pageHeight - manual.top + 2);
    expect(item.x, `${item.text} crosses the left margin`).toBeGreaterThanOrEqual(49);
    expect(item.x + item.width, `${item.text} crosses the right margin`).toBeLessThanOrEqual(563);
  }
}

function filler(lines = 6): string {
  return `\`\`\`text\n${Array.from({ length: lines }, (_, index) => `FILLER_${String(index + 1).padStart(2, "0")}`).join("\n")}\n\`\`\``;
}

function orderedItems(count: number, prefix = "STEP"): string {
  return Array.from({ length: count }, (_, index) => `${index + 1}. ${prefix}_${String(index + 1).padStart(2, "0")} Operate the selected fixture.`).join("\n");
}

function table(rows: string[]): string {
  return `| ROW_HEADER | DETAIL_HEADER |\n| --- | --- |\n${rows.join("\n")}`;
}

describe("physical PDF pagination", () => {
  it("keeps a list in the preceding page's remaining space when it fits", async () => {
    const manual = await print(`${filler()}\n\n${orderedItems(7)}\n\nAFTER_LIST`);
    const before = once(manual, "FILLER_06");
    const steps = Array.from({ length: 7 }, (_, index) => once(manual, `STEP_${String(index + 1).padStart(2, "0")}`));
    expect(steps.every((item) => item.page === before.page)).toBe(true);
    expect(steps[0].y).toBeLessThan(before.y);
    expect(once(manual, "AFTER_LIST").page).toBe(before.page);
    insideContent(manual, steps);
  }, 40_000);

  it("starts a long list in remaining space and continues with every item once", async () => {
    const count = 25;
    const manual = await print(`${filler()}\n\n${orderedItems(count)}\n\nAFTER_LIST`);
    const before = once(manual, "FILLER_06");
    const steps = Array.from({ length: count }, (_, index) => once(manual, `STEP_${String(index + 1).padStart(2, "0")}`));
    expect(steps[0].page).toBe(before.page);
    expect(steps.at(-1)!.page).toBeGreaterThan(before.page);
    expect(steps.filter((item) => item.page === before.page).length).toBeGreaterThan(3);
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1];
      const current = steps[index];
      expect(current.page).toBeGreaterThanOrEqual(previous.page);
      if (current.page === previous.page) expect(current.y).toBeLessThan(previous.y);
    }
    insideContent(manual, steps);
  }, 40_000);

  it("splits one long multi-paragraph item and its nested list without losing text", async () => {
    const paragraphs = Array.from({ length: 14 }, (_, index) =>
      `    LONG_${String(index + 1).padStart(2, "0")} ${"Keep the cue's recorded timing when adjusting the selected fixture. ".repeat(3)}`);
    paragraphs.splice(7, 0, "    - NESTED_ALPHA Check the selected head.\n    - NESTED_BETA Release Highlight.");
    const manual = await print(`${filler(3)}\n\n1. ITEM_START\n\n${paragraphs.join("\n\n")}\n\n2. ITEM_END`);
    const start = once(manual, "ITEM_START");
    const end = once(manual, "ITEM_END");
    expect(start.page).toBe(once(manual, "FILLER_03").page);
    expect(end.page).toBeGreaterThan(start.page);
    const markers = Array.from({ length: 14 }, (_, index) => once(manual, `LONG_${String(index + 1).padStart(2, "0")}`));
    markers.push(once(manual, "NESTED_ALPHA"), once(manual, "NESTED_BETA"), start, end);
    insideContent(manual, markers);
    insideContent(manual, manual.text.filter((item) => item.text !== "Pagination fixture" && !/^\d+ \/ \d+$/u.test(item.text)));
    expect(manual.text.filter((item) => item.text === "1.")).toHaveLength(1);
    expect(manual.text.filter((item) => item.text === "2.")).toHaveLength(1);
  }, 40_000);

  it("uses available space for more than eleven short table rows", async () => {
    const manual = await print(`${filler(1)}\n\n${table(Array.from({ length: 12 }, (_, index) => `| SHORT_${String(index + 1).padStart(2, "0")} | Ready |`))}\n\nAFTER_TABLE`);
    const before = once(manual, "FILLER_01");
    const rows = Array.from({ length: 12 }, (_, index) => once(manual, `SHORT_${String(index + 1).padStart(2, "0")}`));
    expect(rows.every((row) => row.page === before.page)).toBe(true);
    expect(once(manual, "AFTER_TABLE").page).toBe(before.page);
    insideContent(manual, rows);
  }, 40_000);

  it("repeats table headers at physical breaks and continues text after the last row", async () => {
    const count = 23;
    const rows = Array.from({ length: count }, (_, index) => {
      const token = `VARIABLE_${String(index + 1).padStart(2, "0")}`;
      const detail = Array.from({ length: 1 + index % 3 }, (_, line) => `Detail ${line + 1} for the selected fixture`).join("<br>");
      return `| ${token} | ${detail} |`;
    });
    const manual = await print(`${filler(4)}\n\n${table(rows)}\n\nAFTER_VARIABLE_TABLE`);
    const printedRows = Array.from({ length: count }, (_, index) => once(manual, `VARIABLE_${String(index + 1).padStart(2, "0")}`));
    expect(printedRows[0].page).toBe(once(manual, "FILLER_04").page);
    const tablePages = [...new Set(printedRows.map((row) => row.page))];
    expect(tablePages.length).toBeGreaterThan(1);
    for (const page of tablePages) {
      const headers = positions(manual, "ROW_HEADER").filter((item) => item.page === page);
      const details = positions(manual, "DETAIL_HEADER").filter((item) => item.page === page);
      expect(headers, `Header on table page ${page}`).toHaveLength(1);
      expect(details, `Second header on table page ${page}`).toHaveLength(1);
      for (const row of printedRows.filter((item) => item.page === page)) expect(headers[0].y).toBeGreaterThan(row.y);
    }
    const last = printedRows.at(-1)!;
    const after = once(manual, "AFTER_VARIABLE_TABLE");
    expect(after.page).toBe(last.page);
    expect(after.y).toBeLessThan(last.y);
    insideContent(manual, [...printedRows, after, ...positions(manual, "ROW_HEADER"), ...positions(manual, "DETAIL_HEADER")]);
  }, 40_000);

  it("continues an oversized table row without clipping or dropping its cell content", async () => {
    const tokens = Array.from({ length: 65 }, (_, index) => `TALL_${String(index + 1).padStart(2, "0")}`);
    const manual = await print(`${filler(2)}\n\n${table([`| TALL_ROW | ${tokens.join("<br>")} |`])}\n\nAFTER_TALL_ROW`);
    const printed = tokens.map((token) => once(manual, token));
    expect(printed.at(-1)!.page).toBeGreaterThan(printed[0].page);
    expect(once(manual, "AFTER_TALL_ROW").page).toBeGreaterThanOrEqual(printed.at(-1)!.page);
    insideContent(manual, printed);
  }, 40_000);

  it("keeps a heading with the first part of a list without moving the whole list", async () => {
    const manual = await print(`${filler(16)}\n\n### Boundary heading\n\n${orderedItems(28, "HEADING_STEP")}`);
    const heading = once(manual, "Boundary heading");
    const first = once(manual, "HEADING_STEP_01");
    const last = once(manual, "HEADING_STEP_28");
    expect(heading.page).toBe(first.page);
    expect(heading.y).toBeGreaterThan(first.y);
    expect(last.page).toBeGreaterThan(first.page);
    insideContent(manual, [heading, first, last]);
  }, 40_000);
});
