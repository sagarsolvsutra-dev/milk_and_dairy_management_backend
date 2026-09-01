const ProductionEntry = require("../models/ProductionEntry.model");
const Item = require("../models/Item.model");
const MilkStock = require("../models/MilkStock.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const StockLedger = require("../models/StockLedger.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const { moveMilkStock, moveCentralItemStock } = require("../services/stock.service");
const { dateRangeFilter } = require("../utils/dateRangeFilter");
const { escapeRegex } = require("../utils/escapeRegex");

exports.createProduction = asyncHandler(async (req, res) => {
  const { date, items = [], remark } = req.body;
  if (!items.length) throw new ApiError(400, "Add at least one item to the production entry");

  const resolvedItems = [];
  let totalMilkConsumed = 0;

  for (const row of items) {
    const itemDoc = await Item.findById(row.item);
    if (!itemDoc) throw new ApiError(404, `Item not found: ${row.item}`);
    const milkConsumed = Number(row.quantity) * (itemDoc.recipe?.milkQtyPerUnit || 0);
    totalMilkConsumed += milkConsumed;
    resolvedItems.push({ item: itemDoc._id, quantity: row.quantity, milkConsumed });
  }

  // Validate BEFORE creating anything — no replica set, so no multi-document
  // transactions. Failing fast avoids an orphan ProductionEntry if milk stock is short.
  const milkStock = await MilkStock.findOne({ key: "central" });
  const availableMilk = milkStock?.currentQty || 0;
  if (availableMilk < totalMilkConsumed) {
    throw new ApiError(
      400,
      `Insufficient milk stock — available: ${availableMilk} KG, required: ${totalMilkConsumed} KG`
    );
  }

  const batchNo = await nextSequence("production", "BATCH-");

  const production = await ProductionEntry.create({
    date: date || new Date(),
    batchNo,
    items: resolvedItems,
    totalMilkConsumed,
    remark,
    createdBy: req.user._id,
  });

  await moveMilkStock({
    quantity: -totalMilkConsumed,
    transactionType: "production_out",
    refModel: "ProductionEntry",
    refId: production._id,
    remark: `Milk consumed for batch ${batchNo}`,
    createdBy: req.user._id,
  });

  for (const row of resolvedItems) {
    await moveCentralItemStock({
      item: row.item,
      quantity: row.quantity,
      transactionType: "production_in",
      refModel: "ProductionEntry",
      refId: production._id,
      remark: `Produced in batch ${batchNo}`,
      createdBy: req.user._id,
    });
  }

  res.status(201).json(new ApiResponse(201, production, "Production entry saved successfully"));
});

exports.getProductions = asyncHandler(async (req, res) => {
  let { search, from, to, page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
  const filter = {};
  if (search) {
    const matchingItems = await Item.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const itemIds = matchingItems.map((i) => i._id);

    filter.$or = [
      { batchNo: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { remark: { $regex: search, $options: "i" } },
      { "items.item": { $in: itemIds } },
    ];
  }
  if (from || to) filter.date = dateRangeFilter(from, to);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total, summaryAgg] = await Promise.all([
    ProductionEntry.find(filter)
      .populate("items.item", "name code")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ProductionEntry.countDocuments(filter),
    ProductionEntry.aggregate([
      { $match: { ...filter, status: "active" } },
      { $group: { _id: null, count: { $sum: 1 }, totalMilkConsumed: { $sum: "$totalMilkConsumed" } } },
    ]),
  ]);

  const summary = summaryAgg[0]
    ? { count: summaryAgg[0].count, totalMilkConsumed: summaryAgg[0].totalMilkConsumed }
    : { count: 0, totalMilkConsumed: 0 };

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, summary }));
});

exports.getProduction = asyncHandler(async (req, res) => {
  const production = await ProductionEntry.findById(req.params.id).populate("items.item", "name code unit").lean();
  if (!production) throw new ApiError(404, "Production entry not found");
  res.status(200).json(new ApiResponse(200, production));
});

