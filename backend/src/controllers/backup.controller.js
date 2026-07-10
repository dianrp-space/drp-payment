import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as backupService from "../services/backup.service.js";

export const createBackup = asyncHandler(async (_req, res) => {
  const backup = await backupService.createBackup();
  res.status(201).json(backup);
});

export const listBackups = asyncHandler(async (_req, res) => {
  const backups = backupService.listBackups();
  res.json({ backups });
});

export const downloadBackup = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const filepath = backupService.getBackupPath(filename);
  res.download(filepath);
});

const deleteSchema = z.object({
  filename: z.string().min(1),
});

export const deleteBackup = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  backupService.deleteBackup(filename);
  res.json({ ok: true });
});

export const restoreBackup = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const result = await backupService.restoreBackup(filename);
  res.json(result);
});
