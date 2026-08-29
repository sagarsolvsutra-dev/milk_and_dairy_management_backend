const Unit = require("../models/Unit.model");
const Item = require("../models/Item.model");
const factory = require("./factory.controller");

exports.createUnit = factory.createOne(Unit, "Unit");
exports.getUnits = factory.getAll(Unit, { searchFields: ["name", "shortCode"] });
exports.getUnit = factory.getOne(Unit, { label: "Unit" });
exports.updateUnit = factory.updateOne(Unit, "Unit");
exports.deleteUnit = factory.deleteOne(Unit, "Unit", {
  checkDependents: async (id) => {
    const hasItems = await Item.exists({ unit: id });
    return hasItems ? "This unit is used by one or more items and can't be deleted." : null;
  },
});
exports.toggleUnitStatus = factory.toggleStatus(Unit, "Unit");
