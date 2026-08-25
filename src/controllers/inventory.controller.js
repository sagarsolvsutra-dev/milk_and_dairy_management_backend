const MilkStock = require("../models/MilkStock.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const StockLedger = require("../models/StockLedger.model");
const StockAdjustment = require("../models/StockAdjustment.model");
const ProductionEntry = require("../models/ProductionEntry.model");
const DispatchEntry = require("../models/DispatchEntry.model");
const Bill = require("../models/Bill.model");
const Item = require("../models/Item.model");
const Dairy = require("../models/Dairy.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { moveCentralItemStock, moveDairyItemStock } = require("../services/stock.service");

exports.getMilkStock = asyncHandler(async (req, res) => {
  const stock = (await MilkStock.findOne({ key: "central" }).lean()) || { currentQty: 0 };
  res.status(200).json(new ApiResponse(200, { currentQty: stock.currentQty }));
});

exports.getCentralItemStock = asyncHandler(async (req, res) => {
  const stocks = await CentralItemStock.find().populate("item", "name code unit minStockAlert").lean();
  res.status(200).json(new ApiResponse(200, stocks));
});

exports.getDairyStock = asyncHandler(async (req, res) => {
  const dairy = req.user.role === "dairy_user" ? String(req.user.dairy) : req.query.dairy;
  if (!dairy) throw new ApiError(400, "Dairy is required");

  const stocks = await DairyItemStock.find({ dairy }).populate("item", "name code unit minStockAlert").lean();
  res.status(200).json(new ApiResponse(200, stocks));
});

exports.getConsolidatedStock = asyncHandler(async (req, res) => {
  const [items, dairies, centralStocks, dairyStocks] = await Promise.all([
    Item.find({ isActive: true }).lean(),
    Dairy.find({ status: "active" }).lean(),
    CentralItemStock.find().lean(),
    DairyItemStock.find().lean(),
  ]);

  const result = items.map((item) => {
    const central = centralStocks.find((s) => String(s.item) === String(item._id))?.currentQty || 0;
    const perDairy = dairies.map((d) => ({
      dairy: { _id: d._id, name: d.name, code: d.code },
      qty: dairyStocks.find((s) => String(s.item) === String(item._id) && String(s.dairy) === String(d._id))?.currentQty || 0,
    }));
    const dairyTotal = perDairy.reduce((sum, d) => sum + d.qty, 0);
    return {
      item: { _id: item._id, name: item.name, code: item.code },
      centralStock: central,
      dairyStock: perDairy,
      totalStock: central + dairyTotal,
    };
  });

  res.status(200).json(new ApiResponse(200, result));
});

exports.getStockTrace = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const entries = await StockLedger.find({ item: itemId })
    .populate("dairy", "name code")
    .sort({ date: 1, createdAt: 1 })
    .lean();
  res.status(200).json(new ApiResponse(200, entries));
});

exports.createStockAdjustment = asyncHandler(async (req, res) => {
  const { stockType, dairy, item, quantity, reason } = req.body;
  if (!quantity || !reason) throw new ApiError(400, "Quantity and reason are required");

  const adjustment = await StockAdjustment.create({
    stockType,
    dairy: stockType === "dairy_item" ? dairy : null,
    item,
    quantity,
    reason,
    adjustedBy: req.user._id,
  });

  if (stockType === "central_item") {
    await moveCentralItemStock({
      item,
      quantity,
      transactionType: "adjustment",
      refModel: "StockAdjustment",
      refId: adjustment._id,
      remark: reason,
      createdBy: req.user._id,
    });
  } else {
    await moveDairyItemStock({
      dairy,
      item,
      quantity,
      transactionType: "adjustment",
      refModel: "StockAdjustment",
      refId: adjustment._id,
      remark: reason,
      createdBy: req.user._id,
    });
  }

  res.status(201).json(new ApiResponse(201, adjustment, "Stock adjustment recorded"));
});

exports.getStockAdjustments = asyncHandler(async (req, res) => {
  const { dairy, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (dairy) filter.dairy = dairy;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total] = await Promise.all([
    StockAdjustment.find(filter)
      .populate("item", "name code")
      .populate("dairy", "name code")
      .populate("adjustedBy", "name")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    StockAdjustment.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});

// Full audit trail per item: everything ever produced must be accounted for as
// either sitting in central stock, sitting at a dairy, or already sold.
exports.getStockReconciliation = asyncHandler(async (req, res) => {
  const [items, produced, dispatched, sold, centralStocks, dairyStocks] = await Promise.all([
    Item.find({ isActive: true }).lean(),
    ProductionEntry.aggregate([
      { $match: { status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", qty: { $sum: "$items.quantity" } } },
    ]),
    DispatchEntry.aggregate([
      { $match: { status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", qty: { $sum: "$items.quantity" } } },
    ]),
    Bill.aggregate([
      { $match: { status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", qty: { $sum: "$items.quantity" } } },
    ]),
    CentralItemStock.find().lean(),
    DairyItemStock.find().lean(),
  ]);

  const lookup = (rows, itemId) => rows.find((r) => String(r._id) === String(itemId))?.qty || 0;

  const result = items.map((item) => {
    const totalProduced = lookup(produced, item._id);
    const totalDispatched = lookup(dispatched, item._id);
    const totalSold = lookup(sold, item._id);
    const centralStock = centralStocks.find((s) => String(s.item) === String(item._id))?.currentQty || 0;
    const dairyStock = dairyStocks
      .filter((s) => String(s.item) === String(item._id))
      .reduce((sum, s) => sum + s.currentQty, 0);
    const accountedFor = centralStock + dairyStock + totalSold;

    return {
      item: { _id: item._id, name: item.name, code: item.code },
      totalProduced,
      totalDispatched,
      centralStock,
      dairyStock,
      totalSold,
      accountedFor,
      balanced: accountedFor === totalProduced,
    };
  });

  res.status(200).json(new ApiResponse(200, result));
});

exports.getDairyComparison = asyncHandler(async (req, res) => {
  const dairies = await Dairy.find({ status: "active" }).lean();
  const dairyStocks = await DairyItemStock.find().lean();

  const comparison = dairies.map((d) => {
    const stocks = dairyStocks.filter((s) => String(s.dairy) === String(d._id));
    const totalStock = stocks.reduce((sum, s) => sum + s.currentQty, 0);
    return { dairy: { _id: d._id, name: d.name, code: d.code }, totalStock, itemCount: stocks.length };
  });

  res.status(200).json(new ApiResponse(200, comparison));
});
