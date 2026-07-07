import { Router } from "express";
import { requireInternal } from "../../middlewares/auth.js";
import { handleCallback, handleMerchantCallback } from "../../controllers/callback.controller.js";

const router = Router();

// Global callback (backward compatible) — auth via X-Internal-Token
router.post("/callback", requireInternal, handleCallback);

// Per-merchant callback — auth via X-Callback-Token (merchant.callbackToken)
router.post("/callback/:merchantId", handleMerchantCallback);

export default router;
