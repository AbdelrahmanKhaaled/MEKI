"use client";

import { AlertTriangle, Inbox, Lock, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useLocale } from "./Providers";

export const Skeleton = ({ className = "h-4 w-full" }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function WidgetSkeleton({ rows = 3, minH = "min-h-40" }: { rows?: number; minH?: string }) {
  const { t } = useLocale();
  return (
    <div className={`flex flex-col gap-3 ${minH}`} role="status" aria-label={t.states.loading}>
      <Skeleton className="h-6 w-2/5" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ text, icon: Icon = Inbox, minH = "min-h-40" }: { text: string; icon?: typeof Inbox; minH?: string }) {
  return (
    <div className={`flex ${minH} flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted`} role="status">
      <Icon className="size-8 opacity-60" aria-hidden="true" />
      <p className="max-w-xs">{text}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, minH = "min-h-40" }: { error?: unknown; onRetry?: () => void; minH?: string }) {
  const { t } = useLocale();
  const forbidden = error instanceof ApiError && error.status === 403;
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className={`flex ${minH} flex-col items-center justify-center gap-3 px-4 text-center text-sm`} role="alert">
      {forbidden ? <Lock className="size-8 text-muted" aria-hidden="true" /> : notFound ? <Inbox className="size-8 text-muted" aria-hidden="true" /> : <AlertTriangle className="size-8 text-danger" aria-hidden="true" />}
      <p className="max-w-xs text-body">{forbidden ? t.states.forbidden : notFound ? t.states.notFound : t.states.error}</p>
      {!forbidden && !notFound && onRetry && (
        <button type="button" onClick={onRetry} className="btn-admin btn-ghost">
          <RefreshCw className="size-4" aria-hidden="true" /> {t.states.retry}
        </button>
      )}
    </div>
  );
}

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * One wrapper for every data widget: loading skeleton, error (with retry; 403 shown as "no access", not as a failure),
 * "unavailable" when the user lacks the permission or the data cannot exist yet, and an honest empty state.
 */
export function WidgetState({
  q,
  unavailable,
  isEmpty,
  emptyText,
  minH,
  children,
}: {
  q: QueryLike;
  /** text shown instead of data when the section is not available to this user / not set up (no request was made) */
  unavailable?: { text: string; locked?: boolean } | false;
  isEmpty?: boolean;
  emptyText?: string;
  minH?: string;
  children: React.ReactNode;
}) {
  if (unavailable) return <EmptyState text={unavailable.text} icon={unavailable.locked ? Lock : Inbox} minH={minH} />;
  if (q.isPending) return <WidgetSkeleton minH={minH} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH={minH} />;
  if (isEmpty) return <EmptyState text={emptyText ?? ""} minH={minH} />;
  return <>{children}</>;
}
