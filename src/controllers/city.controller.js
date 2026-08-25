const City = require("../models/City.model");
const factory = require("./factory.controller");

exports.createCity = factory.createOne(City, "City");
exports.getCities = factory.getAll(City, { searchFields: ["name", "state"] });
exports.getCity = factory.getOne(City, { label: "City" });
exports.updateCity = factory.updateOne(City, "City");
exports.deleteCity = factory.deleteOne(City, "City");
exports.toggleCityStatus = factory.toggleStatus(City, "City");
