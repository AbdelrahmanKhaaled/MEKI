/**
 * Single source of truth for permissions and system roles.
 * Seeded idempotently (create-only for roles; role-permission links are added, never silently removed).
 * Role design is PROPOSED by the development team — MEKI must confirm (OPEN_DECISIONS #7).
 */
export const PERMISSIONS = {
  'users.read': { group: 'users', description: 'View admin users' },
  'users.manage': { group: 'users', description: 'Create, update, activate/deactivate admin users' },
  'roles.read': { group: 'users', description: 'View roles and permissions' },
  'roles.manage': { group: 'users', description: 'Change role-permission assignments' },
  'settings.read': { group: 'settings', description: 'View site and donation settings' },
  'settings.manage': { group: 'settings', description: 'Edit site and donation settings' },
  'content.read': { group: 'content', description: 'View pages and sections' },
  'content.manage': { group: 'content', description: 'Edit pages, sections and items' },
  'content.publish': { group: 'content', description: 'Publish/unpublish page sections' },
  'programmes.read': { group: 'programmes', description: 'View programmes and projects' },
  'programmes.manage': { group: 'programmes', description: 'Create/edit programmes and projects' },
  'programmes.publish': { group: 'programmes', description: 'Publish/unpublish programmes' },
  'campaigns.read': { group: 'campaigns', description: 'View campaigns' },
  'campaigns.manage': { group: 'campaigns', description: 'Create/edit campaigns' },
  'campaigns.approve': { group: 'campaigns', description: 'Record MEKI approval for a campaign' },
  'campaigns.publish': { group: 'campaigns', description: 'Publish/pause/complete campaigns' },
  'media.read': { group: 'media', description: 'View media library' },
  'media.upload': { group: 'media', description: 'Upload media and edit metadata' },
  'media.delete': { group: 'media', description: 'Delete (soft) unreferenced media' },
  'statistics.read': { group: 'statistics', description: 'View impact statistics' },
  'statistics.manage': { group: 'statistics', description: 'Create/edit impact statistics' },
  'statistics.verify': { group: 'statistics', description: 'Mark statistics verified with a source' },
  'statistics.publish': { group: 'statistics', description: 'Publish/unpublish statistics' },
  'faq.read': { group: 'faq', description: 'View FAQs' },
  'faq.manage': { group: 'faq', description: 'Create/edit FAQs' },
  'faq.publish': { group: 'faq', description: 'Publish/unpublish FAQs' },
  'audit.read': { group: 'audit', description: 'View audit logs' },
  'donations.read': { group: 'finance', description: 'View donations and payments (future phase)' },
  'events.read': { group: 'events', description: 'View events and event pages' },
  'events.manage': { group: 'events', description: 'Create/edit events, event pages, media and campaign links' },
  'events.approve': { group: 'events', description: 'Record client approval of event content' },
  'events.publish': { group: 'events', description: 'Publish/unpublish/cancel/complete events' },
  'donors.read': { group: 'finance', description: 'View donor personal data and history' },
  'donors.manage': { group: 'finance', description: 'Correct permitted donor details' },
  'donors.anonymize': { group: 'finance', description: 'Erase donor personal data (privacy/retention)' },
  'payments.read': { group: 'finance', description: 'View payment attempts, transactions and webhook events' },
  'payments.manage': { group: 'finance', description: 'Enable/disable providers, currencies; retry webhook processing' },
  'refunds.request': { group: 'finance', description: 'Request a refund' },
  'refunds.approve': { group: 'finance', description: 'Approve or reject refund requests (not your own)' },
  'refunds.execute': { group: 'finance', description: 'Send an approved refund to the payment provider' },
  'receipts.read': { group: 'finance', description: 'View donation receipts' },
  'receipts.issue': { group: 'finance', description: 'Issue a receipt for a confirmed donation' },
  'receipts.regenerate': { group: 'finance', description: 'Void and re-issue a receipt' },
  'recurring.read': { group: 'finance', description: 'View recurring donations' },
  'recurring.manage': { group: 'finance', description: 'Pause, resume or cancel recurring donations' },
  'reports.read': { group: 'finance', description: 'View financial reports (per currency)' },
  // Phase 5B — Gala booking & ticketing (ticket revenue is NOT a donation; no tax-receipt permissions exist for tickets)
  'gala.bookings.read': { group: 'gala', description: 'View event bookings (purchaser details, payment state) and ticket financial summary' },
  'gala.bookings.manage': { group: 'gala', description: 'Correct booking/guest details, cancel bookings, regenerate tickets' },
  'gala.guests.read': { group: 'gala', description: 'View the combined guest list (guest personal data)' },
  'gala.guests.export': { group: 'gala', description: 'Export the guest list (CSV)' },
  'gala.tickets.read': { group: 'gala', description: 'View tickets and download ticket PDFs' },
  'gala.tickets.manage': { group: 'gala', description: 'Revoke tickets and re-issue (rotate QR) tickets' },
  'gala.checkin.validate': { group: 'gala', description: 'Scan/validate QR tickets at the door and view check-in statistics' },
  'gala.checkin.manage': { group: 'gala', description: 'Manual check-in and undo an erroneous check-in' },
  // Phase 12 — SDI hosted forms: payments, tickets and check-in happen on SDI's Zeffy forms; MEKI reconciles SDI's daily reports
  'sdi.reports.upload': { group: 'finance', description: 'Upload, map and preview SDI reconciliation/attendee reports (no financial effect)' },
  'sdi.reports.approve': { group: 'finance', description: 'Apply a previewed SDI report and verify mappings (not your own upload)' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const SUPER_ADMIN = 'SUPER_ADMIN';

const readAll = ALL_PERMISSIONS.filter((p) => p.endsWith('.read'));

/** Phase 5B read permissions for finance (no export, no manage; guest data is least-privilege). */
const FINANCE_GALA: PermissionKey[] = ['gala.bookings.read', 'gala.guests.read', 'gala.tickets.read'];

export const SYSTEM_ROLES: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full access including role management. Bypasses permission checks.',
    permissions: ALL_PERMISSIONS,
  },
  ADMINISTRATOR: {
    name: 'Administrator',
    description: 'Manages all content, campaigns, settings and users (cannot change role permissions).',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'roles.manage'),
  },
  CONTENT_MANAGER: {
    name: 'Content Manager',
    description: 'Manages homepage content, programmes, media, statistics drafts and FAQs.',
    permissions: [
      'settings.read', 'content.read', 'content.manage', 'content.publish',
      'programmes.read', 'programmes.manage', 'programmes.publish',
      'campaigns.read', 'media.read', 'media.upload',
      'statistics.read', 'statistics.manage', 'faq.read', 'faq.manage', 'faq.publish',
      'events.read', 'events.manage', 'events.publish',
    ],
  },
  CAMPAIGN_MANAGER: {
    name: 'Campaign Manager',
    description: 'Prepares campaigns and their media. Publishing requires a recorded MEKI approval.',
    permissions: [
      'settings.read', 'programmes.read', 'campaigns.read', 'campaigns.manage', 'campaigns.publish',
      'media.read', 'media.upload', 'statistics.read', 'content.read', 'events.read', 'reports.read',
    ],
  },
  FINANCE_MANAGER: {
    name: 'Finance Manager',
    description: 'Read access to finance data; can request and execute (not approve) refunds and issue receipts.',
    permissions: Array.from(new Set<PermissionKey>([...readAll, 'donations.read', 'refunds.request', 'refunds.execute', 'receipts.issue'])).filter(
      (p) => p !== 'users.read' && p !== 'roles.read',
    ),
  },
  EVENT_CHECKIN_STAFF: {
    name: 'Event Check-in Staff',
    description: 'Door staff: validates QR tickets and sees check-in counts. No access to guest lists, bookings or finance.',
    permissions: ['gala.checkin.validate'],
  },
};

