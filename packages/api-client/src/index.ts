/**
 * @meki/api-client — the typed contract between MEKI frontends and the API.
 *  - `paths` / `components`: generated from openapi.json (`pnpm --filter @meki/api-client generate`).
 *  - public response types: see ./public.ts.
 * Regenerate after `pnpm --filter @meki/api openapi:export`.
 */
import type { components } from './generated/schema';

export type { paths, components, operations } from './generated/schema';
export * from './public';

/** Request body of POST /public/donations, generated from the API DTO. */
export type CreateDonationRequest = components['schemas']['CreateDonationDto'];
export type DonorInput = components['schemas']['DonorInputDto'];

export const API_VERSION_PREFIX = '/api/v1';
