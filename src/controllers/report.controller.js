const PurchaseEntry = require("../models/PurchaseEntry.model");
const ProductionEntry = require("../models/ProductionEntry.model");
const DispatchEntry = require("../models/DispatchEntry.model");
const Bill = require("../models/Bill.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const { dateRangeFilter } = require("../utils/dateRangeFilter");

const dateFilter = (from, to) => {
  const range = dateRangeFilter(from, to);
  return Object.keys(range).length ? { date: range } : {};
};

// A dairy_user must only ever see their own dairy's data — never trust a
// dairy value taken from the query for that role, or a dairy_user could
// request another dairy's report just by passing its id.
const scopeDairy = (req) => (req.user.role === "dairy_user" ? String(req.user.dairy) : req.query.dairy);

const paginate = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, parseInt(query.limit) || 10);
  return { page, limit, skip: (page - 1) * limit };
};

exports.milkPurchaseReport = asyncHandler(async (req, res) => {
  const { from, to, vendor } = req.query;
  const filter = { ...dateFilter(from, to), status: "active" };
  if (vendor) filter.vendor = vendor;
  const { page, limit, skip } = paginate(req.query);

  const [entries, total, totalsAgg] = await Promise.all([
    PurchaseEntry.find(filter).populate("vendor", "name mobile").sort({ date: 1 }).skip(skip).limit(limit).lean(),
    PurchaseEntry.countDocuments(filter),
    PurchaseEntry.aggregate([
      { $match: filter },
      { $group: { _id: null, quantity: { $sum: "$quantity" }, amount: { $sum: "$netPayable" } } },
    ]),
  ]);
  const totals = { quantity: totalsAgg[0]?.quantity || 0, amount: totalsAgg[0]?.amount || 0 };

  res.status(200).json(new ApiResponse(200, { entries, totals, total, page, pages: Math.ceil(total / limit) || 1 }));
});

exports.productionReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { ...dateFilter(from, to), status: "active" };
  const { page, limit, skip } = paginate(req.query);

  const [entries, total, milkAgg] = await Promise.all([
    ProductionEntry.find(filter).populate("items.item", "name code").sort({ date: 1 }).skip(skip).limit(limit).lean(),
    ProductionEntry.countDocuments(filter),
    ProductionEntry.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$totalMilkConsumed" } } }]),
  ]);
  const totalMilkConsumed = milkAgg[0]?.total || 0;

  res.status(200).json(new ApiResponse(200, { entries, totalMilkConsumed, total, page, pages: Math.ceil(total / limit) || 1 }));
});

exports.dispatchReport = asyncHandler(async (req, res) => {
  const { from, to, item } = req.query;
  const dairy = scopeDairy(req);
  // Every other report filters to active-only — a cancelled dispatch's stock
  // effect was already reversed, so it shouldn't still count toward totals.
  const filter = { ...dateFilter(from, to), status: "active" };
  if (dairy) filter.dairy = dairy;
  const { page, limit, skip } = paginate(req.query);

  const [rawEntries, total] = await Promise.all([
    DispatchEntry.find(filter)
      .populate("dairy", "name code")
      .populate("items.item", "name code")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DispatchEntry.countDocuments(filter),
  ]);

  let entries = rawEntries;
  if (item) {
    entries = rawEntries
      .map((e) => ({ ...e, items: e.items.filter((i) => String(i.item._id) === item) }))
      .filter((e) => e.items.length);
  }

  res.status(200).json(new ApiResponse(200, { entries, total, page, pages: Math.ceil(total / limit) || 1 }));
});

exports.dairySalesReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dairy = scopeDairy(req);
  const filter = { ...dateFilter(from, to), status: "active" };
  if (dairy) filter.dairy = dairy;
  const { page, limit, skip } = paginate(req.query);

  const [bills, total, salesAgg] = await Promise.all([
    Bill.find(filter).populate("dairy", "name code").sort({ date: 1 }).skip(skip).limit(limit).lean(),
    Bill.countDocuments(filter),
    Bill.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$grandTotal" } } }]),
  ]);
  const totalSales = salesAgg[0]?.total || 0;

  res.status(200).json(new ApiResponse(200, { bills, totalSales, total, page, pages: Math.ceil(total / limit) || 1 }));
});

exports.itemWiseSalesReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const dairy = scopeDairy(req);
  const match = { ...dateFilter(from, to), status: "active" };
  if (dairy) match.dairy = dairy;

  const result = await Bill.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.item",
        totalQty: { $sum: "$items.quantity" },
        totalAmount: { $sum: "$items.amount" },
      },
    },
    { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
    { $unwind: "$item" },
    { $project: { itemName: "$item.name", itemCode: "$item.code", totalQty: 1, totalAmount: 1 } },
    { $sort: { totalAmount: -1 } },
  ]);

  res.status(200).json(new ApiResponse(200, result));
});

exports.stockReport = asyncHandler(async (req, res) => {
  const dairy = scopeDairy(req);

  if (dairy) {
    const stocks = await DairyItemStock.find({ dairy }).populate("item", "name code unit minStockAlert").lean();
    return res.status(200).json(new ApiResponse(200, stocks));
  }

  const stocks = await CentralItemStock.find().populate("item", "name code unit minStockAlert").lean();
  res.status(200).json(new ApiResponse(200, stocks));
});

exports.monthlyYearlyReport = asyncHandler(async (req, res) => {
  const { year, groupBy = "month" } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const range = dateRangeFilter(`${y}-01-01`, `${y}-12-31`);
  const format = groupBy === "year" ? "%Y" : "%Y-%m";

  const [purchase, production, sales] = await Promise.all([
    PurchaseEntry.aggregate([
      { $match: { date: range, status: "active" } },
      { $group: { _id: { $dateToString: { format, date: "$date" } }, qty: { $sum: "$quantity" }, amount: { $sum: "$netPayable" } } },
      { $sort: { _id: 1 } },
    ]),
    ProductionEntry.aggregate([
      { $match: { date: range, status: "active" } },
      { $group: { _id: { $dateToString: { format, date: "$date" } }, milkConsumed: { $sum: "$totalMilkConsumed" } } },
      { $sort: { _id: 1 } },
    ]),
    Bill.aggregate([
      { $match: { date: range, status: "active" } },
      { $group: { _id: { $dateToString: { format, date: "$date" } }, sales: { $sum: "$grandTotal" } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.status(200).json(new ApiResponse(200, { purchase, production, sales }));
});

exports.profitReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { ...dateFilter(from, to), status: "active" };

  const [purchaseAgg, salesAgg] = await Promise.all([
    PurchaseEntry.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$netPayable" } } }]),
    Bill.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$grandTotal" } } }]),
  ]);

  const purchaseCost = purchaseAgg[0]?.total || 0;
  const salesRevenue = salesAgg[0]?.total || 0;

  res.status(200).json(
    new ApiResponse(200, {
      purchaseCost,
      salesRevenue,
      grossProfit: salesRevenue - purchaseCost,
    })
  );
});