/**
 * Versioned, apply-once permission grants for roles that ALREADY exist in a database
 * (the baseline seed never rewrites role assignments). Each version is applied once and
 * recorded in the audit log; later admin changes to role permissions are never undone.
 */
export const PERMISSION_GRANTS: { version: string; grants: Partial<Record<string, PermissionKey[]>> }[] = [
  {
    version: '2026-11-06-phase2-events',
    grants: {
      ADMINISTRATOR: ['events.read', 'events.manage', 'events.approve', 'events.publish'],
      CONTENT_MANAGER: ['events.read', 'events.manage', 'events.publish'],
      CAMPAIGN_MANAGER: ['events.read'],
      FINANCE_MANAGER: ['events.read'],
    },
  },
  {
    version: '2026-11-06-phase3-donations',
    grants: {
      ADMINISTRATOR: [
        'donors.read', 'donors.manage', 'donors.anonymize', 'payments.read', 'payments.manage',
        'refunds.request', 'refunds.approve', 'refunds.execute', 'receipts.read', 'receipts.issue',
        'receipts.regenerate', 'recurring.read', 'recurring.manage', 'reports.read',
      ],
      FINANCE_MANAGER: [
        'donors.read', 'payments.read', 'refunds.request', 'refunds.execute', 'receipts.read',
        'receipts.issue', 'recurring.read', 'reports.read',
      ],
      CAMPAIGN_MANAGER: ['reports.read'],
    },
  },
  {
    version: '2026-11-16-phase5b-gala',
    grants: {
      ADMINISTRATOR: [
        'gala.bookings.read', 'gala.bookings.manage', 'gala.guests.read', 'gala.guests.export',
        'gala.tickets.read', 'gala.tickets.manage', 'gala.checkin.validate', 'gala.checkin.manage',
      ],
      FINANCE_MANAGER: FINANCE_GALA,
    },
  },
  {
    version: '2026-11-19-phase12-sdi-reports',
    grants: {
      ADMINISTRATOR: ['sdi.reports.upload', 'sdi.reports.approve'],
      FINANCE_MANAGER: ['sdi.reports.upload'],
    },
  },
];
