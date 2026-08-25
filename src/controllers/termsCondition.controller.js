const TermsCondition = require("../models/TermsCondition.model");
const factory = require("./factory.controller");

exports.createTerms = factory.createOne(TermsCondition, "Terms & Conditions");
exports.getTermsList = factory.getAll(TermsCondition, { searchFields: ["title"] });
exports.getTerms = factory.getOne(TermsCondition, { label: "Terms & Conditions" });
exports.updateTerms = factory.updateOne(TermsCondition, "Terms & Conditions");
exports.deleteTerms = factory.deleteOne(TermsCondition, "Terms & Conditions");
exports.toggleTermsStatus = factory.toggleStatus(TermsCondition, "Terms & Conditions");
