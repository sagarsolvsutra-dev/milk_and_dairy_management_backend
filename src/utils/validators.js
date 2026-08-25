const MOBILE_REGEX = /^\d{10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const mobileField = ({ required = true } = {}) => ({
  type: String,
  required,
  trim: true,
  validate: {
    validator: (v) => !v || MOBILE_REGEX.test(v),
    message: "Mobile number must be exactly 10 digits",
  },
});

const emailField = ({ required = true, unique = false } = {}) => ({
  type: String,
  required,
  unique,
  trim: true,
  lowercase: true,
  validate: {
    validator: (v) => !v || EMAIL_REGEX.test(v),
    message: "Please enter a valid email address",
  },
});

const ifscField = ({ required = false } = {}) => ({
  type: String,
  required,
  trim: true,
  uppercase: true,
  validate: {
    validator: (v) => !v || IFSC_REGEX.test(v),
    message: "Please enter a valid IFSC code (e.g. SBIN0001234)",
  },
});

module.exports = { MOBILE_REGEX, EMAIL_REGEX, IFSC_REGEX, mobileField, emailField, ifscField };
