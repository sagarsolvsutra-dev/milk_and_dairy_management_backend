const jwt = require("jsonwebtoken");

const generateAccessToken = ({ id, role, dairy, authType }) =>
  jwt.sign({ id, role, dairy: dairy || null, authType }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const generateRefreshToken = ({ id, authType }) =>
  jwt.sign({ id, authType }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });

module.exports = { generateAccessToken, generateRefreshToken };
