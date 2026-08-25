const PurchaseEntry = require("../models/PurchaseEntry.model");
const ProductionEntry = require("../models/ProductionEntry.model");
const Bill = require("../models/Bill.model");
const Vendor = require("../models/Vendor.model");
const Dairy = require("../models/Dairy.model");
const MilkStock = require("../models/MilkStock.model");
const CentralItemStock = require("../models/CentralItemStock.model");
const DairyItemStock = require("../models/DairyItemStock.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

exports.getSuperAdminDashboard = asyncHandler(async (req, res) => {
  const today = startOfToday();

  const [todayPurchase, milkStock, todayProduction, vendorsWithDue, activeDairies, totalDairies, centralStocks] =
    await Promise.all([
      PurchaseEntry.aggregate([
        { $match: { date: { $gte: today }, status: "active" } },
        { $group: { _id: null, totalQty: { $sum: "$quantity" }, totalAmount: { $sum: "$netPayable" } } },
      ]),
      MilkStock.findOne({ key: "central" }).lean(),
      ProductionEntry.aggregate([
        { $match: { date: { $gte: today }, status: "active" } },
        { $unwind: "$items" },
        { $group: { _id: "$items.item", quantity: { $sum: "$items.quantity" } } },
      ]),
      Vendor.countDocuments({ currentBalance: { $gt: 0 } }),
      Dairy.countDocuments({ status: "active" }),
      Dairy.countDocuments(),
      CentralItemStock.find().populate("item", "name minStockAlert").lean(),
    ]);

  const lowStockItems = centralStocks.filter((s) => s.item && s.currentQty <= s.item.minStockAlert);

  res.status(200).json(
    new ApiResponse(200, {
      todayMilkPurchaseQty: todayPurchase[0]?.totalQty || 0,
      todayMilkPurchaseAmount: todayPurchase[0]?.totalAmount || 0,
      currentMilkStock: milkStock?.currentQty || 0,
      todayProductionByItem: todayProduction,
      vendorsWithDue,
      activeDairies,
      totalDairies,
      lowStockItemsCount: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 10),
    })
  );
});

exports.getDairyDashboard = asyncHandler(async (req, res) => {
  const dairy = req.user.dairy;
  const today = startOfToday();

  const [stocks, todayBills, recentBills] = await Promise.all([
    DairyItemStock.find({ dairy }).populate("item", "name code minStockAlert").lean(),
    Bill.aggregate([
      { $match: { dairy, date: { $gte: today }, status: "active" } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$grandTotal" } } },
    ]),
    Bill.find({ dairy }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const lowStockItems = stocks.filter((s) => s.item && s.currentQty <= s.item.minStockAlert);

  res.status(200).json(
    new ApiResponse(200, {
      itemWiseStock: stocks,
      todayBillCount: todayBills[0]?.count || 0,
      todaySalesAmount: todayBills[0]?.total || 0,
      recentBills,
      lowStockItems,
    })
  );
});

exports.getAnalytics = asyncHandler(async (req, res) => {
  const days = 30;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const [purchaseTrend, productionByItem, dairySales, topItems] = await Promise.all([
    PurchaseEntry.aggregate([
      { $match: { date: { $gte: from }, status: "active" } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, totalQty: { $sum: "$quantity" } } },
      { $sort: { _id: 1 } },
    ]),
    ProductionEntry.aggregate([
      { $match: { date: { $gte: from }, status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" } } },
      { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $project: { itemName: "$item.name", totalQty: 1 } },
    ]),
    Bill.aggregate([
      { $match: { date: { $gte: from }, status: "active" } },
      { $group: { _id: "$dairy", totalSales: { $sum: "$grandTotal" } } },
      { $lookup: { from: "dairies", localField: "_id", foreignField: "_id", as: "dairy" } },
      { $unwind: "$dairy" },
      { $project: { dairyName: "$dairy.name", totalSales: 1 } },
    ]),
    Bill.aggregate([
      { $match: { date: { $gte: from }, status: "active" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.item", totalQty: { $sum: "$items.quantity" } } },
      { $sort: { totalQty: -1 } },
      { $limit: 10 },
      { $lookup: { from: "items", localField: "_id", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $project: { itemName: "$item.name", totalQty: 1 } },
    ]),
  ]);

  res.status(200).json(new ApiResponse(200, { purchaseTrend, productionByItem, dairySales, topItems }));
});
