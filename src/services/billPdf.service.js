const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const COLORS = {
  primary: "#4f46e5",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  stripe: "#f8fafc",
  danger: "#dc2626",
};

const MARGIN = 40;
const TABLE_COLS = [
  { key: "sr", label: "#", width: 28, align: "left" },
  { key: "name", label: "Item", width: 210, align: "left" },
  { key: "qty", label: "Qty", width: 55, align: "right" },
  { key: "rate", label: "Rate", width: 65, align: "right" },
  { key: "discount", label: "Disc.", width: 65, align: "right" },
  { key: "amount", label: "Amount", width: 92, align: "right" },
];

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

function drawTableHeader(doc, x, y, width) {
  doc.rect(x, y, width, 24).fill(COLORS.primary);
  let cx = x;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  TABLE_COLS.forEach((col) => {
    doc.text(col.label, cx + 6, y + 7, { width: col.width - 12, align: col.align });
    cx += col.width;
  });
  doc.fillColor(COLORS.text).font("Helvetica");
  return y + 24;
}

// Only used inside the item table loop — adds a page and redraws the table header.
function ensureRowSpace(doc, y, rowHeight, x, width) {
  const bottom = doc.page.height - doc.page.margins.bottom - 60; // leave room for footer
  if (y + rowHeight > bottom) {
    doc.addPage();
    return drawTableHeader(doc, x, doc.page.margins.top, width);
  }
  return y;
}

// Used outside the table (totals block) — just moves to a fresh page if needed.
function ensurePageSpace(doc, y, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed > bottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

function generateBillPdf(bill, res) {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  doc.pipe(res);

  const dairy = bill.dairy && typeof bill.dairy === "object" ? bill.dairy : null;
  const pageWidth = doc.page.width - MARGIN * 2;

  if (HAS_LOGO) {
    try {
      doc.image(LOGO_PATH, MARGIN, MARGIN, { width: 54, height: 54 });
    } catch (_) {
      // logo optional — ignore rendering failure and continue with text header
    }
  }
  const textX = MARGIN + 66;
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(COLORS.text)
    .text(dairy?.name || "Murli Milk Dairy", textX, MARGIN, { width: pageWidth - 66 - 130 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text([dairy?.address, dairy?.mobile ? `Mobile: ${dairy.mobile}` : null].filter(Boolean).join("   |   "), textX, MARGIN + 21, {
      width: pageWidth - 66 - 130,
    });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.primary).text("SALES RECEIPT", MARGIN, MARGIN + 2, { width: pageWidth, align: "right" });

  let y = MARGIN + 68;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).strokeColor(COLORS.border).lineWidth(1).stroke();
  y += 14;

  const billDate = new Date(bill.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text).text(`Bill No: ${bill.billNo}`, MARGIN, y);
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted).text(`Date: ${billDate}`, MARGIN, y + 15);
  if (bill.status === "cancelled") {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLORS.danger).text("CANCELLED", MARGIN, y + 30);
  }

  const custX = MARGIN + pageWidth / 2;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(`Customer: ${bill.customerName || "Walk-in Customer"}`, custX, y, { width: pageWidth / 2 });
  if (bill.customerMobile) {
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted).text(`Mobile: ${bill.customerMobile}`, custX, y + 15, { width: pageWidth / 2 });
  }

  y += 46;

  y = drawTableHeader(doc, MARGIN, y, pageWidth);
  doc.font("Helvetica").fontSize(9.5);

  bill.items.forEach((row, idx) => {
    const rowHeight = 22;
    y = ensureRowSpace(doc, y, rowHeight, MARGIN, pageWidth);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, y, pageWidth, rowHeight).fill(COLORS.stripe);
    }
    const itemName = row.item && typeof row.item === "object" ? row.item.name : "Item";
    const cells = [String(idx + 1), itemName, String(row.quantity), money(row.rate), money(row.discount || 0), money(row.amount)];
    let cx = MARGIN;
    TABLE_COLS.forEach((col, ci) => {
      doc.fillColor(COLORS.text).text(cells[ci], cx + 6, y + 6, { width: col.width - 12, align: col.align });
      cx += col.width;
    });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  });

  y += 16;

  const totalsWidth = 230;
  const totalsX = MARGIN + pageWidth - totalsWidth;
  const subtotal = bill.items.reduce((s, r) => s + r.amount, 0);
  const totalsRows = [["Subtotal", money(subtotal)]];
  if (bill.gstEnabled) totalsRows.push(["GST", money(bill.gstAmount)]);
  if (bill.roundOff) totalsRows.push(["Round Off", money(bill.roundOff)]);

  y = ensurePageSpace(doc, y, totalsRows.length * 16 + 100);

  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted);
  totalsRows.forEach(([label, value]) => {
    doc.text(label, totalsX, y, { width: totalsWidth - 90 });
    doc.text(value, totalsX + totalsWidth - 90, y, { width: 90, align: "right" });
    y += 16;
  });

  y += 4;
  doc.rect(totalsX, y, totalsWidth, 30).fill(COLORS.primary);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12);
  doc.text("Grand Total", totalsX + 10, y + 8, { width: totalsWidth - 100 });
  doc.text(money(bill.grandTotal), totalsX + totalsWidth - 100, y + 8, { width: 90, align: "right" });
  y += 42;

  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted);
  doc.text(`Payment Mode: ${bill.paymentMode}`, totalsX, y, { width: totalsWidth, align: "left" });
  y += 14;
  doc.text(`Paid: ${money(bill.paidAmount)}`, totalsX, y, { width: totalsWidth, align: "left" });
  if (bill.balance) {
    y += 14;
    doc
      .fillColor(bill.balance > 0 ? COLORS.danger : COLORS.muted)
      .text(`Balance Due: ${money(bill.balance)}`, totalsX, y, { width: totalsWidth, align: "left" });
  }

  // Writing this close to the bottom edge would normally trigger pdfkit's
  // automatic page-break — disable it for this one write, then restore.
  doc.page.margins.bottom = 0;
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text("Thank you for your business!", MARGIN, doc.page.height - MARGIN - 20, { width: pageWidth, align: "center", lineBreak: false });
  doc.page.margins.bottom = MARGIN;

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN, { width: pageWidth, align: "right", lineBreak: false });
    doc.page.margins.bottom = MARGIN;
  }

  doc.end();
}

module.exports = { generateBillPdf };
