import { notFound } from "next/navigation";

/**
 * Phase 7: any unknown path under /en or /ar renders the localized, branded not-found page ([locale]/not-found.tsx, with the
 * site header and footer) instead of the framework's generic 404. Real routes always take precedence over this catch-all.
 */
export default function UnknownPage() {
  notFound();
}
