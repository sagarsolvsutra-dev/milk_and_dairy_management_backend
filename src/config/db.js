const mongoose = require("mongoose");
const dns = require("dns");

// Some Windows dev machines have a local DNS stub (127.0.0.1, often added by
// a VPN/network tool) that resolves plain A records but refuses SRV lookups
// — which an Atlas mongodb+srv:// URI needs to find its real cluster hosts.
// Only worth overriding for the +srv form; a local mongodb:// URI never
// needs SRV resolution and shouldn't have its DNS behavior changed.
if (process.env.MONGO_URI?.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
