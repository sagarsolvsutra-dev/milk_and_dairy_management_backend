const mongoose = require("mongoose");
const DispatchEntry = require("../models/DispatchEntry.model");
const Dairy = require("../models/Dairy.model");
const Notification = require("../models/Notification.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const Item = require("../models/Item.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const { moveCentralItemStock, moveDairyItemStock } = require("../services/stock.service");
const { dateRangeFilter } = require("../utils/dateRangeFilter");

exports.createDispatch = asyncHandler(async (req, res) => {
  const { date, dairy, items = [], vehicleNo, driverName, remark } = req.body;
  if (!items.length) throw new ApiError(400, "Add at least one item to the dispatch entry");

  const dairyDoc = await Dairy.findById(dairy);
  if (!dairyDoc) throw new ApiError(404, "Dairy not found");

  // Validate BEFORE creating anything — no replica set, so no multi-document
  // transactions. Failing fast avoids an orphan DispatchEntry if central stock is short.
  // Collapse repeated items into their combined requested quantity first — validating
  // row-by-row would let two rows for the same item each read the same unmutated
  // stock and both pass, even though together they exceed what's available.
  const requestedTotals = new Map();
  for (const row of items) {
    if (!(Number(row.quantity) >= 0.01)) throw new ApiError(400, "Each item's quantity must be greater than 0");
    const key = String(row.item);
    requestedTotals.set(key, (requestedTotals.get(key) || 0) + Number(row.quantity));
  }
  for (const [itemId, totalQty] of requestedTotals) {
    const stock = await CentralItemStock.findOne({ item: itemId });
    const available = stock?.currentQty || 0;
    if (available < totalQty) {
      const item = await Item.findById(itemId);
      throw new ApiError(
        400,
        `Insufficient central stock for ${item?.name || "item"} — available: ${available}, requested: ${totalQty}`
      );
    }
  }

  const dispatchNo = await nextSequence("dispatch", "DSP-");

  const dispatch = await DispatchEntry.create({
    date: date || new Date(),
    dispatchNo,
    dairy,
    items,
    vehicleNo,
    driverName,
    remark,
    createdBy: req.user._id,
  });

  for (const row of items) {
    await moveCentralItemStock({
      item: row.item,
      quantity: -row.quantity,
      transactionType: "dispatch_out",
      refModel: "DispatchEntry",
      refId: dispatch._id,
      remark: `Dispatched to ${dairyDoc.name} (${dispatchNo})`,
      createdBy: req.user._id,
    });

    await moveDairyItemStock({
      dairy,
      item: row.item,
      quantity: row.quantity,
      transactionType: "dispatch_in",
      refModel: "DispatchEntry",
      refId: dispatch._id,
      remark: `Received from central stock (${dispatchNo})`,
      createdBy: req.user._id,
    });
  }

  await Notification.create({
    title: "New Stock Dispatched",
    message: `Dispatch ${dispatchNo} with ${items.length} item(s) sent to your dairy.`,
    type: "dispatch",
    audience: "dairy",
    dairy,
    refModel: "DispatchEntry",
    refId: dispatch._id,
  });

  res.status(201).json(new ApiResponse(201, dispatch, "Dispatch entry saved successfully"));
});

exports.getDispatches = asyncHandler(async (req, res) => {
  const { search, dairy, from, to, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (dairy) filter.dairy = new mongoose.Types.ObjectId(dairy);
  if (search) {
    const [matchingItems, matchingDairies] = await Promise.all([
      Item.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ],
      }).select("_id"),
      Dairy.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ],
      }).select("_id"),
    ]);

    const itemIds = matchingItems.map((i) => i._id);
    const dairyIds = matchingDairies.map((d) => d._id);

    filter.$or = [
      { dispatchNo: { $regex: search, $options: "i" } },
      { vehicleNo: { $regex: search, $options: "i" } },
      { driverName: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
      { remark: { $regex: search, $options: "i" } },
      { "items.item": { $in: itemIds } },
      { dairy: { $in: dairyIds } },
    ];
  }
  if (from || to) filter.date = dateRangeFilter(from, to);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [items, total, summaryAgg] = await Promise.all([
    DispatchEntry.find(filter)
      .populate("dairy", "name code")
      .populate("items.item", "name code")
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    DispatchEntry.countDocuments(filter),
    DispatchEntry.aggregate([
      { $match: { ...filter, status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: null, count: { $addToSet: "$_id" }, totalItemsDispatched: { $sum: "$items.quantity" } } },
      { $project: { _id: 0, count: { $size: "$count" }, totalItemsDispatched: 1 } },
    ]),
  ]);

  const summary = summaryAgg[0] || { count: 0, totalItemsDispatched: 0 };

  res.status(200).json(new ApiResponse(200, { items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, summary }));
});

