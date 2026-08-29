const mongoose = require("mongoose");
const Bill = require("../models/Bill.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const Item = require("../models/Item.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const { moveDairyItemStock } = require("../services/stock.service");
const { generateBillPdf } = require("../services/billPdf.service");
const { dateRangeFilter } = require("../utils/dateRangeFilter");
const { escapeRegex } = require("../utils/escapeRegex");

// req.body is undefined (not {}) on a bodyless GET under Express 5 — guard it
// rather than assume every request carries a parsed body.
const resolveDairyId = (req) => (req.user.role === "dairy_user" ? String(req.user.dairy) : req.body?.dairy || req.query.dairy);

exports.createBill = asyncHandler(async (req, res) => {
  const dairy = resolveDairyId(req);
  if (!dairy) throw new ApiError(400, "Dairy is required");

  const { date, customerName, customerMobile, items = [], gstEnabled = false, roundOff = 0, paymentMode, paidAmount = 0 } = req.body;
  if (!items.length) throw new ApiError(400, "Add at least one item to the bill");

  // GST is derived from each item's own GST slab, never trusted from the
  // client — otherwise a request could send gstEnabled:false alongside a
  // non-zero gstAmount (or a negative one) and it would flow straight into
  // the total unchecked.
  const itemIds = [...new Set(items.map((row) => String(row.item)))];
  const itemDocs = await Item.find({ _id: { $in: itemIds } }).populate("gstSlab", "percent");
  const itemById = new Map(itemDocs.map((i) => [String(i._id), i]));

  let subtotal = 0;
  let gstAmount = 0;
  const computedItems = items.map((row, idx) => {
    const itemDoc = itemById.get(String(row.item));
    if (!itemDoc) throw new ApiError(404, `Item not found for row ${idx + 1}`);
    const quantity = Number(row.quantity);
    const rate = Number(row.rate);
    const discount = Number(row.discount) || 0;
    if (discount < 0) throw new ApiError(400, `Discount cannot be negative (row ${idx + 1})`);
    const amount = quantity * rate - discount;
    if (amount < 0) throw new ApiError(400, `Discount cannot exceed quantity × rate (row ${idx + 1})`);
    subtotal += amount;
    const tax = gstEnabled ? Math.round(((amount * (itemDoc.gstSlab?.percent || 0)) / 100) * 100) / 100 : 0;
    gstAmount += tax;
    return { ...row, quantity, rate, discount, amount, tax };
  });
  gstAmount = gstEnabled ? Math.round(gstAmount * 100) / 100 : 0;
  // Round-off exists to absorb paise-level rounding, not to be a second
  // unchecked total adjustment — clamp it to a sane range.
  const clampedRoundOff = Math.max(-1, Math.min(1, Number(roundOff) || 0));

  const grandTotal = subtotal + gstAmount + clampedRoundOff;
  const balance = grandTotal - Number(paidAmount);

  // Validate stock availability BEFORE creating anything — this MongoDB instance is
  // standalone (no replica set), so multi-document transactions aren't available.
  // Failing fast here avoids leaving an orphan Bill record if a stock move would fail.
  // Collapse repeated items into their combined requested quantity first — validating
  // row-by-row would let two rows for the same item each read the same unmutated
  // stock and both pass, even though together they exceed what's available.
  const requestedTotals = new Map();
  for (const row of computedItems) {
    const key = String(row.item);
    requestedTotals.set(key, (requestedTotals.get(key) || 0) + row.quantity);
  }
  for (const [itemId, totalQty] of requestedTotals) {
    const stock = await DairyItemStock.findOne({ dairy, item: itemId });
    const available = stock?.currentQty || 0;
    if (available < totalQty) {
      const item = itemById.get(itemId);
      throw new ApiError(
        400,
        `Insufficient stock for ${item?.name || "item"} — available: ${available}, requested: ${totalQty}`
      );
    }
  }

  const billNo = await nextSequence(`bill_${dairy}`, "");

  const bill = await Bill.create({
    date: date || new Date(),
    billNo,
    dairy,
    customerName,
    customerMobile,
    items: computedItems,
    gstEnabled,
    gstAmount,
    roundOff: clampedRoundOff,
    grandTotal,
    paymentMode,
    paidAmount,
    balance,
    createdBy: req.user._id,
  });

  for (const row of computedItems) {
    await moveDairyItemStock({
      dairy,
      item: row.item,
      quantity: -row.quantity,
      transactionType: "sale_out",
      refModel: "Bill",
      refId: bill._id,
      remark: `Sold — Bill ${billNo}`,
      createdBy: req.user._id,
    });
  }

  res.status(201).json(new ApiResponse(201, bill, "Bill saved successfully"));
});

exports.getBills = asyncHandler(async (req, res) => {
  const dairy = resolveDairyId(req);
  let { search, from, to, page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
  const filter = {};
  if (dairy) filter.dairy = new mongoose.Types.ObjectId(dairy);
  if (search) {
    const matchingItems = await Item.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const itemIds = matchingItems.map((i) => i._id);

    filter.$or = [
      { billNo: { $regex: search, $options: "i" } },
      { customerName: { $regex: search, $options: "i" } },
      { customerMobile: { $regex: search, $options: "i" } },
      { paymentMode: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { "items.item": { $in: itemIds } },
    ];
  }
  if (from || to) filter.date = dateRangeFilter(from, to);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total, summaryAgg] = await Promise.all([
    Bill.find(filter)
      .populate("dairy", "name code")
      .populate("items.item", "name code unit")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Bill.countDocuments(filter),
    // Summary cards reflect only active bills — a cancelled bill's amount was
    // already reversed off the dairy's stock, so it shouldn't count as "pending".
    Bill.aggregate([
      { $match: { ...filter, status: "active" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSales: { $sum: "$grandTotal" },
          totalPaid: { $sum: "$paidAmount" },
          totalBalance: { $sum: "$balance" },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0]
    ? {
        count: summaryAgg[0].count,
        totalSales: summaryAgg[0].totalSales,
        totalPaid: summaryAgg[0].totalPaid,
        totalBalance: summaryAgg[0].totalBalance,
      }
    : { count: 0, totalSales: 0, totalPaid: 0, totalBalance: 0 };

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, summary }));
});

exports.getBill = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === "dairy_user") filter.dairy = req.user.dairy;
  const bill = await Bill.findOne(filter).populate("dairy", "name code").populate("items.item", "name code unit").lean();
  if (!bill) throw new ApiError(404, "Bill not found");
  res.status(200).json(new ApiResponse(200, bill));
});

exports.downloadBillPdf = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === "dairy_user") filter.dairy = req.user.dairy;
  const bill = await Bill.findOne(filter).populate("dairy", "name code address mobile").populate("items.item", "name code unit").lean();
  if (!bill) throw new ApiError(404, "Bill not found");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Bill-${bill.billNo}.pdf"`);
  generateBillPdf(bill, res);
});

