const mongoose = require("mongoose");

const stockLedgerSchema = new mongoose.Schema(
  {
    stockType: {
      type: String,
      enum: ["milk", "central_item", "dairy_item"],
      required: true,
    },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    dairy: { type: mongoose.Schema.Types.ObjectId, ref: "Dairy", default: null },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    transactionType: {
      type: String,
      enum: [
        "purchase",
        "production_in",
        "production_out",
        "dispatch_out",
        "dispatch_in",
        "sale_out",
        "sale_cancel_in",
        "adjustment",
      ],
      required: true,
    },
    refModel: { type: String, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    remark: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

stockLedgerSchema.index({ stockType: 1, item: 1, dairy: 1, date: -1 });
// getStockTrace filters by item alone (no stockType) — the compound index
// above doesn't help there since item isn't its leftmost field.
stockLedgerSchema.index({ item: 1, date: 1 });

module.exports = mongoose.model("StockLedger", stockLedgerSchema);
