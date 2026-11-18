"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@/lib/api";
import * as svc from "@/services/gala";

/** Stable keys ["gala", eventId, resource, params]. `enabled` mirrors the user's permission (UI only — the API decides). */
export const galaKeys = {
  all: ["gala"] as const,
  events: ["gala", "events"] as const,
  chosen: ["gala", "chosen-event"] as const,
  financials: (ev: string, test: boolean) => ["gala", ev, "financials", test] as const,
  config: (ev: string) => ["gala", ev, "config"] as const,
  event: (ev: string) => ["gala", ev, "event"] as const,
  info: (slug: string) => ["gala", "info", slug] as const,
  bookings: (ev: string, q: Query) => ["gala", ev, "bookings", q] as const,
  booking: (ev: string, id: string) => ["gala", ev, "booking", id] as const,
  guests: (ev: string, q: Query) => ["gala", ev, "guests", q] as const,
  tickets: (ev: string, q: Query) => ["gala", ev, "tickets", q] as const,
  ticket: (ev: string, id: string) => ["gala", ev, "ticket", id] as const,
  stats: (ev: string) => ["gala", ev, "checkin-stats"] as const,
  lookup: (ev: string, q: string) => ["gala", ev, "lookup", q] as const,
  history: (ev: string, q: Query) => ["gala", ev, "history", q] as const,
  jobs: (ev: string, q: Query) => ["gala", ev, "jobs", q] as const,
};
/** Keep the previous page while paging/filtering the SAME event; never show another event's rows while switching events. */
const list = (ev: string) => ({
  placeholderData: <T,>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) => (prevQuery?.queryKey[1] === ev ? prev : undefined),
});

export const useGalaEvents = () => useQuery({ queryKey: galaKeys.events, queryFn: svc.listGalaEvents, staleTime: 5 * 60_000 });
/** The event chosen in this session (in memory, React Query cache — never browser storage). */
export function useChosenEvent() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: galaKeys.chosen, queryFn: () => null as string | null, initialData: null as string | null, staleTime: Infinity });
  return [q.data, (id: string) => qc.setQueryData(galaKeys.chosen, id)] as const;
}
export const useFinancials = (ev: string, includeTest: boolean, enabled: boolean) => useQuery({ queryKey: galaKeys.financials(ev, includeTest), queryFn: () => svc.getFinancials(ev, includeTest), enabled });
export const useTicketConfig = (ev: string, enabled: boolean) => useQuery({ queryKey: galaKeys.config(ev), queryFn: () => svc.getTicketConfig(ev), enabled, retry: false });
export const useEventDetail = (ev: string, enabled: boolean) => useQuery({ queryKey: galaKeys.event(ev), queryFn: () => svc.getEvent(ev), enabled });
export const useTicketingInfo = (slug: string, enabled: boolean) => useQuery({ queryKey: galaKeys.info(slug), queryFn: () => svc.getTicketingInfo(slug), enabled, retry: false });
export const useBookings = (ev: string, q: Query, enabled: boolean) => useQuery({ queryKey: galaKeys.bookings(ev, q), queryFn: () => svc.listBookings(ev, q), enabled, ...list(ev) });
export const useBooking = (ev: string, id: string, enabled: boolean) => useQuery({ queryKey: galaKeys.booking(ev, id), queryFn: () => svc.getBooking(ev, id), enabled });
export const useGuests = (ev: string, q: Query, enabled: boolean) => useQuery({ queryKey: galaKeys.guests(ev, q), queryFn: () => svc.listGuests(ev, q), enabled, ...list(ev) });
export const useTickets = (ev: string, q: Query, enabled: boolean) => useQuery({ queryKey: galaKeys.tickets(ev, q), queryFn: () => svc.listTickets(ev, q), enabled, ...list(ev) });
export const useTicket = (ev: string, id: string | null, enabled: boolean) => useQuery({ queryKey: galaKeys.ticket(ev, id ?? ""), queryFn: () => svc.getTicket(ev, id!), enabled: enabled && !!id });
export const useCheckInStats = (ev: string, enabled: boolean) => useQuery({ queryKey: galaKeys.stats(ev), queryFn: () => svc.checkInStats(ev), enabled, refetchInterval: 15_000 });
export const useDoorLookup = (ev: string, q: string, enabled: boolean) => useQuery({ queryKey: galaKeys.lookup(ev, q), queryFn: () => svc.doorLookup(ev, q), enabled, retry: false });
export const useCheckInHistory = (ev: string, q: Query, enabled: boolean) => useQuery({ queryKey: galaKeys.history(ev, q), queryFn: () => svc.checkInHistory(ev, q), enabled, ...list(ev) });
export const useJobs = (ev: string, q: Query, enabled: boolean) => useQuery({ queryKey: galaKeys.jobs(ev, q), queryFn: () => svc.listJobs(ev, q), enabled, ...list(ev) });

/**
 * Mutations: the UI shows only what the API answered. Invalidation is started without awaiting it, so per-call success
 * handlers always run (docs/26 §9). The chosen event is kept.
 */
export function useGalaMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void Promise.all([qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "gala" && q.queryKey[1] !== "chosen-event" && q.queryKey[1] !== "events" }), qc.invalidateQueries({ queryKey: ["fin", "audit"] })]);
    },
  });
}
