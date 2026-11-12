import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const generateToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Lowercase ASCII slug; Arabic-only titles should get an explicit slug from the editor. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Marker class so the response interceptor emits { data, meta }. */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}
  static of<T>(items: T[], total: number, page: number, pageSize: number) {
    return new Paginated(items, { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  }
}

type SortDir = 'asc' | 'desc';
/** Parses "field:asc,other:desc" against an allow-list; falls back to the default. */
export function parseSort(sort: string | undefined, allowed: readonly string[], fallback: Record<string, SortDir>) {
  if (!sort) return [fallback];
  const out: Record<string, SortDir>[] = [];
  for (const part of sort.split(',')) {
    const [field, dir = 'asc'] = part.split(':');
    if (allowed.includes(field) && (dir === 'asc' || dir === 'desc')) out.push({ [field]: dir });
  }
  return out.length ? out : [fallback];
}

/** Picks only defined keys (so PATCH never nulls fields that were not sent). */
export function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
