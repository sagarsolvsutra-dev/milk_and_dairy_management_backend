const MilkStock = require("../models/MilkStock.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const StockLedger = require("../models/StockLedger.model");
const ApiError = require("../utils/ApiError");

// All three movers use a single atomic findOneAndUpdate ($inc + a conditional
// filter) instead of read -> compute in JS -> save. Two concurrent requests
// against the same stock doc can no longer both read the same starting value
// and clobber each other — the check-and-decrement happens as one indivisible
// database operation. Upsert only applies when adding stock (quantity >= 0);
// a deduction against a stock doc that doesn't exist yet has nothing to
// deduct from, so it must fail the same way as "insufficient stock" would.

const moveMilkStock = async ({ quantity, transactionType, refModel, refId, remark, createdBy }) => {
  const filter = { key: "central" };
  if (quantity < 0) filter.currentQty = { $gte: -quantity };

  const stock = await MilkStock.findOneAndUpdate(
    filter,
    { $inc: { currentQty: quantity } },
    { new: true, upsert: quantity >= 0 }
  );
  if (!stock) throw new ApiError(400, "Insufficient milk stock for this operation");

  await StockLedger.create({
    stockType: "milk",
    quantity,
    balanceAfter: stock.currentQty,
    transactionType,
    refModel,
    refId,
    remark,
    createdBy,
  });

  return stock;
};

const moveCentralItemStock = async ({ item, quantity, transactionType, refModel, refId, remark, createdBy }) => {
  const filter = { item };
  if (quantity < 0) filter.currentQty = { $gte: -quantity };

  const stock = await CentralItemStock.findOneAndUpdate(
    filter,
    { $inc: { currentQty: quantity } },
    { new: true, upsert: quantity >= 0 }
  );
  if (!stock) throw new ApiError(400, "Insufficient central item stock for this operation");

  await StockLedger.create({
    stockType: "central_item",
    item,
    quantity,
    balanceAfter: stock.currentQty,
    transactionType,
    refModel,
    refId,
    remark,
    createdBy,
  });

  return stock;
};

const moveDairyItemStock = async ({ dairy, item, quantity, transactionType, refModel, refId, remark, createdBy }) => {
  const filter = { dairy, item };
  if (quantity < 0) filter.currentQty = { $gte: -quantity };

  const stock = await DairyItemStock.findOneAndUpdate(
    filter,
    { $inc: { currentQty: quantity } },
    { new: true, upsert: quantity >= 0 }
  );
  if (!stock) throw new ApiError(400, "Insufficient dairy item stock for this operation");

  await StockLedger.create({
    stockType: "dairy_item",
    item,
    dairy,
    quantity,
    balanceAfter: stock.currentQty,
    transactionType,
    refModel,
    refId,
    remark,
    createdBy,
  });

  return stock;
};

module.exports = { moveMilkStock, moveCentralItemStock, moveDairyItemStock };
