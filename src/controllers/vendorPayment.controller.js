const VendorPayment = require("../models/VendorPayment.model");
const Vendor = require("../models/Vendor.model");
const VendorLedgerEntry = require("../models/VendorLedgerEntry.model");
const PurchaseEntry = require("../models/PurchaseEntry.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { dateRangeFilter } = require("../utils/dateRangeFilter");

exports.createPayment = asyncHandler(async (req, res) => {
  const { vendor, date, amount, mode, referenceNo, adjustedBills = [], remark } = req.body;

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw new ApiError(404, "Vendor not found");
  if (Number(amount) <= 0) throw new ApiError(400, "Payment amount must be greater than zero");

  // Validate every adjusted purchase BEFORE creating anything — each must
  // actually belong to this vendor, still be active, and the amount applied
  // to it can't exceed what's actually owed on it. Without this, an
  // adjustedBills entry pointing at another vendor's purchase would mark
  // that purchase paid down without ever touching that vendor's own balance
  // or ledger, leaving the two permanently out of sync.
  //
  // claimedByPurchase tracks how much THIS request has already applied to
  // each purchase id — checking adj.amount against purchase.balance alone
  // (the DB value, unmodified until after this loop) would let two
  // adjustedBills entries for the same bill each pass the same balance
  // check and together over-claim it.
  const claimedByPurchase = new Map();
  const purchaseDocs = [];
  for (const adj of adjustedBills) {
    const purchase = await PurchaseEntry.findById(adj.purchaseEntry);
    if (!purchase) throw new ApiError(404, "Purchase entry not found for one of the adjusted bills");
    if (String(purchase.vendor) !== String(vendor)) {
      throw new ApiError(400, `Purchase ${purchase.billNo} does not belong to this vendor`);
    }
    if (purchase.status === "cancelled") throw new ApiError(400, `Purchase ${purchase.billNo} is cancelled`);
    if (Number(adj.amount) <= 0) throw new ApiError(400, `Adjustment amount for ${purchase.billNo} must be greater than zero`);

    const purchaseId = String(purchase._id);
    const alreadyClaimed = claimedByPurchase.get(purchaseId) || 0;
    const remainingBalance = purchase.balance - alreadyClaimed;
    if (Number(adj.amount) > remainingBalance) {
      throw new ApiError(400, `Adjustment amount for ${purchase.billNo} exceeds its outstanding balance of ${remainingBalance}`);
    }
    claimedByPurchase.set(purchaseId, alreadyClaimed + Number(adj.amount));
    purchaseDocs.push(purchase);
  }

  const totalAdjusted = adjustedBills.reduce((sum, adj) => sum + Number(adj.amount), 0);
  if (adjustedBills.length && Math.abs(totalAdjusted - Number(amount)) > 0.01) {
    throw new ApiError(
      400,
      `Adjusted bill amounts (${totalAdjusted}) must add up to the payment amount (${Number(amount)})`
    );
  }

  const payment = await VendorPayment.create({
    vendor,
    date: date || new Date(),
    amount,
    mode,
    referenceNo,
    adjustedBills,
    remark,
    createdBy: req.user._id,
  });

  for (const adj of adjustedBills) {
    await PurchaseEntry.findByIdAndUpdate(adj.purchaseEntry, {
      $inc: { paidAmount: adj.amount, balance: -adj.amount },
    });
  }

  const updatedVendor = await Vendor.findByIdAndUpdate(
    vendorDoc._id,
    { $inc: { currentBalance: -Number(amount) } },
    { new: true }
  );

  await VendorLedgerEntry.create({
    vendor: updatedVendor._id,
    date: payment.date,
    particulars: `Payment Made${referenceNo ? ` — Ref ${referenceNo}` : ""}`,
    debit: amount,
    balanceAfter: updatedVendor.currentBalance,
    refModel: "VendorPayment",
    refId: payment._id,
  });

  res.status(201).json(new ApiResponse(201, payment, "Payment entry saved successfully"));
});

exports.getPayments = asyncHandler(async (req, res) => {
  const { vendor, from, to, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (vendor) filter.vendor = vendor;
  if (from || to) filter.date = dateRangeFilter(from, to);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total] = await Promise.all([
    VendorPayment.find(filter)
      .populate("vendor", "name mobile")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    VendorPayment.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});

exports.getOutstandingReport = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const filter = { currentBalance: { $ne: 0 } };
  const [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .sort({ currentBalance: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Vendor.countDocuments(filter),
  ]);
  const now = new Date();

  const report = await Promise.all(
    vendors.map(async (v) => {
      const oldestUnpaid = await PurchaseEntry.findOne({
        vendor: v._id,
        balance: { $gt: 0 },
        status: "active",
      })
        .sort({ date: 1 })
        .lean();

      let ageBucket = "0-15";
      if (oldestUnpaid) {
        const days = Math.floor((now - oldestUnpaid.date) / (1000 * 60 * 60 * 24));
        if (days > 30) ageBucket = "30+";
        else if (days > 15) ageBucket = "16-30";
      }

      return {
        vendor: v,
        outstanding: v.currentBalance,
        ageBucket,
        oldestUnpaidDate: oldestUnpaid?.date || null,
      };
    })
  );

  res.status(200).json(new ApiResponse(200, { items: report, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});