exports.updateProduction = asyncHandler(async (req, res) => {
  const { date, items = [], remark } = req.body;
  if (!items.length) throw new ApiError(400, "Add at least one item to the production entry");

  const production = await ProductionEntry.findById(req.params.id);
  if (!production) throw new ApiError(404, "Production entry not found");
  if (production.status === "cancelled") throw new ApiError(400, "Cannot edit a cancelled production entry");

  const resolvedItems = [];
  let newTotalMilkConsumed = 0;
  for (const row of items) {
    const itemDoc = await Item.findById(row.item);
    if (!itemDoc) throw new ApiError(404, `Item not found: ${row.item}`);
    const quantity = Number(row.quantity);
    // Validate BEFORE any stock is moved — the schema's min-quantity validator
    // only runs at the final .save(), by which point stock would already have
    // shifted for an edit that never actually gets persisted.
    if (!(quantity >= 0.01)) throw new ApiError(400, "Each item's quantity must be greater than 0");
    const milkConsumed = quantity * (itemDoc.recipe?.milkQtyPerUnit || 0);
    newTotalMilkConsumed += milkConsumed;
    resolvedItems.push({ item: itemDoc._id, quantity, milkConsumed });
  }

  // Only move stock for the DIFFERENCE per item — touching unchanged items would
  // needlessly demand their full original quantity still be sitting in central
  // stock, blocking even a remark-only edit once anything has been dispatched.
  // Sum (not overwrite) quantities per item id — an entry can legitimately list
  // the same item on more than one row, and a plain `new Map(...)` would keep
  // only the last row's quantity, silently dropping the earlier rows from the
  // delta math while they'd still be saved on the document itself.
  const sumQtyByItem = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = String(row.item);
      map.set(key, (map.get(key) || 0) + Number(row.quantity));
    }
    return map;
  };
  const oldQtyByItem = sumQtyByItem(production.items);
  const newQtyByItem = sumQtyByItem(resolvedItems);
  const itemIds = new Set([...oldQtyByItem.keys(), ...newQtyByItem.keys()]);
  const itemDeltas = [...itemIds]
    .map((itemId) => ({ itemId, delta: (newQtyByItem.get(itemId) || 0) - (oldQtyByItem.get(itemId) || 0) }))
    .filter((d) => d.delta !== 0);

  // Validate BEFORE mutating anything — no replica set, so no multi-document transactions.
  for (const { itemId, delta } of itemDeltas) {
    if (delta < 0) {
      const stock = await CentralItemStock.findOne({ item: itemId });
      const available = stock?.currentQty || 0;
      if (available < -delta) {
        const itemDoc = await Item.findById(itemId);
        throw new ApiError(
          400,
          `Cannot reduce ${itemDoc?.name || "this item"} — only ${available} units remain in central stock (the rest has already been dispatched)`
        );
      }
    }
  }
  const milkDelta = newTotalMilkConsumed - production.totalMilkConsumed;
  if (milkDelta > 0) {
    const milkStock = await MilkStock.findOne({ key: "central" });
    const availableMilk = milkStock?.currentQty || 0;
    if (availableMilk < milkDelta) {
      throw new ApiError(400, `Insufficient milk stock to save this edit — available: ${availableMilk} KG, additional needed: ${milkDelta} KG`);
    }
  }

  if (milkDelta !== 0) {
    await moveMilkStock({
      quantity: -milkDelta,
      transactionType: "adjustment",
      refModel: "ProductionEntry",
      refId: production._id,
      remark: `Production edited (Batch ${production.batchNo})`,
      createdBy: req.user._id,
    });
  }

  const appliedItemDeltas = [];
  try {
    for (const { itemId, delta } of itemDeltas) {
      await moveCentralItemStock({
        item: itemId,
        quantity: delta,
        transactionType: "adjustment",
        refModel: "ProductionEntry",
        refId: production._id,
        remark: `Production edited (Batch ${production.batchNo})`,
        createdBy: req.user._id,
      });
      appliedItemDeltas.push({ itemId, delta });
    }

    production.date = date || production.date;
    production.items = resolvedItems;
    production.totalMilkConsumed = newTotalMilkConsumed;
    production.remark = remark ?? production.remark;
    await production.save({ validateModifiedOnly: true });
  } catch (err) {
    // Stock already moved above — reverse everything that committed rather
    // than leave StockLedger/stock reflecting a change for an edit that
    // never actually saved (mirrors updatePurchase's own rollback pattern).
    for (const { itemId, delta } of appliedItemDeltas.reverse()) {
      await moveCentralItemStock({
        item: itemId,
        quantity: -delta,
        transactionType: "adjustment",
        refModel: "ProductionEntry",
        refId: production._id,
        remark: `Reversal — edit to Batch ${production.batchNo} failed after stock was adjusted`,
        createdBy: req.user._id,
      });
    }
    if (milkDelta !== 0) {
      await moveMilkStock({
        quantity: milkDelta,
        transactionType: "adjustment",
        refModel: "ProductionEntry",
        refId: production._id,
        remark: `Reversal — edit to Batch ${production.batchNo} failed after stock was adjusted`,
        createdBy: req.user._id,
      });
    }
    throw err;
  }

  res.status(200).json(new ApiResponse(200, production, "Production entry updated"));
});

