require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const User = require("../models/User.model");
const Vendor = require("../models/Vendor.model");
const Item = require("../models/Item.model");
const Dairy = require("../models/Dairy.model");
const Unit = require("../models/Unit.model");
const GstSlab = require("../models/GstSlab.model");
const City = require("../models/City.model");
const BankDetail = require("../models/BankDetail.model");
const TermsCondition = require("../models/TermsCondition.model");
const WhatsappToken = require("../models/WhatsappToken.model");
const PurchaseEntry = require("../models/PurchaseEntry.model");
const VendorPayment = require("../models/VendorPayment.model");
const VendorLedgerEntry = require("../models/VendorLedgerEntry.model");
const ProductionEntry = require("../models/ProductionEntry.model");
const DispatchEntry = require("../models/DispatchEntry.model");
const Bill = require("../models/Bill.model");
const MilkStock = require("../models/MilkStock.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const StockLedger = require("../models/StockLedger.model");
const StockAdjustment = require("../models/StockAdjustment.model");
const Notification = require("../models/Notification.model");
const ActivityLog = require("../models/ActivityLog.model");
const LoginHistory = require("../models/LoginHistory.model");
const Counter = require("../models/Counter.model");

const run = async () => {
  await connectDB();

  // Wipe every collection except the super_admin User accounts.
  const staffResult = await User.deleteMany({ role: { $ne: "super_admin" } });

  const results = await Promise.all([
    Vendor.deleteMany({}),
    Item.deleteMany({}),
    Dairy.deleteMany({}),
    Unit.deleteMany({}),
    GstSlab.deleteMany({}),
    City.deleteMany({}),
    BankDetail.deleteMany({}),
    TermsCondition.deleteMany({}),
    WhatsappToken.deleteMany({}),
    PurchaseEntry.deleteMany({}),
    VendorPayment.deleteMany({}),
    VendorLedgerEntry.deleteMany({}),
    ProductionEntry.deleteMany({}),
    DispatchEntry.deleteMany({}),
    Bill.deleteMany({}),
    MilkStock.deleteMany({}),
    CentralItemStock.deleteMany({}),
    DairyItemStock.deleteMany({}),
    StockLedger.deleteMany({}),
    StockAdjustment.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
    LoginHistory.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  const labels = [
    "Vendor", "Item", "Dairy", "Unit", "GstSlab", "City", "BankDetail", "TermsCondition",
    "WhatsappToken", "PurchaseEntry", "VendorPayment", "VendorLedgerEntry", "ProductionEntry",
    "DispatchEntry", "Bill", "MilkStock", "CentralItemStock", "DairyItemStock", "StockLedger",
    "StockAdjustment", "Notification", "ActivityLog", "LoginHistory", "Counter",
  ];

  console.log(`Deleted ${staffResult.deletedCount} staff/dairy-user account(s)`);
  results.forEach((r, i) => console.log(`Deleted ${r.deletedCount} ${labels[i]} document(s)`));

  const remainingAdmins = await User.countDocuments({ role: "super_admin" });
  console.log(`\nSuper Admin accounts kept: ${remainingAdmins}`);
  console.log("Wipe complete — database is clean except for Super Admin login(s).");

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
