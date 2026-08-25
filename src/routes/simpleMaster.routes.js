const router = require("express").Router();
const { protect } = require("../middleware/auth.middleware");
const { canDo } = require("../middleware/role.middleware");

const unit = require("../controllers/unit.controller");
const gst = require("../controllers/gstSlab.controller");
const city = require("../controllers/city.controller");
const bank = require("../controllers/bankDetail.controller");
const terms = require("../controllers/termsCondition.controller");
const whatsapp = require("../controllers/whatsappToken.controller");

const mount = (path, module, permissionModule, c, { hasToggle = true, listFn } = {}) => {
  router.get(`/${path}`, protect, ...canDo(permissionModule, "view"), c[listFn || `get${module}s`]);
  router.post(`/${path}`, protect, ...canDo(permissionModule, "add"), c[`create${module}`]);
  router.get(`/${path}/:id`, protect, ...canDo(permissionModule, "view"), c[`get${module}`]);
  router.put(`/${path}/:id`, protect, ...canDo(permissionModule, "edit"), c[`update${module}`]);
  if (hasToggle) {
    router.patch(`/${path}/:id/toggle-status`, protect, ...canDo(permissionModule, "edit"), c[`toggle${module}Status`]);
  }
  router.delete(`/${path}/:id`, protect, ...canDo(permissionModule, "delete"), c[`delete${module}`]);
};

mount("units", "Unit", "unit", unit);
mount("gst-slabs", "GstSlab", "gst_slab", gst);
mount("cities", "City", "city", city, { listFn: "getCities" });
mount("terms", "Terms", "terms", terms, { listFn: "getTermsList" });
mount("whatsapp-tokens", "WhatsappToken", "whatsapp_token", whatsapp);
mount("bank-details", "BankDetail", "bank_detail", bank, { hasToggle: false });

module.exports = router;
