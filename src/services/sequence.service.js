const Counter = require("../models/Counter.model");

const nextSequence = async (key, prefix, padLength = 4) => {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const num = String(counter.seq).padStart(padLength, "0");
  return `${prefix}${num}`;
};

module.exports = { nextSequence };
