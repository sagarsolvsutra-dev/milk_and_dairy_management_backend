require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User.model");
const { fullPermissions } = require("../constants/modules");

const run = async () => {
  await connectDB();

  const admins = await User.find({ role: "super_admin" });
  for (const admin of admins) {
    let changed = false;

    if (!admin.email) {
      admin.email = `${admin.loginId}@solvsutra.com`;
      changed = true;
    }
    if (!admin.permissions.length) {
      admin.permissions = fullPermissions();
      changed = true;
    }

    if (changed) {
      await admin.save({ validateModifiedOnly: true });
      console.log(`Updated ${admin.loginId} — email: ${admin.email}, permissions: ${admin.permissions.length} modules`);
    } else {
      console.log(`${admin.loginId} already has proper data — skipped`);
    }
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
