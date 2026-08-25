const BankDetail = require("../models/BankDetail.model");
const factory = require("./factory.controller");

exports.createBankDetail = factory.createOne(BankDetail, "Bank Detail");
exports.getBankDetails = factory.getAll(BankDetail, { searchFields: ["accountName", "bankName"] });
exports.getBankDetail = factory.getOne(BankDetail, { label: "Bank Detail" });
exports.updateBankDetail = factory.updateOne(BankDetail, "Bank Detail");
exports.deleteBankDetail = factory.deleteOne(BankDetail, "Bank Detail");
