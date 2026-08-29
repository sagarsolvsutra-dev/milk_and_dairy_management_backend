const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");
const HAS_LOGO = fs.existsSync(LOGO_PATH);

// pdfkit's built-in Helvetica etc. use a legacy PDF encoding that can't
// represent the Rupee sign (U+20B9) or the ★/❀ marks — an embedded Unicode
// font would render them, but at the cost of bundling a font file, so this
// receipt sticks to the standard 14 PDF fonts and "Rs." instead.
const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_ITALIC = "Helvetica-Oblique";
const FONT_BOLD_ITALIC = "Helvetica-BoldOblique";

const COLORS = {
  primary: "#4f46e5",
  primarySoft: "#eef2ff",
  text: "#1e293b",
  muted: "#64748b",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  stripe: "#f8fafc",
  danger: "#dc2626",
};

const MARGIN = 40;
const TABLE_COLS = [
  { key: "sr", label: "#", width: 24, align: "left" },
  { key: "name", label: "Item Description", width: 186, align: "left" },
  { key: "qty", label: "Qty", width: 45, align: "right" },
  { key: "rate", label: "Rate", width: 60, align: "right" },
  { key: "discount", label: "Discount", width: 60, align: "right" },
  { key: "tax", label: "Tax", width: 55, align: "right" },
  { key: "amount", label: "Amount", width: 85, align: "right" },
];

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

// Indian numbering (lakh/crore) amount-in-words — printed on the receipt so
// the total is unambiguous even if a figure gets smudged or misread.
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}
function threeDigitWords(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return (hundred ? `${ONES[hundred]} Hundred${rest ? " " : ""}` : "") + (rest ? twoDigitWords(rest) : "");
}
function numberToWords(num) {
  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;
  const parts = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(" ").trim();
}
function amountInWords(amount) {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = `Rupees ${numberToWords(rupees) || "Zero"}`;
  if (paise) words += ` and ${numberToWords(paise)} Paise`;
  return `${words} Only`;
}

// Small solid-circle markers stand in for location/phone icons — pdfkit's
// standard fonts don't carry emoji glyphs, so drawing a shape is safer than
// printing a character that might come out as a missing-glyph box.
function drawDot(doc, x, y, color) {
  doc.circle(x, y, 2.2).fill(color);
}

function drawTableHeader(doc, x, y, width) {
  doc.rect(x, y, width, 24).fill(COLORS.primary);
  let cx = x;
  doc.font(FONT_BOLD).fontSize(8.5).fillColor("#ffffff");
  TABLE_COLS.forEach((col) => {
    doc.text(col.label, cx + 6, y + 8, { width: col.width - 12, align: col.align });
    cx += col.width;
  });
  doc.fillColor(COLORS.text).font(FONT_REGULAR);
  return y + 24;
}

// Only used inside the item table loop — adds a page and redraws the table header.
function ensureRowSpace(doc, y, rowHeight, x, width) {
  const bottom = doc.page.height - doc.page.margins.bottom - 60;
  if (y + rowHeight > bottom) {
    doc.addPage();
    return drawTableHeader(doc, x, doc.page.margins.top, width);
  }
  return y;
}

