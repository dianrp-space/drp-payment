import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth.js";
import {
  createBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
} from "../../controllers/backup.controller.js";

const router = Router();

// All backup routes require admin authentication
router.use(requireAdmin);

router.post("/backups", createBackup);
router.get("/backups", listBackups);
router.get("/backups/:filename", downloadBackup);
router.delete("/backups/:filename", deleteBackup);
router.post("/backups/:filename/restore", restoreBackup);

export default router;
