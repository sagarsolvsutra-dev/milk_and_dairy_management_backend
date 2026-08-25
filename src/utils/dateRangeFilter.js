/**
 * Builds a Mongo range filter for a `date` field from "from"/"to" query
 * strings. A date-only "to" string parses as UTC midnight — used as-is,
 * `$lte` would exclude every record from that day itself, since almost every
 * real entry carries a time-of-day later than midnight. Extend "to" to the
 * end of that day so the whole day is included.
 */
const dateRangeFilter = (from, to) => {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);
    range.$lte = toDate;
  }
  return range;
};

module.exports = { dateRangeFilter };
