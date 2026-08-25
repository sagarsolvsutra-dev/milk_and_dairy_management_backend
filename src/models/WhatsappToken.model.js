const mongoose = require("mongoose");

const whatsappTokenSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["WATI", "AiSensy", "MSG91", "Whapi"],
      required: true,
    },
    apiToken: { type: String, required: true },
    senderNumber: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsappToken", whatsappTokenSchema);
