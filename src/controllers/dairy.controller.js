const Dairy = require("../models/Dairy.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const DispatchEntry = require("../models/DispatchEntry.model");
const Bill = require("../models/Bill.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { nextSequence } = require("../services/sequence.service");
const factory = require("./factory.controller");

exports.createDairy = asyncHandler(async (req, res) => {
  const code = req.body.code || (await nextSequence("dairy", "DRY-"));
  const dairy = await Dairy.create({ ...req.body, code });
  const safe = dairy.toObject();
  delete safe.password;
  res.status(201).json(new ApiResponse(201, safe, "Dairy created successfully"));
});

exports.getDairies = factory.getAll(Dairy, { searchFields: ["name", "code", "mobile", "address", "loginId"] });
exports.getDairy = factory.getOne(Dairy, { label: "Dairy" });

exports.updateDairy = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  const dairy = await Dairy.findByIdAndUpdate(req.params.id, rest, {
    new: true,
    runValidators: true,
  });
  if (!dairy) throw new ApiError(404, "Dairy not found");
  res.status(200).json(new ApiResponse(200, dairy, "Dairy updated successfully"));
});

exports.deleteDairy = factory.deleteOne(Dairy, "Dairy");

exports.toggleDairyStatus = asyncHandler(async (req, res) => {
  // Atomic flip — a read-then-write would lose an update if two toggle
  // requests for the same dairy overlap (e.g. an impatient double-click).
  const dairy = await Dairy.findByIdAndUpdate(
    req.params.id,
    [{ $set: { status: { $cond: [{ $eq: ["$status", "active"] }, "inactive", "active"] } } }],
    { new: true, updatePipeline: true }
  );
  if (!dairy) throw new ApiError(404, "Dairy not found");
  res.status(200).json(new ApiResponse(200, dairy, "Dairy status updated"));
});

exports.getDairySummary = asyncHandler(async (req, res) => {
  const dairy = await Dairy.findById(req.params.id).lean();
  if (!dairy) throw new ApiError(404, "Dairy not found");

  // Dispatch/bill history are fetched separately via the paginated /dispatch
  // and /bills endpoints (?dairy=<id>) — this summary only needs aggregate
  // totals, so sum them in the database rather than loading every document.
  const [currentStock, dispatchAgg, billAgg] = await Promise.all([
    DairyItemStock.find({ dairy: dairy._id }).populate("item", "name code unit minStockAlert").lean(),
    DispatchEntry.aggregate([
      { $match: { dairy: dairy._id, status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: null, total: { $sum: "$items.quantity" } } },
    ]),
    Bill.aggregate([
      { $match: { dairy: dairy._id, status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: null, totalQty: { $sum: "$items.quantity" } } },
    ]),
  ]);

  // grandTotal is per-bill, not per-item, so sum it separately from the item unwind above.
  const salesAmountAgg = await Bill.aggregate([
    { $match: { dairy: dairy._id, status: "active" } },
    { $group: { _id: null, total: { $sum: "$grandTotal" } } },
  ]);

  const currentStockTotal = currentStock.reduce((sum, s) => sum + s.currentQty, 0);

  res.status(200).json(
    new ApiResponse(200, {
      dairy,
      currentStock,
      currentStockTotal,
      totalDispatched: dispatchAgg[0]?.total || 0,
      totalSold: billAgg[0]?.totalQty || 0,
      totalSalesAmount: salesAmountAgg[0]?.total || 0,
    })
  );
});

exports.resetDairyPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    throw new ApiError(400, "Password must be at least 4 characters");
  }
  const dairy = await Dairy.findById(req.params.id);
  if (!dairy) throw new ApiError(404, "Dairy not found");
  dairy.password = password;
  await dairy.save({ validateModifiedOnly: true });
  res.status(200).json(new ApiResponse(200, null, "Dairy password reset successfully"));
});
