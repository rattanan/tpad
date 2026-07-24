import { z } from "zod";
import { roleValues, statusValues } from "@/lib/db/schema";

export const loginSchema = z.object({ identifier: z.string().trim().min(1).max(190), password: z.string().min(1).max(256), rememberMe: z.boolean().optional().default(false) });
export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160), username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().toLowerCase().email().max(190), role: z.enum(roleValues), status: z.enum(statusValues).default("ACTIVE"),
  password: z.string().min(10).max(256), mustChangePassword: z.boolean().default(true), adminNotes: z.string().trim().max(2000).optional(),
});
export const updateUserSchema = z.object({ fullName: z.string().trim().min(2).max(160).optional(), username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional(), email: z.string().trim().toLowerCase().email().max(190).optional(), role: z.enum(roleValues).optional(), status: z.enum(statusValues).optional(), mustChangePassword: z.boolean().optional(), adminNotes: z.string().trim().max(2000).nullable().optional() }).strict();
export const resetPasswordSchema = z.object({ password: z.string().min(10).max(256).optional(), generate: z.boolean().default(false) }).refine((value) => value.generate || value.password, { message: "Password is required" });
export const changePasswordSchema = z.object({ currentPassword: z.string().max(256).optional(), newPassword: z.string().min(10).max(256), confirmPassword: z.string().max(256) }).refine((value) => value.newPassword === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
