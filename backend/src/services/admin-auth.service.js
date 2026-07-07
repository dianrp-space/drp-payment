import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import { unauthorized, conflict } from "../utils/errors.js";

const SALT_ROUNDS = 12;

export async function createAdmin({ name, email, password, apiToken }) {
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) throw conflict("Admin with this email already exists");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const token = apiToken || randomBytes(32).toString("hex");
  const adminName = name || email.split("@")[0];

  const admin = await prisma.admin.create({
    data: { name: adminName, email, passwordHash, apiToken: token },
  });
  return admin;
}

export async function login(email, password) {
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) throw unauthorized("Email atau password salah");

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw unauthorized("Email atau password salah");

  return { apiToken: admin.apiToken, email: admin.email, name: admin.name };
}

export async function changeName(adminId, newName) {
  await prisma.admin.update({ where: { id: adminId }, data: { name: newName } });
}

export async function changeEmail(adminId, newEmail) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw unauthorized("Admin not found");

  const existing = await prisma.admin.findUnique({ where: { email: newEmail } });
  if (existing && existing.id !== adminId) throw conflict("Email sudah digunakan");

  await prisma.admin.update({ where: { id: adminId }, data: { email: newEmail } });
}

export async function findByToken(apiToken) {
  if (!apiToken) return null;
  return prisma.admin.findUnique({ where: { apiToken } });
}

export async function changePassword(adminId, oldPassword, newPassword) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw unauthorized("Admin not found");

  const valid = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!valid) throw unauthorized("Password lama salah");

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.admin.update({ where: { id: adminId }, data: { passwordHash } });
}

export async function getAdminByEmail(email) {
  return prisma.admin.findUnique({ where: { email } });
}