exports.getDispatch = asyncHandler(async (req, res) => {
  const dispatch = await DispatchEntry.findById(req.params.id)
    .populate("dairy", "name code")
    .populate("items.item", "name code unit")
    .lean();
  if (!dispatch) throw new ApiError(404, "Dispatch entry not found");
  res.status(200).json(new ApiResponse(200, dispatch));
});

exports.updateDispatch = asyncHandler(async (req, res) => {
  const { date, dairy, items = [], vehicleNo, driverName, remark } = req.body;
  if (!items.length) throw new ApiError(400, "Add at least one item to the dispatch entry");

  const dispatch = await DispatchEntry.findById(req.params.id);
  if (!dispatch) throw new ApiError(404, "Dispatch entry not found");
  if (dispatch.status === "cancelled") throw new ApiError(400, "Cannot edit a cancelled dispatch entry");

  const newDairyId = dairy ? String(dairy) : String(dispatch.dairy);
  const dairyChanged = newDairyId !== String(dispatch.dairy);
  const newDairyDoc = await Dairy.findById(newDairyId);
  if (!newDairyDoc) throw new ApiError(404, "Dairy not found");

  const resolvedItems = items.map((row) => ({ item: String(row.item), quantity: Number(row.quantity) }));

  // Validate quantities BEFORE any stock is moved — the schema's min-quantity
  // validator only runs at the final .save(), by which point stock would
  // already have shifted for an edit that never actually gets persisted.
  for (const row of resolvedItems) {
    if (!(row.quantity >= 0.01)) throw new ApiError(400, "Each item's quantity must be greater than 0");
  }

  if (dairyChanged) {
    // Relocating to a different dairy — every item is fully leaving the old
    // dairy and fully arriving at the new one, so the full original quantity
    // must still be present at the old dairy (nothing sold/used since dispatch).
    for (const row of dispatch.items) {
      const stock = await DairyItemStock.findOne({ dairy: dispatch.dairy, item: row.item });
      const available = stock?.currentQty || 0;
      if (available < row.quantity) {
        const itemDoc = await Item.findById(row.item);
        throw new ApiError(
          400,
          `Cannot move dispatch — only ${available} units of ${itemDoc?.name || "this item"} remain at the original dairy (the rest has already been sold/used)`
        );
      }
    }
    const projectedCentral = new Map();
    for (const row of dispatch.items) {
      const stock = await CentralItemStock.findOne({ item: row.item });
      projectedCentral.set(String(row.item), (stock?.currentQty || 0) + Number(row.quantity));
    }
    for (const row of resolvedItems) {
      let base = projectedCentral.get(row.item);
      if (base === undefined) {
        const stock = await CentralItemStock.findOne({ item: row.item });
        base = stock?.currentQty || 0;
      }
      if (base < row.quantity) {
        const itemDoc = await Item.findById(row.item);
        throw new ApiError(400, `Insufficient central stock for ${itemDoc?.name || "item"} to save this edit — available: ${base}, requested: ${row.quantity}`);
      }
      projectedCentral.set(row.item, base - row.quantity);
    }

    for (const row of dispatch.items) {
      await moveDairyItemStock({
        dairy: dispatch.dairy,
        item: row.item,
        quantity: -row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Reversal — Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
      await moveCentralItemStock({
        item: row.item,
        quantity: row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Reversal — Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
    }
    for (const row of resolvedItems) {
      await moveCentralItemStock({
        item: row.item,
        quantity: -row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
      await moveDairyItemStock({
        dairy: newDairyId,
        item: row.item,
        quantity: row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
    }
  } else {
    // Same dairy — only move stock for the DIFFERENCE per item. Touching
    // unchanged items would needlessly demand their full original quantity
    // still be sitting at the dairy, blocking even a remark-only edit once
    // any item has been sold/used.
    const oldQtyByItem = new Map(dispatch.items.map((row) => [String(row.item), Number(row.quantity)]));
    const newQtyByItem = new Map(resolvedItems.map((row) => [row.item, row.quantity]));
    const itemIds = new Set([...oldQtyByItem.keys(), ...newQtyByItem.keys()]);
    const itemDeltas = [...itemIds]
      .map((itemId) => ({ itemId, delta: (newQtyByItem.get(itemId) || 0) - (oldQtyByItem.get(itemId) || 0) }))
      .filter((d) => d.delta !== 0);

    for (const { itemId, delta } of itemDeltas) {
      if (delta < 0) {
        const stock = await DairyItemStock.findOne({ dairy: dispatch.dairy, item: itemId });
        const available = stock?.currentQty || 0;
        if (available < -delta) {
          const itemDoc = await Item.findById(itemId);
          throw new ApiError(
            400,
            `Cannot reduce ${itemDoc?.name || "this item"} — only ${available} units remain at the dairy (the rest has already been sold/used)`
          );
        }
      } else {
        const stock = await CentralItemStock.findOne({ item: itemId });
        const available = stock?.currentQty || 0;
        if (available < delta) {
          const itemDoc = await Item.findById(itemId);
          throw new ApiError(400, `Insufficient central stock for ${itemDoc?.name || "item"} — available: ${available}, additional needed: ${delta}`);
        }
      }
    }

    for (const { itemId, delta } of itemDeltas) {
      await moveCentralItemStock({
        item: itemId,
        quantity: -delta,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
      await moveDairyItemStock({
        dairy: dispatch.dairy,
        item: itemId,
        quantity: delta,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Dispatch edited (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
    }
  }

  dispatch.date = date || dispatch.date;
  dispatch.dairy = newDairyId;
  dispatch.items = items.map((row) => ({ item: row.item, quantity: Number(row.quantity) }));
  dispatch.vehicleNo = vehicleNo ?? dispatch.vehicleNo;
  dispatch.driverName = driverName ?? dispatch.driverName;
  dispatch.remark = remark ?? dispatch.remark;
  await dispatch.save({ validateModifiedOnly: true });

  res.status(200).json(new ApiResponse(200, dispatch, "Dispatch entry updated"));
});

exports.cancelDispatch = asyncHandler(async (req, res) => {
  // Atomically claim the cancel — the first request to flip status "active" ->
  // "cancelled" wins; a concurrent duplicate request gets null back here and
  // stops before touching any stock, instead of both racing past a
  // findById-then-save check and double-reversing the stock.
  const dispatch = await DispatchEntry.findOneAndUpdate(
    { _id: req.params.id, status: "active" },
    { status: "cancelled" },
    { new: false }
  );
  if (!dispatch) {
    const exists = await DispatchEntry.exists({ _id: req.params.id });
    if (!exists) throw new ApiError(404, "Dispatch entry not found");
    throw new ApiError(400, "Dispatch entry already cancelled");
  }

  try {
    // If the dairy has already sold/used the stock, we can't reverse it —
    // catching that here rolls the claim back below instead of leaving the
    // record cancelled with nothing actually reversed.
    for (const row of dispatch.items) {
      const stock = await DairyItemStock.findOne({ dairy: dispatch.dairy, item: row.item });
      const available = stock?.currentQty || 0;
      if (available < row.quantity) {
        const itemDoc = await Item.findById(row.item);
        throw new ApiError(
          400,
          `Cannot cancel — only ${available} units of ${itemDoc?.name || "this item"} remain at the dairy, but this dispatch sent ${row.quantity} (the rest has already been sold/used)`
        );
      }
    }

    for (const row of dispatch.items) {
      await moveDairyItemStock({
        dairy: dispatch.dairy,
        item: row.item,
        quantity: -row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Reversal — Dispatch cancelled (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
      await moveCentralItemStock({
        item: row.item,
        quantity: row.quantity,
        transactionType: "adjustment",
        refModel: "DispatchEntry",
        refId: dispatch._id,
        remark: `Reversal — Dispatch cancelled (${dispatch.dispatchNo})`,
        createdBy: req.user._id,
      });
    }
  } catch (err) {
    await DispatchEntry.findByIdAndUpdate(dispatch._id, { status: "active" });
    throw err;
  }

  const updated = await DispatchEntry.findById(dispatch._id);
  res.status(200).json(new ApiResponse(200, updated, "Dispatch entry cancelled"));
});
