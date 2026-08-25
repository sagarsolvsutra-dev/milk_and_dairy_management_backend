const mongoose = require("mongoose");
const { dateRangeFilter } = require("../utils/dateRangeFilter");
const PurchaseEntry = require("../models/PurchaseEntry.model");
const Vendor = require("../models/Vendor.model");
const VendorLedgerEntry = require("../models/VendorLedgerEntry.model");
const MilkStock = require("../models/MilkStock.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const { moveMilkStock } = require("../services/stock.service");

exports.createPurchase = asyncHandler(async (req, res) => {
  const { date, billNo, vendor, quantity, unit, rate, fatDegree, otherCharges = 0, paidAmount = 0, paymentMode, dueDate, remark } = req.body;

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw new ApiError(404, "Vendor not found");

  const totalAmount = Number(quantity) * Number(rate);
  const netPayable = totalAmount + Number(otherCharges);
  const balance = netPayable - Number(paidAmount);

  const finalBillNo = billNo || (await nextSequence("purchase", "PUR-"));

  const purchase = await PurchaseEntry.create({
    date: date || new Date(),
    billNo: finalBillNo,
    vendor,
    quantity,
    unit,
    rate,
    fatDegree,
    totalAmount,
    otherCharges,
    netPayable,
    paidAmount,
    balance,
    paymentMode,
    dueDate,
    remark,
    createdBy: req.user._id,
  });

  vendorDoc.currentBalance += netPayable - Number(paidAmount);
  await vendorDoc.save();

  await VendorLedgerEntry.create({
    vendor: vendorDoc._id,
    date: purchase.date,
    particulars: `Milk Purchase — Bill ${finalBillNo}`,
    credit: netPayable,
    debit: paidAmount || 0,
    balanceAfter: vendorDoc.currentBalance,
    refModel: "PurchaseEntry",
    refId: purchase._id,
  });

  await moveMilkStock({
    quantity: Number(quantity),
    transactionType: "purchase",
    refModel: "PurchaseEntry",
    refId: purchase._id,
    remark: `Purchase from vendor ${vendorDoc.name}`,
    createdBy: req.user._id,
  });

  res.status(201).json(new ApiResponse(201, purchase, "Purchase entry saved successfully"));
});

exports.getPurchases = asyncHandler(async (req, res) => {
  const { search, vendor, from, to, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (vendor) filter.vendor = new mongoose.Types.ObjectId(vendor);
  if (from || to) filter.date = dateRangeFilter(from, to);
  if (search) {
    const matchingVendors = await Vendor.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const vendorIds = matchingVendors.map((v) => v._id);

    filter.$or = [
      { billNo: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { paymentMode: { $regex: search, $options: "i" } },
      { vendor: { $in: vendorIds } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total, summaryAgg] = await Promise.all([
    PurchaseEntry.find(filter)
      .populate("vendor", "name mobile")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    PurchaseEntry.countDocuments(filter),
    // Summary cards reflect only active entries — a cancelled purchase's
    // amount was already reversed off the vendor ledger, so it shouldn't
    // count toward "pending".
    PurchaseEntry.aggregate([
      { $match: { ...filter, status: "active" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalNetPayable: { $sum: "$netPayable" },
          totalPaid: { $sum: "$paidAmount" },
          totalBalance: { $sum: "$balance" },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0]
    ? {
        count: summaryAgg[0].count,
        totalQuantity: summaryAgg[0].totalQuantity,
        totalNetPayable: summaryAgg[0].totalNetPayable,
        totalPaid: summaryAgg[0].totalPaid,
        totalBalance: summaryAgg[0].totalBalance,
      }
    : { count: 0, totalQuantity: 0, totalNetPayable: 0, totalPaid: 0, totalBalance: 0 };

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, summary }));
});

exports.getPurchase = asyncHandler(async (req, res) => {
  const purchase = await PurchaseEntry.findById(req.params.id).populate("vendor").lean();
  if (!purchase) throw new ApiError(404, "Purchase entry not found");
  res.status(200).json(new ApiResponse(200, purchase));
});

exports.updatePurchase = asyncHandler(async (req, res) => {
  const { date, vendor, quantity, unit, rate, fatDegree, otherCharges = 0, paidAmount = 0, paymentMode, dueDate, remark } = req.body;

  const purchase = await PurchaseEntry.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase entry not found");
  if (purchase.status === "cancelled") throw new ApiError(400, "Cannot edit a cancelled purchase entry");

  const newVendorId = vendor ? String(vendor) : String(purchase.vendor);
  const vendorChanged = newVendorId !== String(purchase.vendor);

  const oldVendorDoc = await Vendor.findById(purchase.vendor);
  if (!oldVendorDoc) throw new ApiError(404, "Original vendor not found");

  let newVendorDoc = oldVendorDoc;
  if (vendorChanged) {
    newVendorDoc = await Vendor.findById(newVendorId);
    if (!newVendorDoc) throw new ApiError(404, "Vendor not found");
  }

  const newQuantity = Number(quantity);
  const newRate = Number(rate);
  const newOtherCharges = Number(otherCharges) || 0;
  const newPaidAmount = Number(paidAmount) || 0;
  const newTotalAmount = newQuantity * newRate;
  const newNetPayable = newTotalAmount + newOtherCharges;
  const newBalance = newNetPayable - newPaidAmount;

  if (!(newQuantity >= 0.01)) throw new ApiError(400, "Quantity must be greater than 0");
  if (!(newRate >= 0.01)) throw new ApiError(400, "Rate must be greater than 0");
  if (newOtherCharges < 0) throw new ApiError(400, "Other charges cannot be negative");
  if (newPaidAmount < 0) throw new ApiError(400, "Paid amount cannot be negative");
  if (newPaidAmount > newNetPayable) throw new ApiError(400, "Paid amount cannot exceed net payable");

  // Validate & mutate milk stock FIRST (most likely to fail — insufficient
  // stock if reducing quantity) so a failure here leaves nothing else touched.
  const quantityDelta = newQuantity - purchase.quantity;
  if (quantityDelta !== 0) {
    await moveMilkStock({
      quantity: quantityDelta,
      transactionType: "adjustment",
      refModel: "PurchaseEntry",
      refId: purchase._id,
      remark: `Purchase edited — Bill ${purchase.billNo} quantity ${purchase.quantity} to ${newQuantity} ${unit || purchase.unit}`,
      createdBy: req.user._id,
    });
  }

  // Reverse the original vendor-ledger effect, then reapply against the
  // (possibly new) vendor — mirrors the explicit reversal pattern used by
  // cancelPurchase. Skip entirely if nothing financial actually changed
  // (e.g. a remark-only edit), so the ledger doesn't collect no-op entries.
  const financialsChanged = vendorChanged || newNetPayable !== purchase.netPayable || newPaidAmount !== purchase.paidAmount;
  if (financialsChanged) {
    oldVendorDoc.currentBalance -= purchase.netPayable - purchase.paidAmount;
    await oldVendorDoc.save({ validateModifiedOnly: true });
    await VendorLedgerEntry.create({
      vendor: oldVendorDoc._id,
      date: new Date(),
      particulars: `Purchase Edited — reversing original Bill ${purchase.billNo}`,
      debit: purchase.netPayable,
      credit: purchase.paidAmount,
      balanceAfter: oldVendorDoc.currentBalance,
      refModel: "PurchaseEntry",
      refId: purchase._id,
    });

    newVendorDoc.currentBalance += newNetPayable - newPaidAmount;
    await newVendorDoc.save({ validateModifiedOnly: true });
    await VendorLedgerEntry.create({
      vendor: newVendorDoc._id,
      date: date || purchase.date,
      particulars: `Milk Purchase (edited) — Bill ${purchase.billNo}`,
      credit: newNetPayable,
      debit: newPaidAmount,
      balanceAfter: newVendorDoc.currentBalance,
      refModel: "PurchaseEntry",
      refId: purchase._id,
    });
  }

  purchase.date = date || purchase.date;
  purchase.vendor = newVendorId;
  purchase.quantity = newQuantity;
  purchase.unit = unit || purchase.unit;
  purchase.rate = newRate;
  purchase.fatDegree = fatDegree === "" || fatDegree === undefined ? purchase.fatDegree : fatDegree;
  purchase.totalAmount = newTotalAmount;
  purchase.otherCharges = newOtherCharges;
  purchase.netPayable = newNetPayable;
  purchase.paidAmount = newPaidAmount;
  purchase.balance = newBalance;
  purchase.paymentMode = paymentMode || purchase.paymentMode;
  purchase.dueDate = dueDate || null;
  purchase.remark = remark;
  await purchase.save({ validateModifiedOnly: true });

  res.status(200).json(new ApiResponse(200, purchase, "Purchase entry updated"));
});

exports.cancelPurchase = asyncHandler(async (req, res) => {
  // Atomically claim the cancel — the first request to flip status "active" ->
  // "cancelled" wins; a concurrent duplicate request gets null back here and
  // stops before touching the ledger or stock, instead of both racing past a
  // findById-then-save check and double-reversing them.
  const purchase = await PurchaseEntry.findOneAndUpdate(
    { _id: req.params.id, status: "active" },
    { status: "cancelled" },
    { new: false }
  );
  if (!purchase) {
    const exists = await PurchaseEntry.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, "Purchase entry not found");
    throw new ApiError(400, "Purchase entry already cancelled");
  }

  try {
    // If this milk has already been used in production, we can't reverse it —
    // catching that here rolls the claim back below instead of leaving the
    // record cancelled with nothing actually reversed.
    const milkStock = await MilkStock.findOne({ key: "central" });
    const availableMilk = milkStock?.currentQty || 0;
    if (availableMilk < purchase.quantity) {
      throw new ApiError(
        400,
        `Cannot cancel — only ${availableMilk} KG of milk remains in stock, but this purchase added ${purchase.quantity} KG (the rest has already been used in production)`
      );
    }

    const vendorDoc = await Vendor.findById(purchase.vendor);
    vendorDoc.currentBalance -= purchase.netPayable - purchase.paidAmount;
    await vendorDoc.save({ validateModifiedOnly: true });

    await VendorLedgerEntry.create({
      vendor: vendorDoc._id,
      date: new Date(),
      particulars: `Purchase Cancelled — Bill ${purchase.billNo}`,
      debit: purchase.netPayable,
      credit: purchase.paidAmount,
      balanceAfter: vendorDoc.currentBalance,
      refModel: "PurchaseEntry",
      refId: purchase._id,
    });

    await moveMilkStock({
      quantity: -purchase.quantity,
      transactionType: "adjustment",
      refModel: "PurchaseEntry",
      refId: purchase._id,
      remark: `Reversal — Purchase cancelled (Bill ${purchase.billNo})`,
      createdBy: req.user._id,
    });
  } catch (err) {
    await PurchaseEntry.findByIdAndUpdate(purchase._id, { status: "active" });
    throw err;
  }

  const updated = await PurchaseEntry.findById(purchase._id);
  res.status(200).json(new ApiResponse(200, updated, "Purchase entry cancelled"));
});
