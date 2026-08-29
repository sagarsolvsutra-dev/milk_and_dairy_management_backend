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
const { escapeRegex } = require("../utils/escapeRegex");

exports.getMilkStock = asyncHandler(async (req, res) => {
  const stock = (await MilkStock.findOne({ key: "central" }).lean()) || { currentQty: 0 };
  res.status(200).json(new ApiResponse(200, { currentQty: stock.currentQty }));
});

exports.getCentralItemStock = asyncHandler(async (req, res) => {
  let { search = "", page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const filter = {};
  if (search) {
    const matchingItems = await Item.find({
      $or: [{ name: { $regex: search, $options: "i" } }, { code: { $regex: search, $options: "i" } }],
    }).select("_id");
    filter.item = { $in: matchingItems.map((i) => i._id) };
  }

  const [items, total, lowStockAgg] = await Promise.all([
    CentralItemStock.find(filter)
      .populate("item", "name code unit minStockAlert")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    CentralItemStock.countDocuments(filter),
    // Computed across ALL central stock (not just this page) — the stat card
    // showing this number needs the true total, not a per-page count.
    CentralItemStock.aggregate([
      { $lookup: { from: "items", localField: "item", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $match: { $expr: { $lte: ["$currentQty", "$item.minStockAlert"] } } },
      { $count: "count" },
    ]),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      items,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      summary: { lowStockCount: lowStockAgg[0]?.count || 0 },
    })
  );
});

exports.getDairyStock = asyncHandler(async (req, res) => {
  const dairy = req.user.role === "dairy_user" ? String(req.user.dairy) : req.query.dairy;
  if (!dairy) throw new ApiError(400, "Dairy is required");

  let { search = "", page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const filter = { dairy };
  if (search) {
    const matchingItems = await Item.find({
      $or: [{ name: { $regex: search, $options: "i" } }, { code: { $regex: search, $options: "i" } }],
    }).select("_id");
    filter.item = { $in: matchingItems.map((i) => i._id) };
  }

  const [items, total] = await Promise.all([
    DairyItemStock.find(filter)
      .populate("item", "name code unit minStockAlert")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    DairyItemStock.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
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
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  // Newest first — page 1 is "what happened most recently", not "what
  // happened first ever".
  const [items, total] = await Promise.all([
    StockLedger.find({ item: itemId })
      .populate("dairy", "name code")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    StockLedger.countDocuments({ item: itemId }),
  ]);

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
});

exports.createStockAdjustment = asyncHandler(async (req, res) => {
  const { stockType, dairy, item, quantity, reason } = req.body;
  if (!quantity || !reason) throw new ApiError(400, "Quantity and reason are required");
  if (!["central_item", "dairy_item"].includes(stockType)) throw new ApiError(400, "Invalid stock type");
  if (stockType === "dairy_item" && !dairy) throw new ApiError(400, "Dairy is required for a dairy stock adjustment");

  // Validate the referenced item/dairy actually exist BEFORE creating anything —
  // an undefined `dairy` reaching moveDairyItemStock's {dairy, item} filter
  // would have Mongoose silently drop the undefined key, matching (and
  // corrupting) some OTHER dairy's stock row for this item instead of failing;
  // a bogus item/dairy id would otherwise upsert a permanently dangling stock
  // document that no `.populate()` consumer could ever resolve.
  const itemDoc = await Item.findById(item);
  if (!itemDoc) throw new ApiError(404, "Item not found");
  if (stockType === "dairy_item") {
    const dairyDoc = await Dairy.findById(dairy);
    if (!dairyDoc) throw new ApiError(404, "Dairy not found");
  }

  // The stock movers need a real StockAdjustment id to reference (refId) as
  // their audit trail, so the record has to exist before the move runs — but
  // if the move then fails (e.g. not enough stock left to deduct), delete it
  // again rather than leave an adjustment record behind that was never
  // actually applied to stock.
  const adjustment = await StockAdjustment.create({
    stockType,
    dairy: stockType === "dairy_item" ? dairy : null,
    item,
    quantity,
    reason,
    adjustedBy: req.user._id,
  });

  try {
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
  } catch (err) {
    await StockAdjustment.findByIdAndDelete(adjustment._id);
    throw err;
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
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  // The per-item totals below only make sense computed across every item at
  // once (each is a lookup into a shared aggregate) — so the query itself
  // can't paginate; only the assembled result is paginated before returning.
  const [items, produced, dispatched, sold, centralStocks, dairyStocks] = await Promise.all([
    Item.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
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
      // accountedFor and totalProduced are summed independently — accountedFor
      // from currentQty fields built up over many sequential $inc operations,
      // totalProduced from a fresh aggregate — so floating-point addition
      // ordering can leave them differing in the last bit even when nothing
      // has actually drifted. A tolerance avoids false "not balanced" alerts.
      balanced: Math.abs(accountedFor - totalProduced) < 0.001,
    };
  });

  const total = result.length;
  const paged = result.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.status(200).json(new ApiResponse(200, { items: paged, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 }));
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
