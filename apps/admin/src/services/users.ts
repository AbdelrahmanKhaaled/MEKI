/** Own password + Users & Roles: one function per existing endpoint (apps/api auth.controller.ts, users.module.ts). */
import { z } from "zod";
import { apiGet, apiList, apiPatch, apiPost, type Query } from "@/lib/api";

export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  createdAt: z.string(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  userCount: z.number(),
  permissions: z.array(z.string()),
});
export type Role = z.infer<typeof RoleSchema>;

const id = encodeURIComponent;

// own password (allowed while a password change is pending)
export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost("/admin/auth/password/change", z.object({ changed: z.literal(true) }), { currentPassword, newPassword });

// users (users.read / users.manage) and roles (roles.read)
export const listUsers = (q: Query) => apiList("/admin/users", AdminUserSchema, q);
export const createUser = (b: { email: string; name: string; temporaryPassword: string; roleKeys: string[] }) => apiPost("/admin/users", AdminUserSchema, b);
export const updateUser = (userId: string, b: { name?: string; roleKeys?: string[] }) => apiPatch(`/admin/users/${id(userId)}`, AdminUserSchema, b);
export const setUserActive = (userId: string, isActive: boolean) => apiPatch(`/admin/users/${id(userId)}/status`, AdminUserSchema, { isActive });
export const listRoles = () => apiGet("/admin/roles", z.array(RoleSchema));

export { passwordProblems } from "@/lib/password-policy";
