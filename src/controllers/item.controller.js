const Item = require("../models/Item.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
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
exports.deleteItem = factory.deleteOne(Item, "Item");
exports.toggleItemStatus = factory.toggleStatus(Item, "Item");