exports.cancelBill = asyncHandler(async (req, res) => {
  // Atomically claim the cancel — the first request to flip status "active" ->
  // "cancelled" wins; a concurrent duplicate request gets null back here and
  // stops before touching any stock, instead of both racing past a
  // findById-then-save check and double-reversing the stock. The dairy filter
  // (for a dairy_user) is part of the SAME atomic claim, so a branch account
  // can't cancel — or discover the existence/status of — another dairy's bill.
  const claimFilter = { _id: req.params.id, status: "active" };
  if (req.user.role === "dairy_user") claimFilter.dairy = req.user.dairy;

  const bill = await Bill.findOneAndUpdate(claimFilter, { status: "cancelled" }, { new: false });
  if (!bill) {
    const existsFilter = { _id: req.params.id };
    if (req.user.role === "dairy_user") existsFilter.dairy = req.user.dairy;
    const exists = await Bill.exists(existsFilter);
    if (!exists) throw new ApiError(404, "Bill not found");
    throw new ApiError(400, "Bill already cancelled");
  }

  try {
    for (const row of bill.items) {
      await moveDairyItemStock({
        dairy: bill.dairy,
        item: row.item,
        quantity: row.quantity,
        transactionType: "sale_cancel_in",
        refModel: "Bill",
        refId: bill._id,
        remark: `Reversal — Bill ${bill.billNo} cancelled`,
        createdBy: req.user._id,
      });
    }
  } catch (err) {
    await Bill.findByIdAndUpdate(bill._id, { status: "active" });
    throw err;
  }

  const updated = await Bill.findById(bill._id);
  res.status(200).json(new ApiResponse(200, updated, "Bill cancelled successfully"));
});
