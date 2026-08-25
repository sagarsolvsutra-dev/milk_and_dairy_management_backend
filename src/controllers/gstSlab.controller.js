const GstSlab = require("../models/GstSlab.model");
const factory = require("./factory.controller");

exports.createGstSlab = factory.createOne(GstSlab, "GST Slab");
exports.getGstSlabs = factory.getAll(GstSlab, { searchFields: ["label"] });
exports.getGstSlab = factory.getOne(GstSlab, { label: "GST Slab" });
exports.updateGstSlab = factory.updateOne(GstSlab, "GST Slab");
exports.deleteGstSlab = factory.deleteOne(GstSlab, "GST Slab");
exports.toggleGstSlabStatus = factory.toggleStatus(GstSlab, "GST Slab");
