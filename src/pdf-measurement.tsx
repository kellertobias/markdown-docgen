import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";

export interface BlockMeasurement {
  width: number;
  content: React.ReactNode;
}

// Render each candidate at its real content width without pagination. The end destination records
// its height even when the block is taller than a normal page. No estimated text or row budgets
// decide whether a block is allowed to split in the final document.
export async function measureBlocks(blocks: BlockMeasurement[], pageHeight: number): Promise<number[]> {
  if (!blocks.length) return [];
  const bytes = await renderToBuffer(<Document>
    {blocks.map((block, index) => <Page
      key={index}
      size={[block.width, pageHeight]}
      wrap={false}
      style={{ fontFamily: "Helvetica", fontSize: 9.1, lineHeight: 1.38, padding: 0 }}
    >
      {block.content}
      <Text id={`measurement-${index}`} style={{ fontSize: 1, lineHeight: 1 }}>.</Text>
    </Page>)}
  </Document>);
  const pdf = await PDFDocument.load(bytes);
  const heights = new Map<string, number>();
  const names = pdf.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  const visit = (node: PDFDict | undefined): void => {
    if (!node) return;
    const entries = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (entries) {
      for (let index = 0; index + 1 < entries.size(); index += 2) {
        const name = entries.get(index);
        const key = name instanceof PDFHexString ? name.decodeText() : name instanceof PDFString ? name.asString() : undefined;
        const y = entries.lookup(index + 1, PDFArray).get(3);
        if (key && y instanceof PDFNumber) heights.set(key, y.asNumber());
      }
    }
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    for (let index = 0; index < (kids?.size() ?? 0); index += 1) visit(kids!.lookup(index, PDFDict));
  };
  visit(names);
  return blocks.map((_, index) => {
    const end = heights.get(`measurement-${index}`);
    if (end === undefined || !Number.isFinite(end)) throw new Error(`Could not measure PDF block ${index}`);
    return pdf.getPage(index).getHeight() - end;
  });
}
