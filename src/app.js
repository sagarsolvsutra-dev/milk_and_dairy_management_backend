const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();

// Strip a trailing slash from each configured origin — a browser's Origin
// header never has one, so "https://x.vercel.app/" in CLIENT_URL would
// otherwise silently never match "https://x.vercel.app" and get rejected.
const stripTrailingSlash = (url) => url.replace(/\/+$/, "");
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => stripTrailingSlash(o.trim()))
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(stripTrailingSlash(origin))) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
// Gzip every JSON response — list/report payloads are the biggest thing this
// API sends, and they compress especially well (repeated field names/values).
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
