import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as appSettingService from "../../services/app-setting.service.js";
import {
  testGopayConnection,
  getGopayStaticQris,
  gopayLoginStart,
  gopayLoginInput,
  gopayLoginOutput,
  gopaySessionStatus,
} from "../../controllers/gopay.controller.js";

const router = Router();

const gopaySettingsSchema = z.object({
  gopayGatewayUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  gopayGatewayApiKey: z.string().max(200).nullable().optional(),
});

router.get(
  "/settings/gopay-gateway",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await appSettingService.getGopayGatewaySettings();
    res.json({ settings });
  })
);

router.patch(
  "/settings/gopay-gateway",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = gopaySettingsSchema.parse(req.body);
    const settings = await appSettingService.updateGopayGatewaySettings(data);
    res.json({ settings });
  })
);

router.post("/gopay/test-connection", requireAdmin, testGopayConnection);
router.post("/gopay/qris-static", requireAdmin, getGopayStaticQris);
router.post("/gopay/login/start", requireAdmin, gopayLoginStart);
router.post("/gopay/login/input", requireAdmin, gopayLoginInput);
router.get("/gopay/login/output", requireAdmin, gopayLoginOutput);
router.get("/gopay/login/session-status", requireAdmin, gopaySessionStatus);

export default router;
