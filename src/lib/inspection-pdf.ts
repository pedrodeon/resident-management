import "server-only";

import PDFDocument from "pdfkit";

/*
 * The inspection record as a self-contained PDF — the damage-liability
 * document. Layout only: the route loads the data and the image blobs; this
 * renders them. Read-only by construction (it never sees a writable client).
 *
 * Printable first: A4, Helvetica, near-black text, one navy accent rule.
 * Every timestamp is rendered in the building's timezone and says so.
 */

const TZ = "America/Chicago";
const NAVY = "#16264a";
const INK = "#11141b";
const MUTED = "#5c6577";
const LINE = "#d7dbe4";
const PAGE_W = 595.28; // A4 pt
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

export type PdfSignature = {
  role: "resident" | "ra";
  signedAt: string;
  signerName: string;
  png: Buffer | null; // null = image missing/undecodable; render a note
};

export type PdfPhoto = {
  itemName: string;
  jpeg: Buffer | null;
};

export type InspectionPdfData = {
  type: "move_in" | "move_out";
  residentName: string;
  studentId: string;
  roomNumber: string;
  hallwayName: string;
  term: string;
  inspectedAt: string;
  inspectorName: string;
  items: { name: string; condition: string; note: string | null }[];
  inspectionNote: string | null;
  photos: PdfPhoto[];
  signatures: PdfSignature[];
  waiver: { reason: string; recordedBy: string; recordedAt: string } | null;
};

