const MODULES = [
  { key: "vendor", label: "Vendors", group: "Master Settings" },
  { key: "item", label: "Items & Recipe", group: "Master Settings" },
  { key: "unit", label: "Units", group: "Master Settings" },
  { key: "gst_slab", label: "GST Slabs", group: "Master Settings" },
  { key: "city", label: "Cities", group: "Master Settings" },
  { key: "bank_detail", label: "Bank Details", group: "Master Settings" },
  { key: "terms", label: "Terms & Conditions", group: "Master Settings" },
  { key: "whatsapp_token", label: "WhatsApp Token", group: "Master Settings" },
  { key: "purchase", label: "Milk Purchase Entry", group: "Purchase" },
  { key: "purchase_ledger", label: "Purchase Ledger & Vendor Payment", group: "Purchase" },
  { key: "production", label: "Production Entry", group: "Production & Dispatch" },
  { key: "dispatch", label: "Dairy Dispatch", group: "Production & Dispatch" },
  { key: "inventory", label: "Central Inventory", group: "Inventory & Reports" },
  { key: "reports", label: "Reports", group: "Inventory & Reports" },
];

const MODULE_KEYS = MODULES.map((m) => m.key);

const fullPermissions = () => MODULE_KEYS.map((key) => ({ module: key, view: true, add: true, edit: true, delete: true }));

const emptyPermissions = () => MODULE_KEYS.map((key) => ({ module: key, view: false, add: false, edit: false, delete: false }));

module.exports = { MODULES, MODULE_KEYS, fullPermissions, emptyPermissions };