// Used outside the table — just moves to a fresh page if needed.
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

  // ---------- Header ----------
  if (HAS_LOGO) {
    try {
      doc.image(LOGO_PATH, MARGIN, MARGIN, { width: 52, height: 52 });
    } catch (_) {
      // logo optional — ignore rendering failure and continue with text header
    }
  }
  const textX = MARGIN + 64;
  const headerRightWidth = 190;
  doc
    .font(FONT_BOLD)
    .fontSize(19)
    .fillColor(COLORS.text)
    .text(dairy?.name || "Murli Milk Dairy", textX, MARGIN, { width: pageWidth - 64 - headerRightWidth });

  let infoY = MARGIN + 25;
  if (dairy?.address) {
    drawDot(doc, textX + 3, infoY + 4.5, COLORS.primary);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.muted).text(dairy.address, textX + 12, infoY, { width: pageWidth - 76 - headerRightWidth });
    infoY += 14;
  }
  if (dairy?.mobile) {
    drawDot(doc, textX + 3, infoY + 4.5, COLORS.primary);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.muted).text(dairy.mobile, textX + 12, infoY, { width: pageWidth - 76 - headerRightWidth });
  }

  // "SALES RECEIPT" flanked by short rules, top-right
  const receiptLabel = "SALES RECEIPT";
  doc.font(FONT_BOLD).fontSize(14);
  const labelWidth = doc.widthOfString(receiptLabel);
  const receiptBoxRight = MARGIN + pageWidth;
  const receiptBoxY = MARGIN + 4;
  const ruleWidth = 22;
  const gap = 8;
  const labelX = receiptBoxRight - labelWidth - ruleWidth - gap;
  doc
    .moveTo(labelX - gap, receiptBoxY + 6)
    .lineTo(labelX - gap - ruleWidth, receiptBoxY + 6)
    .strokeColor(COLORS.primary)
    .lineWidth(1.2)
    .stroke();
  doc.fillColor(COLORS.primary).text(receiptLabel, labelX, receiptBoxY, { width: labelWidth, lineBreak: false });
  doc
    .moveTo(labelX + labelWidth + gap, receiptBoxY + 6)
    .lineTo(labelX + labelWidth + gap + ruleWidth, receiptBoxY + 6)
    .strokeColor(COLORS.primary)
    .lineWidth(1.2)
    .stroke();

  let y = MARGIN + 62;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).strokeColor(COLORS.border).lineWidth(1).stroke();
  y += 14;

  // ---------- Bill meta (two columns) ----------
  const billDate = new Date(bill.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const metaLeftX = MARGIN;
  const metaRightX = MARGIN + pageWidth / 2;
  // A `continued: true` run wraps within the width given to its FIRST call —
  // that width has to fit the whole "Label : value" line, not just the label,
  // or the value spills onto a second line and collides with the row below it.
  const metaColWidth = pageWidth / 2 - 20;

  doc.font(FONT_BOLD).fontSize(9.5).fillColor(COLORS.text);
  doc.text("Bill No.", metaLeftX, y, { width: metaColWidth, continued: true, lineBreak: false });
  doc.font(FONT_REGULAR).fillColor(COLORS.muted).text(` : ${bill.billNo}`, { lineBreak: false });
  doc
    .font(FONT_BOLD)
    .fillColor(COLORS.text)
    .text("Date", metaLeftX, y + 16, { width: metaColWidth, continued: true, lineBreak: false });
  doc.font(FONT_REGULAR).fillColor(COLORS.muted).text(` : ${billDate}`, { lineBreak: false });

  doc
    .font(FONT_BOLD)
    .fillColor(COLORS.text)
    .text("Customer", metaRightX, y, { width: metaColWidth, continued: true, lineBreak: false });
  doc.font(FONT_REGULAR).fillColor(COLORS.muted).text(` : ${bill.customerName || "Walk-in Customer"}`, { lineBreak: false });
  if (bill.customerMobile) {
    doc
      .font(FONT_BOLD)
      .fillColor(COLORS.text)
      .text("Mobile", metaRightX, y + 16, { width: metaColWidth, continued: true, lineBreak: false });
    doc.font(FONT_REGULAR).fillColor(COLORS.muted).text(` : ${bill.customerMobile}`, { lineBreak: false });
  }
  if (bill.status === "cancelled") {
    doc.font(FONT_BOLD).fontSize(9.5).fillColor(COLORS.danger).text("CANCELLED", metaLeftX, y + 32);
  }

  y += 50;

  // ---------- Item table ----------
  y = drawTableHeader(doc, MARGIN, y, pageWidth);
  doc.font(FONT_REGULAR).fontSize(9);

  let qtyTotal = 0;
  let amountTotal = 0;
  bill.items.forEach((row, idx) => {
    const rowHeight = 22;
    y = ensureRowSpace(doc, y, rowHeight, MARGIN, pageWidth);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, y, pageWidth, rowHeight).fill(COLORS.stripe);
    }
    const itemName = row.item && typeof row.item === "object" ? row.item.name : "Item";
    const cells = [
      String(idx + 1),
      itemName,
      String(row.quantity),
      money(row.rate),
      money(row.discount || 0),
      money(row.tax || 0),
      money(row.amount),
    ];
    let cx = MARGIN;
    TABLE_COLS.forEach((col, ci) => {
      doc.fillColor(COLORS.text).text(cells[ci], cx + 6, y + 6, { width: col.width - 12, align: col.align });
      cx += col.width;
    });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth, y).strokeColor(COLORS.borderLight).lineWidth(0.5).stroke();
    qtyTotal += row.quantity;
    amountTotal += row.amount;
  });

  // Total row inside the table — quantity and net-of-discount amount, the
  // same two figures a cashier would want to sanity-check against the items above.
  const totalRowHeight = 24;
  y = ensureRowSpace(doc, y, totalRowHeight, MARGIN, pageWidth);
  doc.rect(MARGIN, y, pageWidth, totalRowHeight).fill(COLORS.primarySoft);
  doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.text);
  doc.text("Total", MARGIN + TABLE_COLS[0].width + 6, y + 7, { width: TABLE_COLS[1].width - 12, align: "left" });
  let totalCx = MARGIN + TABLE_COLS[0].width + TABLE_COLS[1].width;
  doc.text(String(qtyTotal), totalCx + 6, y + 7, { width: TABLE_COLS[2].width - 12, align: "right" });
  totalCx += TABLE_COLS[2].width + TABLE_COLS[3].width + TABLE_COLS[4].width + TABLE_COLS[5].width;
  doc.text(money(amountTotal), totalCx + 6, y + 7, { width: TABLE_COLS[6].width - 12, align: "right" });
  y += totalRowHeight + 16;

  // ---------- Summary box (bordered mini-table, right-aligned) ----------
  const subtotal = bill.items.reduce((s, r) => s + r.quantity * r.rate, 0);
  const discountTotal = bill.items.reduce((s, r) => s + (r.discount || 0), 0);

  const summaryRows = [
    ["Subtotal", money(subtotal)],
    ["Discount", money(discountTotal)],
    ["Tax", money(bill.gstAmount)],
  ];
  if (bill.roundOff) summaryRows.push(["Round Off", money(bill.roundOff)]);
  summaryRows.push(["Grand Total", money(bill.grandTotal)]);
  summaryRows.push(["Payment Mode", bill.paymentMode]);
  summaryRows.push(["Paid Amount", money(bill.paidAmount)]);
  summaryRows.push(["Balance", money(bill.balance)]);

  const summaryWidth = 260;
  const summaryX = MARGIN + pageWidth - summaryWidth;
  const summaryRowHeight = 20;
  const summaryHeight = summaryRows.length * summaryRowHeight;
  y = ensurePageSpace(doc, y, summaryHeight + 20);

  doc.rect(summaryX, y, summaryWidth, summaryHeight).strokeColor(COLORS.border).lineWidth(1).stroke();
  const summaryStartY = y;
  summaryRows.forEach(([label, value], i) => {
    const rowY = summaryStartY + i * summaryRowHeight;
    const isGrandTotal = label === "Grand Total";
    const isBalanceDue = label === "Balance" && bill.balance > 0;
    if (isGrandTotal) doc.rect(summaryX, rowY, summaryWidth, summaryRowHeight).fill(COLORS.primary);
    if (i > 0) {
      doc
        .moveTo(summaryX, rowY)
        .lineTo(summaryX + summaryWidth, rowY)
        .strokeColor(COLORS.borderLight)
        .lineWidth(0.5)
        .stroke();
    }
    const labelColor = isGrandTotal ? "#ffffff" : COLORS.muted;
    const valueColor = isGrandTotal ? "#ffffff" : isBalanceDue ? COLORS.danger : COLORS.text;
    doc
      .font(isGrandTotal ? FONT_BOLD : FONT_REGULAR)
      .fontSize(isGrandTotal ? 11 : 9.5)
      .fillColor(labelColor)
      .text(label, summaryX + 10, rowY + (isGrandTotal ? 6 : 5.5), { width: summaryWidth / 2 - 14 });
    doc
      .font(FONT_BOLD)
      .fillColor(valueColor)
      .text(value, summaryX + summaryWidth / 2, rowY + (isGrandTotal ? 6 : 5.5), { width: summaryWidth / 2 - 10, align: "right" });
  });
  y = summaryStartY + summaryHeight + 20;

  // ---------- Amount in words + thank-you (dashed border box) ----------
  const bottomBoxHeight = 62;
  y = ensurePageSpace(doc, y, bottomBoxHeight + 30);
  doc.dash(3, { space: 2 });
  doc.rect(MARGIN, y, pageWidth, bottomBoxHeight).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.undash();

  const wordsColWidth = pageWidth * 0.5;
  doc
    .font(FONT_BOLD)
    .fontSize(9)
    .fillColor(COLORS.primary)
    .text("Amount in Words :", MARGIN + 14, y + 14, { width: wordsColWidth - 24 });
  doc
    .font(FONT_REGULAR)
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(amountInWords(bill.grandTotal), MARGIN + 14, y + 28, { width: wordsColWidth - 24 });

  const thanksX = MARGIN + wordsColWidth;
  const thanksWidth = pageWidth - wordsColWidth;
  doc
    .font(FONT_BOLD_ITALIC)
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Thank You!", thanksX, y + 10, { width: thanksWidth * 0.55, align: "center" });
  doc
    .font(FONT_ITALIC)
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("We look forward to serve you again.", thanksX, y + 24, { width: thanksWidth * 0.55, align: "center" });

  const sigX = thanksX + thanksWidth * 0.55;
  const sigWidth = thanksWidth * 0.45;
  doc
    .moveTo(sigX + 10, y + 42)
    .lineTo(sigX + sigWidth - 10, y + 42)
    .strokeColor(COLORS.border)
    .lineWidth(0.75)
    .stroke();
  doc
    .font(FONT_REGULAR)
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text("Authorized Signature", sigX, y + 46, { width: sigWidth, align: "center" });

  y += bottomBoxHeight + 18;

  // ---------- Footer: "Visit Again" ----------
  y = ensurePageSpace(doc, y, 20);
  const footerLabel = "Visit Again";
  doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.primary);
  const footerLabelWidth = doc.widthOfString(footerLabel);
  const footerCenter = MARGIN + pageWidth / 2;
  const footerRule = 60;
  doc
    .moveTo(footerCenter - footerLabelWidth / 2 - 14, y + 5)
    .lineTo(footerCenter - footerLabelWidth / 2 - 14 - footerRule, y + 5)
    .strokeColor(COLORS.borderLight)
    .lineWidth(0.75)
    .stroke();
  doc.text(footerLabel, footerCenter - footerLabelWidth / 2, y, { width: footerLabelWidth, lineBreak: false });
  doc
    .moveTo(footerCenter + footerLabelWidth / 2 + 14, y + 5)
    .lineTo(footerCenter + footerLabelWidth / 2 + 14 + footerRule, y + 5)
    .strokeColor(COLORS.borderLight)
    .lineWidth(0.75)
    .stroke();

  // ---------- Page numbers ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN, { width: pageWidth, align: "right", lineBreak: false });
    doc.page.margins.bottom = MARGIN;
  }

  doc.end();
}

module.exports = { generateBillPdf };