function stamp(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  })} (Central Time)`;
}

export async function renderInspectionPdf(data: InspectionPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN + 18, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `Tudor Hall ${data.type === "move_in" ? "move-in" : "move-out"} inspection — Room ${data.roomNumber}`,
      Author: "Tudor Hall",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );

  const ensureRoom = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };

  // ---- Title block ---------------------------------------------------------
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("TUDOR HALL", { characterSpacing: 2 });
  doc
    .fontSize(20)
    .text(data.type === "move_in" ? "Move-in inspection record" : "Move-out inspection record");
  doc.moveDown(0.4);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_W, doc.y)
    .lineWidth(2)
    .strokeColor(NAVY)
    .stroke();
  doc.moveDown(0.8);

  // ---- Meta grid -----------------------------------------------------------
  const meta: [string, string][] = [
    ["Resident", data.residentName],
    ["Student ID", data.studentId],
    ["Room", `${data.hallwayName} · Room ${data.roomNumber}`],
    ["Term", data.term],
    ["Inspected", stamp(data.inspectedAt)],
    ["Conducted by", data.inspectorName],
  ];
  const colW = CONTENT_W / 2;
  const rowH = 30;
  const gridTop = doc.y;
  meta.forEach(([label, value], i) => {
    const x = MARGIN + (i % 2) * colW;
    const y = gridTop + Math.floor(i / 2) * rowH;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { characterSpacing: 1 });
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(value, x, y + 10, { width: colW - 12 });
  });
  doc.x = MARGIN;
  doc.y = gridTop + Math.ceil(meta.length / 2) * rowH + 6;

  // ---- Items table ---------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text("Condition by item");
  doc.moveDown(0.3);
  for (const item of data.items) {
    const noteHeight = item.note
      ? doc.font("Helvetica").fontSize(9).heightOfString(item.note, { width: CONTENT_W - 110 })
      : 0;
    ensureRoom(22 + noteHeight);
    const y = doc.y;
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(item.name, MARGIN, y, { width: CONTENT_W - 110 });
    const bad = item.condition === "damaged" || item.condition === "missing";
    doc
      .font(bad ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10.5)
      .fillColor(bad ? "#8a1f11" : INK)
      .text(item.condition.toUpperCase(), MARGIN + CONTENT_W - 100, y, { width: 100, align: "right" });
    if (item.note) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(item.note, MARGIN + 12, doc.y + 1, { width: CONTENT_W - 110 });
    }
    doc.y += 5;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y += 5;
    doc.x = MARGIN;
  }

  if (data.inspectionNote) {
    ensureRoom(50);
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text("Inspection notes");
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(data.inspectionNote, { width: CONTENT_W });
  }

  // ---- Photos --------------------------------------------------------------
  if (data.photos.length > 0) {
    ensureRoom(60);
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text("Photos");
    doc.moveDown(0.3);
    for (const photo of data.photos) {
      ensureRoom(200);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(photo.itemName, MARGIN, doc.y);
      doc.y += 2;
      if (photo.jpeg) {
        try {
          doc.image(photo.jpeg, MARGIN, doc.y, { fit: [260, 180] });
          doc.y += 186;
        } catch {
          doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED)
            .text("[Photo could not be embedded — stored image is available in the app.]");
          doc.y += 6;
        }
      } else {
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED)
          .text("[Photo could not be retrieved from storage.]");
        doc.y += 6;
      }
      doc.x = MARGIN;
    }
  }

  // ---- Signatures ----------------------------------------------------------
  ensureRoom(190);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text("Signatures", MARGIN, doc.y);
  doc.moveDown(0.3);
  const boxTop = doc.y;
  const boxW = (CONTENT_W - 16) / 2;
  const boxH = 150;

  const attestation = (role: "resident" | "ra") =>
    role === "resident"
      ? data.type === "move_in"
        ? "“I agree the recorded conditions are accurate.”"
        : "“I agree the recorded move-out conditions are accurate.”"
      : data.type === "move_in"
        ? "“I confirm I conducted this inspection.”"
        : "“I confirm I conducted this move-out inspection.”";

  const drawSignatureBox = (x: number, sig: PdfSignature) => {
    doc.rect(x, boxTop, boxW, boxH).lineWidth(0.75).strokeColor(LINE).stroke();
    const pad = 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK)
      .text(`${sig.role === "resident" ? "Resident" : "RA"} — ${sig.signerName}`, x + pad, boxTop + pad, { width: boxW - pad * 2 });
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
      .text(attestation(sig.role), x + pad, boxTop + pad + 13, { width: boxW - pad * 2 });
    if (sig.png) {
      try {
        doc.image(sig.png, x + pad, boxTop + 44, { fit: [boxW - pad * 2, 70] });
      } catch {
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED)
          .text("[Signature image could not be embedded.]", x + pad, boxTop + 70, { width: boxW - pad * 2 });
      }
    } else {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED)
        .text("[Signature image could not be retrieved.]", x + pad, boxTop + 70, { width: boxW - pad * 2 });
    }
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(`Signed ${stamp(sig.signedAt)}`, x + pad, boxTop + boxH - 18, { width: boxW - pad * 2 });
  };

  const drawWaiverBox = (x: number) => {
    const w = data.waiver!;
    doc.rect(x, boxTop, boxW, boxH).lineWidth(0.75).strokeColor(LINE).stroke();
    const pad = 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#8a1f11")
      .text("Resident did not sign", x + pad, boxTop + pad, { width: boxW - pad * 2 });
    doc.font("Helvetica").fontSize(9).fillColor(INK)
      .text("Recorded as unavailable / declined to sign. Reason:", x + pad, boxTop + pad + 14, { width: boxW - pad * 2 });
    doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(INK)
      .text(`“${w.reason}”`, x + pad, boxTop + pad + 40, { width: boxW - pad * 2 });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(`Recorded by ${w.recordedBy}, ${stamp(w.recordedAt)}`, x + pad, boxTop + boxH - 26, { width: boxW - pad * 2 });
  };

  const resident = data.signatures.find((s) => s.role === "resident");
  const ra = data.signatures.find((s) => s.role === "ra");
  if (resident) drawSignatureBox(MARGIN, resident);
  else if (data.waiver) drawWaiverBox(MARGIN);
  if (ra) drawSignatureBox(MARGIN + boxW + 16, ra);
  doc.y = boxTop + boxH + 10;
  doc.x = MARGIN;

  // ---- Footer on every page ------------------------------------------------
  const generated = new Date().toISOString();
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin normally triggers an automatic page
    // break — zero it out while stamping the footer.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(
      `${data.hallwayName} · Room ${data.roomNumber} · ${data.type === "move_in" ? "Move-in" : "Move-out"} inspection — generated ${stamp(generated)} from the Tudor Hall app`,
      MARGIN,
      y,
      { width: CONTENT_W - 60, lineBreak: false },
    );
    doc.text(`Page ${i + 1} of ${range.count}`, MARGIN + CONTENT_W - 60, y, {
      width: 60,
      align: "right",
      lineBreak: false,
    });
  }

  doc.end();
  return done;
}