exports.cancelProduction = asyncHandler(async (req, res) => {
  // Atomically claim the cancel — the first request to flip status "active" ->
  // "cancelled" wins; a concurrent duplicate request gets null back here and
  // stops before touching any stock, instead of both racing past a
  // findById-then-save check and double-reversing the stock.
  const production = await ProductionEntry.findOneAndUpdate(
    { _id: req.params.id, status: "active" },
    { status: "cancelled" },
    { new: false }
  );
  if (!production) {
    const exists = await ProductionEntry.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, "Production entry not found");
    throw new ApiError(400, "Production entry already cancelled");
  }

  try {
    // If any produced item has already been dispatched out, we can't reverse
    // it — catching that here rolls the claim back below instead of leaving
    // the record cancelled with nothing actually reversed.
    for (const row of production.items) {
      const stock = await CentralItemStock.findOne({ item: row.item });
      const available = stock?.currentQty || 0;
      if (available < row.quantity) {
        const item = await Item.findById(row.item);
        throw new ApiError(
          400,
          `Cannot cancel — only ${available} units of ${item?.name || "this item"} remain in central stock, but this batch produced ${row.quantity} (the rest has already been dispatched)`
        );
      }
    }

    // The pre-check above isn't authoritative under concurrency — track which
    // reversals actually succeed so a failure partway through can undo them,
    // instead of leaving some items reversed while the entry's status flips
    // back to "active" below as if nothing had happened at all.
    const reversedItems = [];
    let milkReversed = false;
    try {
      await moveMilkStock({
        quantity: production.totalMilkConsumed,
        transactionType: "adjustment",
        refModel: "ProductionEntry",
        refId: production._id,
        remark: `Reversal — Production cancelled (Batch ${production.batchNo})`,
        createdBy: req.user._id,
      });
      milkReversed = true;

      for (const row of production.items) {
        await moveCentralItemStock({
          item: row.item,
          quantity: -row.quantity,
          transactionType: "adjustment",
          refModel: "ProductionEntry",
          refId: production._id,
          remark: `Reversal — Production cancelled (Batch ${production.batchNo})`,
          createdBy: req.user._id,
        });
        reversedItems.push(row);
      }
    } catch (moveErr) {
      for (const row of reversedItems.reverse()) {
        await moveCentralItemStock({
          item: row.item,
          quantity: row.quantity,
          transactionType: "adjustment",
          refModel: "ProductionEntry",
          refId: production._id,
          remark: `Undo partial cancel — Batch ${production.batchNo}`,
          createdBy: req.user._id,
        });
      }
      if (milkReversed) {
        await moveMilkStock({
          quantity: -production.totalMilkConsumed,
          transactionType: "adjustment",
          refModel: "ProductionEntry",
          refId: production._id,
          remark: `Undo partial cancel — Batch ${production.batchNo}`,
          createdBy: req.user._id,
        });
      }
      throw moveErr;
    }
  } catch (err) {
    await ProductionEntry.findByIdAndUpdate(production._id, { status: "active" });
    throw err;
  }

  const updated = await ProductionEntry.findById(production._id);
  res.status(200).json(new ApiResponse(200, updated, "Production entry cancelled"));
});

// Unlike cancel (a status flip that keeps the record as a permanent audit
// trail), this permanently removes the batch — for an ACTIVE entry it
// reverses its stock effect first, exactly like cancelProduction, so a
// deleted batch never leaves stock out of sync; it then hard-deletes the
// record and the StockLedger rows that only ever existed to describe it.
exports.deleteProduction = asyncHandler(async (req, res) => {
  const existing = await ProductionEntry.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Production entry not found");

  if (existing.status === "active") {
    const production = await ProductionEntry.findOneAndUpdate(
      { _id: existing._id, status: "active" },
      { status: "cancelled" },
      { new: false }
    );
    if (!production) throw new ApiError(400, "Production entry was just modified by another request — please retry");

    try {
      for (const row of production.items) {
        const stock = await CentralItemStock.findOne({ item: row.item });
        const available = stock?.currentQty || 0;
        if (available < row.quantity) {
          const item = await Item.findById(row.item);
          throw new ApiError(
            400,
            `Cannot delete — only ${available} units of ${item?.name || "this item"} remain in central stock, but this batch produced ${row.quantity} (the rest has already been dispatched)`
          );
        }
      }

      const reversedItems = [];
      let milkReversed = false;
      try {
        await moveMilkStock({
          quantity: production.totalMilkConsumed,
          transactionType: "adjustment",
          refModel: "ProductionEntry",
          refId: production._id,
          remark: `Reversal — Production deleted (Batch ${production.batchNo})`,
          createdBy: req.user._id,
        });
        milkReversed = true;

        for (const row of production.items) {
          await moveCentralItemStock({
            item: row.item,
            quantity: -row.quantity,
            transactionType: "adjustment",
            refModel: "ProductionEntry",
            refId: production._id,
            remark: `Reversal — Production deleted (Batch ${production.batchNo})`,
            createdBy: req.user._id,
          });
          reversedItems.push(row);
        }
      } catch (moveErr) {
        for (const row of reversedItems.reverse()) {
          await moveCentralItemStock({
            item: row.item,
            quantity: row.quantity,
            transactionType: "adjustment",
            refModel: "ProductionEntry",
            refId: production._id,
            remark: `Undo partial delete — Batch ${production.batchNo}`,
            createdBy: req.user._id,
          });
        }
        if (milkReversed) {
          await moveMilkStock({
            quantity: -production.totalMilkConsumed,
            transactionType: "adjustment",
            refModel: "ProductionEntry",
            refId: production._id,
            remark: `Undo partial delete — Batch ${production.batchNo}`,
            createdBy: req.user._id,
          });
        }
        throw moveErr;
      }
    } catch (err) {
      await ProductionEntry.findByIdAndUpdate(production._id, { status: "active" });
      throw err;
    }
  }

  await StockLedger.deleteMany({ refModel: "ProductionEntry", refId: existing._id });
  await ProductionEntry.findByIdAndDelete(existing._id);

  res.status(200).json(new ApiResponse(200, null, "Production entry deleted"));
});
