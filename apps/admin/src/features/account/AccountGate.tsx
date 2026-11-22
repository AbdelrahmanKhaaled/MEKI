"use client";

import { useAuth } from "@/features/auth/AuthProvider";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * While the account must change its password (temporary password from admin:bootstrap, a reset, or a user created in Users &
 * Roles), every page shows the change form instead: the API refuses all other routes with PASSWORD_CHANGE_REQUIRED.
 */
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.mustChangePassword ? <ChangePasswordForm forced /> : <>{children}</>;
}
