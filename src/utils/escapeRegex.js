// A raw search string dropped straight into a Mongo $regex crashes the query
// with a 500 the moment a user types an ordinary character like "(" or "[" —
// escape every regex metacharacter first so search behaves like a plain
// substring match regardless of what's typed.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { escapeRegex };
