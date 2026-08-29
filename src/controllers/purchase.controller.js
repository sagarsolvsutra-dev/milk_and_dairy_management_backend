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
const { escapeRegex } = require("../utils/escapeRegex");

exports.createPurchase = asyncHandler(async (req, res) => {
  const { date, billNo, vendor, quantity, unit, rate, fatDegree, otherCharges = 0, paidAmount = 0, paymentMode, dueDate, remark } = req.body;

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw new ApiError(404, "Vendor not found");

  const totalAmount = Number(quantity) * Number(rate);
  const netPayable = totalAmount + Number(otherCharges);
  const balance = netPayable - Number(paidAmount);
  if (Number(paidAmount) > netPayable) throw new ApiError(400, "Paid amount cannot exceed net payable");

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

  const updatedVendor = await Vendor.findByIdAndUpdate(
    vendorDoc._id,
    { $inc: { currentBalance: netPayable - Number(paidAmount) } },
    { new: true }
  );

  await VendorLedgerEntry.create({
    vendor: updatedVendor._id,
    date: purchase.date,
    particulars: `Milk Purchase — Bill ${finalBillNo}`,
    credit: netPayable,
    debit: paidAmount || 0,
    balanceAfter: updatedVendor.currentBalance,
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
  let { search, vendor, from, to, page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
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

  try {
    // The common case is an edit against the SAME vendor — record just the net
    // change as one ledger entry ("what changed"), not a full reverse-then-
    // reapply pair. A full reverse/reapply is only actually needed when the
    // vendor itself changes, since that moves the purchase between two
    // genuinely separate ledger accounts that can't be netted into one row.
    if (vendorChanged) {
      const updatedOldVendor = await Vendor.findByIdAndUpdate(
        oldVendorDoc._id,
        { $inc: { currentBalance: -(purchase.netPayable - purchase.paidAmount) } },
        { new: true }
      );
      await VendorLedgerEntry.create({
        vendor: updatedOldVendor._id,
        date: new Date(),
        particulars: `Purchase Moved to Another Vendor — reversing Bill ${purchase.billNo}`,
        debit: purchase.netPayable,
        credit: purchase.paidAmount,
        balanceAfter: updatedOldVendor.currentBalance,
        refModel: "PurchaseEntry",
        refId: purchase._id,
      });

      const updatedNewVendor = await Vendor.findByIdAndUpdate(
        newVendorDoc._id,
        { $inc: { currentBalance: newNetPayable - newPaidAmount } },
        { new: true }
      );
      await VendorLedgerEntry.create({
        vendor: updatedNewVendor._id,
        date: date || purchase.date,
        particulars: `Milk Purchase (moved from another vendor) — Bill ${purchase.billNo}`,
        credit: newNetPayable,
        debit: newPaidAmount,
        balanceAfter: updatedNewVendor.currentBalance,
        refModel: "PurchaseEntry",
        refId: purchase._id,
      });
    } else {
      const balanceDelta = newNetPayable - newPaidAmount - (purchase.netPayable - purchase.paidAmount);
      if (balanceDelta !== 0) {
        const updatedVendor = await Vendor.findByIdAndUpdate(
          newVendorDoc._id,
          { $inc: { currentBalance: balanceDelta } },
          { new: true }
        );
        await VendorLedgerEntry.create({
          vendor: updatedVendor._id,
          date: date || purchase.date,
          particulars: `Purchase Edited — Bill ${purchase.billNo} (Net Payable ₹${purchase.netPayable.toFixed(2)} → ₹${newNetPayable.toFixed(2)})`,
          credit: balanceDelta > 0 ? balanceDelta : 0,
          debit: balanceDelta < 0 ? -balanceDelta : 0,
          balanceAfter: updatedVendor.currentBalance,
          refModel: "PurchaseEntry",
          refId: purchase._id,
        });
      }
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
    purchase.dueDate = dueDate !== undefined ? dueDate || null : purchase.dueDate;
    purchase.remark = remark;
    await purchase.save({ validateModifiedOnly: true });
  } catch (err) {
    // The stock move above already committed — if anything after it fails,
    // reverse that stock delta rather than leave StockLedger/MilkStock
    // reflecting a change for a purchase edit that never actually saved.
    if (quantityDelta !== 0) {
      await moveMilkStock({
        quantity: -quantityDelta,
        transactionType: "adjustment",
        refModel: "PurchaseEntry",
        refId: purchase._id,
        remark: `Reversal — edit to Bill ${purchase.billNo} failed after stock was adjusted`,
        createdBy: req.user._id,
      });
    }
    throw err;
  }

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
    // A quick, friendly pre-check for the common case (this is NOT the
    // authoritative check — it's just here to give a clear error message
    // before touching anything). The real, race-safe enforcement is
    // moveMilkStock's own atomic conditional $inc below.
    const milkStock = await MilkStock.findOne({ key: "central" });
    const availableMilk = milkStock?.currentQty || 0;
    if (availableMilk < purchase.quantity) {
      throw new ApiError(
        400,
        `Cannot cancel — only ${availableMilk} KG of milk remains in stock, but this purchase added ${purchase.quantity} KG (the rest has already been used in production)`
      );
    }

    // Stock first: it's the atomic, authoritative check, and the one most
    // likely to fail (e.g. a concurrent production run consumed the milk
    // between the pre-check above and here). Vendor balance/ledger only get
    // touched once the reversal has actually succeeded, so a failure here
    // leaves nothing else committed for the catch block below to undo.
    await moveMilkStock({
      quantity: -purchase.quantity,
      transactionType: "adjustment",
      refModel: "PurchaseEntry",
      refId: purchase._id,
      remark: `Reversal — Purchase cancelled (Bill ${purchase.billNo})`,
      createdBy: req.user._id,
    });

    const updatedVendor = await Vendor.findByIdAndUpdate(
      purchase.vendor,
      { $inc: { currentBalance: -(purchase.netPayable - purchase.paidAmount) } },
      { new: true }
    );

    await VendorLedgerEntry.create({
      vendor: updatedVendor._id,
      date: new Date(),
      particulars: `Purchase Cancelled — Bill ${purchase.billNo}`,
      debit: purchase.netPayable,
      credit: purchase.paidAmount,
      balanceAfter: updatedVendor.currentBalance,
      refModel: "PurchaseEntry",
      refId: purchase._id,
    });
  } catch (err) {
    await PurchaseEntry.findByIdAndUpdate(purchase._id, { status: "active" });
    throw err;
  }

  const updated = await PurchaseEntry.findById(purchase._id);
  res.status(200).json(new ApiResponse(200, updated, "Purchase entry cancelled"));
});
