const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

const createOne = (Model, label = "Record") =>
  asyncHandler(async (req, res) => {
    const doc = await Model.create(req.body);
    res.status(201).json(new ApiResponse(201, doc, `${label} created successfully`));
  });

const getAll = (Model, { searchFields = [], populate = [] } = {}) =>
  asyncHandler(async (req, res) => {
    const { search = "", page = 1, limit = 10, isActive, status } = req.query;
    const filter = {};

    if (search && searchFields.length) {
      filter.$or = searchFields.map((f) => ({ [f]: { $regex: search, $options: "i" } }));
    }
    if (isActive !== undefined) filter.isActive = isActive === "true";
    // Models like Dairy use a "status: active/inactive" string instead of an isActive boolean.
    if (status !== undefined) filter.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));

    // .lean() — this list is only ever serialized to JSON, never mutated, so
    // skip Mongoose's document hydration (change-tracking, getters/setters)
    // and return plain objects straight from the driver.
    let query = Model.find(filter).sort({ createdAt: -1 }).lean();
    populate.forEach((p) => (query = query.populate(p)));

    const [items, total] = await Promise.all([
      query.skip((pageNum - 1) * limitNum).limit(limitNum),
      Model.countDocuments(filter),
    ]);

    res.status(200).json(
      new ApiResponse(200, {
        items,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum) || 1,
      })
    );
  });

const getOne = (Model, { populate = [], label = "Record" } = {}) =>
  asyncHandler(async (req, res) => {
    let query = Model.findById(req.params.id).lean();
    populate.forEach((p) => (query = query.populate(p)));
    const doc = await query;
    if (!doc) throw new ApiError(404, `${label} not found`);
    res.status(200).json(new ApiResponse(200, doc));
  });

const updateOne = (Model, label = "Record") =>
  asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) throw new ApiError(404, `${label} not found`);
    res.status(200).json(new ApiResponse(200, doc, `${label} updated successfully`));
  });

const deleteOne = (Model, label = "Record") =>
  asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) throw new ApiError(404, `${label} not found`);
    res.status(200).json(new ApiResponse(200, null, `${label} deleted successfully`));
  });

const toggleStatus = (Model, label = "Record") =>
  asyncHandler(async (req, res) => {
    // Atomic flip via an aggregation-pipeline update — a read-then-write
    // (findById → mutate → save) would lose an update if two toggle requests
    // for the same row overlap (e.g. an impatient double-click).
    const doc = await Model.findByIdAndUpdate(req.params.id, [{ $set: { isActive: { $not: "$isActive" } } }], {
      new: true,
      updatePipeline: true,
    });
    if (!doc) throw new ApiError(404, `${label} not found`);
    res.status(200).json(new ApiResponse(200, doc, `${label} status updated`));
  });

module.exports = { createOne, getAll, getOne, updateOne, deleteOne, toggleStatus };
