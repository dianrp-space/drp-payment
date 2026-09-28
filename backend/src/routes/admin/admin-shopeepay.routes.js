import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as appSettingService from "../../services/app-setting.service.js";
import {
  testShopeepayConnection,
  getShopeepayStaticQris,
} from "../../controllers/shopeepay.controller.js";

const router = Router();

const shopeepaySettingsSchema = z.object({
  shopeepayGatewayUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  shopeepayGatewayApiKey: z.string().max(200).nullable().optional(),
});

router.get(
  "/settings/shopeepay-gateway",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await appSettingService.getShopeepayGatewaySettings();
    res.json({ settings });
  })
);

router.patch(
  "/settings/shopeepay-gateway",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = shopeepaySettingsSchema.parse(req.body);
    const settings = await appSettingService.updateShopeepayGatewaySettings(data);
    res.json({ settings });
  })
);

router.post("/shopeepay/test-connection", requireAdmin, testShopeepayConnection);
router.post("/shopeepay/qris-static", requireAdmin, getShopeepayStaticQris);

export default router;
