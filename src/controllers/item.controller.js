const Item = require("../models/Item.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const ProductionEntry = require("../models/ProductionEntry.model");
const DispatchEntry = require("../models/DispatchEntry.model");
const Bill = require("../models/Bill.model");
const StockAdjustment = require("../models/StockAdjustment.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const factory = require("./factory.controller");

exports.createItem = asyncHandler(async (req, res) => {
  const code = req.body.code || (await nextSequence("item", "ITM-"));
  const item = await Item.create({ ...req.body, code });
  await CentralItemStock.create({ item: item._id, currentQty: 0 });
  res.status(201).json(new ApiResponse(201, item, "Item created successfully"));
});

exports.getItems = factory.getAll(Item, {
  searchFields: ["name", "code", "category"],
  populate: ["unit", "gstSlab"],
});
exports.getItem = factory.getOne(Item, { label: "Item", populate: ["unit", "gstSlab"] });
exports.updateItem = factory.updateOne(Item, "Item");
exports.deleteItem = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [inProduction, inDispatch, inBills, inAdjustments] = await Promise.all([
    ProductionEntry.exists({ "items.item": id }),
    DispatchEntry.exists({ "items.item": id }),
    Bill.exists({ "items.item": id }),
    StockAdjustment.exists({ item: id }),
  ]);
  if (inProduction || inDispatch || inBills || inAdjustments) {
    throw new ApiError(
      400,
      "This item has production, dispatch, billing, or stock-adjustment history and can't be deleted — deactivate it instead to hide it from new entries without losing past records."
    );
  }

  const item = await Item.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, "Item not found");

  // Safe to drop now — no history exists (including manual adjustments), so
  // these can only be zero-stock rows.
  await Promise.all([CentralItemStock.deleteOne({ item: id }), DairyItemStock.deleteMany({ item: id })]);

  res.status(200).json(new ApiResponse(200, null, "Item deleted successfully"));
});
exports.toggleItemStatus = factory.toggleStatus(Item, "Item");
