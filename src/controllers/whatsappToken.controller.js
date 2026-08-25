const WhatsappToken = require("../models/WhatsappToken.model");
const factory = require("./factory.controller");

exports.createWhatsappToken = factory.createOne(WhatsappToken, "WhatsApp Token");
exports.getWhatsappTokens = factory.getAll(WhatsappToken, { searchFields: ["provider", "senderNumber"] });
exports.getWhatsappToken = factory.getOne(WhatsappToken, { label: "WhatsApp Token" });
exports.updateWhatsappToken = factory.updateOne(WhatsappToken, "WhatsApp Token");
exports.deleteWhatsappToken = factory.deleteOne(WhatsappToken, "WhatsApp Token");
exports.toggleWhatsappTokenStatus = factory.toggleStatus(WhatsappToken, "WhatsApp Token");
