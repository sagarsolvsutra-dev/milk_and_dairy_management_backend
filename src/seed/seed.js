require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User.model");
const Unit = require("../models/Unit.model");
const GstSlab = require("../models/GstSlab.model");

const run = async () => {
  await connectDB();

  const existingAdmin = await User.findOne({ role: "super_admin" });
  if (!existingAdmin) {
    await User.create({
      name: "Super Admin",
      mobile: "9999999999",
      email: "admin@solvsutra.com",
      loginId: "admin",
      password: "admin123",
      role: "super_admin",
      isActive: true,
    });
    console.log("Super Admin created — loginId: admin / password: admin123");
  } else {
    console.log("Super Admin already exists — skipping");
  }

  const unitCount = await Unit.countDocuments();
  if (unitCount === 0) {
    await Unit.insertMany([
      { name: "Kilogram", shortCode: "KG" },
      { name: "Litre", shortCode: "Litre" },
      { name: "Nos", shortCode: "Nos" },
      { name: "Packet", shortCode: "Packet" },
    ]);
    console.log("Default units seeded");
  }

  const gstCount = await GstSlab.countDocuments();
  if (gstCount === 0) {
    await GstSlab.insertMany([
      { percent: 0, label: "0% (Exempt)" },
      { percent: 5, label: "5% GST" },
      { percent: 12, label: "12% GST" },
      { percent: 18, label: "18% GST" },
    ]);
    console.log("Default GST slabs seeded");
  }

  console.log("Seeding complete");
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
