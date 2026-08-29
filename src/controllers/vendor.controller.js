const Vendor = require("../models/Vendor.model");
const VendorLedgerEntry = require("../models/VendorLedgerEntry.model");
const PurchaseEntry = require("../models/PurchaseEntry.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { dateRangeFilter } = require("../utils/dateRangeFilter");
const { escapeRegex } = require("../utils/escapeRegex");
const factory = require("./factory.controller");

exports.createVendor = asyncHandler(async (req, res) => {
  const opening = Number(req.body.openingBalance) || 0;
  const vendor = await Vendor.create({ ...req.body, currentBalance: opening });

  if (opening !== 0) {
    await VendorLedgerEntry.create({
      vendor: vendor._id,
      date: new Date(),
      particulars: "Opening Balance",
      credit: opening > 0 ? opening : 0,
      debit: opening < 0 ? Math.abs(opening) : 0,
      balanceAfter: opening,
      refModel: "Opening",
    });
  }

  res.status(201).json(new ApiResponse(201, vendor, "Vendor created successfully"));
});

exports.getVendors = factory.getAll(Vendor, { searchFields: ["name", "mobile", "address"], populate: ["city"] });
exports.getVendor = factory.getOne(Vendor, { label: "Vendor", populate: ["city"] });
// Whitelisted, not the generic factory.updateOne — currentBalance/openingBalance
// must only ever change through a matching VendorLedgerEntry (via a purchase or
// payment), never directly from a client-supplied edit request.
exports.updateVendor = asyncHandler(async (req, res) => {
  const { name, mobile, address, city, bankDetail } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (mobile !== undefined) update.mobile = mobile;
  if (address !== undefined) update.address = address;
  if (city !== undefined) update.city = city;
  if (bankDetail !== undefined) update.bankDetail = bankDetail;

  const vendor = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!vendor) throw new ApiError(404, "Vendor not found");
  res.status(200).json(new ApiResponse(200, vendor, "Vendor updated successfully"));
});
exports.deleteVendor = factory.deleteOne(Vendor, "Vendor", {
  checkDependents: async (id) => {
    const hasPurchases = await PurchaseEntry.exists({ vendor: id });
    return hasPurchases
      ? "This vendor has purchase history and can't be deleted — deactivate it instead to hide it from new entries without losing past records."
      : null;
  },
});
exports.toggleVendorStatus = factory.toggleStatus(Vendor, "Vendor");

exports.getVendorLedger = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).lean();
  if (!vendor) throw new ApiError(404, "Vendor not found");

  let { search, from, to, page = 1, limit = 10 } = req.query;
  if (search) search = escapeRegex(search);
  const filter = { vendor: vendor._id };
  if (search) {
    filter.$or = [
      { particulars: { $regex: search, $options: "i" } },
      { refModel: { $regex: search, $options: "i" } }
    ];
  }
  if (from || to) filter.date = dateRangeFilter(from, to);

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));

  const [entries, total] = await Promise.all([
    VendorLedgerEntry.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    VendorLedgerEntry.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      vendor,
      entries,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      closingBalance: vendor.currentBalance,
    })
  );
});
