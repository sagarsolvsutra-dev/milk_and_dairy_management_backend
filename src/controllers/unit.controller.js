const Unit = require("../models/Unit.model");
const factory = require("./factory.controller");

exports.createUnit = factory.createOne(Unit, "Unit");
exports.getUnits = factory.getAll(Unit, { searchFields: ["name", "shortCode"] });
exports.getUnit = factory.getOne(Unit, { label: "Unit" });
exports.updateUnit = factory.updateOne(Unit, "Unit");
exports.deleteUnit = factory.deleteOne(Unit, "Unit");
exports.toggleUnitStatus = factory.toggleStatus(Unit, "Unit");
