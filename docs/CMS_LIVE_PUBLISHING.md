# CMS live publishing & Hero image management

**Audience:** MEKI developers and the operator who deploys to the VPS.
**Status:** implemented and verified locally (real API + `next build`/`next start` website + admin, three browsers). **Not yet deployed or verified on meki-us.org.**

## 1. Root cause

Publishing worked; the website kept serving the previous version.

1. Every page is ISR with `revalidate = 300`. Every CMS fetch was cached under one tag, `meki-public`.
2. **Nothing ever invalidated that tag or the rendered routes.** The API committed the publish, but the website was never told. Pages only refreshed when their 300-second window expired.
3. Next.js then **regenerates in the background and serves the stale page once more**: `x-nextjs-cache: STALE` with `stale-while-revalidate`. So each publish was followed by at least one more stale response, up to 5 minutes later. The same happened after every subsequent edit.

A plain `revalidateTag(tag)` would not have been enough on its own. In Next 16 the recommended `"max"` profile keeps the same serve-stale-once behaviour.

## 2. What was implemented

**Publish → commit → cache invalidated → next request shows it.**

| Piece | Where | Behaviour |
|---|---|---|
| Resource cache tags | `apps/web/src/lib/revalidation-tags.ts` | Each API read is tagged `meki-public` plus exactly one resource tag. Tags: `meki:home`, `meki:page:<slug>`, `meki:events`, `meki:programmes`, `meki:campaigns`, `meki:site` |
| Revalidation route | `apps/web/src/app/api/internal/revalidate/route.ts` | See the security list below this table |
| After-commit hook | `apps/api/src/modules/revalidation/*` | `@RevalidatesPublic(scope)` on publish-type admin routes; the interceptor runs **only after a successful mutation** (never on GET or on errors) |
| Delivery | `RevalidationService` | Timeout 4 s, 2 attempts, then a pending queue retried after 5 s, 15 s, 1 min, then every 5 min. A website outage never fails a committed publish. After an API restart, one full refresh is queued |
| Outcome reporting | header `X-Meki-Revalidation: revalidated \| pending \| disabled` | The admin says "refreshed" only for `revalidated` |
| Status and retry | `GET /admin/cms/revalidation` (`content.read`)<br>`POST /admin/cms/revalidation/retry[?all=true]` (`content.publish`) | Retry delivers pending refreshes **without republishing**. Errors are reported as codes only |
| Persistent storage guard | `storageDirWarning()` | Logs an error at API start (it never refuses to start) in production/staging when `LOCAL_STORAGE_DIR` is relative or inside `/srv/meki/releases`/`current` |

**Revalidation route security and behaviour:**
- **Secret:** server-only `MEKI_REVALIDATE_SECRET`, sent in the `Authorization: Bearer` header. It is never accepted in a query string and is compared in constant time.
- **Input:** only tags matching a fixed grammar, at most 20 per call; anything else is rejected.
- **Invalidation:** `revalidateTag(tag, { expire: 0 })` plus `revalidatePath` for the EN and AR routes.
- **Exposure:** nginx returns 404 for `/api/internal/` on the public host.

**What each kind of change invalidates:**

| Change | Tags invalidated |
|---|---|
| Homepage section or page publish/unpublish, page SEO, section reorder | `meki:home` (homepage + every page's layout metadata, header and footer) |
| Other CMS page | `meki:page:<slug>` |
| Event or Gala content, Gala fundraising, legal copy, ticket config | `meki:events` |
| Programmes / projects | home, programmes, site |
| Campaigns | home, campaigns, programmes, events, site |
| FAQ | home |
| Statistics | home, programmes |
| Site and donation settings | everything |
| Media metadata (alt, consent) | everything |

**Not invalidated:**
- **Drafts:** saving a draft invalidates nothing; drafts are not public.
- **Finance actions:** bookings, check-in, payments and other finance actions invalidate nothing.

**Admin UX:**
- **Who sees what:**
  - Publishers get **Save & publish**: one confirmed action that saves and then publishes.
  - Editors without `content.publish` keep **Save** only, with a note that a publisher must publish.
- **Messages:**
  - The section editor and an app-wide notice report one of four states: "Saved as draft — not live yet", "Published. The live website has been refreshed.", "…refresh is pending and retries automatically" (with **Retry now** for publishers), or "…within 5 minutes" when the refresh is not configured.
  - A validation or authorization refusal is shown as the error.

**Hero images (no schema change).** Homepage → Hero has two controls built on the existing Media Library:
- **Each control offers:**
  - preview;
  - choose from the library;
  - upload;
  - replace;
  - restore default;
  - EN/AR alt text.
- **Where they are stored:**
  - **Main (arched) image:** the HERO section's `mediaId`.
  - **Secondary (circle) image:** the HERO item with code `hero-secondary-image`.
  - **Alt text:** HERO labels `mainImageAlt` / `secondaryImageAlt`. If empty, the Media Library alt text is used; otherwise the image is treated as decorative.
- **Validation:** the API checks it (`HERO_IMAGE_INVALID`); the admin mirrors it for instant feedback.
  - **Format:** JPEG, PNG or WebP.
  - **Availability and status:** not deleted, publicly servable under the consent policy, not DEMO.
  - **Size:** main image ≥ 800 × 1000 px; circle ≥ 300 × 300 px; at most 10 MB.
- **Draft vs published:** selections are drafts until the section is published. The preview shows the draft images and whether they match what is live.
- **Fallbacks on the website:**
  - **Unset slot:** the curated `hero-field` / `water-pier` photos.
  - **Remote images:** only images on the API's `/media/` origin are used (the existing `next/image` remotePatterns entry). Any other host falls back to the default.
  - **Withdrawn images:** a published image that is later deleted or has its consent withdrawn is dropped from the public payload, so the default photo shows instead of a broken image.
- **Layout:** markup, sizes, priority, object position, parallax, animation attributes, the gold arc, the Quick Donate card and responsive/RTL classes are unchanged. Only `src` and `alt` are now data-driven.

## 3. Database changes

**None.** No migration, and no change to existing Hero content or media records. The Hero images use the existing `PageSection.mediaId`, `SectionItem` and labels columns.

## 4. Environment variables (names only — never commit values)

| Variable | Where | Purpose |
|---|---|---|
| `WEB_REVALIDATE_URL` | `/etc/meki/api.env` | `http://127.0.0.1:3000/api/internal/revalidate` (loopback, never the public host) |
| `MEKI_REVALIDATE_SECRET` | `/etc/meki/api.env` **and** `/etc/meki/web.env` (runtime, server-only) | Same random value on both sides (`openssl rand -base64 48`), at least 32 characters. Both URL and secret are required, or neither |
| `API_INTERNAL_URL` | `/etc/meki/web.env` | Stays `http://127.0.0.1:8080/api/v1`, the nginx loopback proxy, because Node's fetch rejects port 6666. Now also in `deploy/vps/nginx-meki-us.conf` |
| `LOCAL_STORAGE_DIR` | `/etc/meki/api.env` | Must be `/var/lib/meki/uploads` or another absolute path outside releases |

If neither revalidation variable is set, everything still works; pages refresh within 300 seconds as before.

## 5. Deployment plan (VPS)

Nothing has been deployed. On the VPS:
1. Commit and tag the release (your step). Back up the database (`sudo backup-meki`). No migration is needed.
2. Generate one secret: `openssl rand -base64 48`.
3. Add these lines with `sudoedit`; don't paste the secret anywhere else:
   - in `/etc/meki/api.env`: `WEB_REVALIDATE_URL=http://127.0.0.1:3000/api/internal/revalidate` and `MEKI_REVALIDATE_SECRET=<secret>`;
   - in `/etc/meki/web.env`: `MEKI_REVALIDATE_SECRET=<secret>`.
4. Confirm `/etc/meki/web.env` still has `API_INTERNAL_URL=http://127.0.0.1:8080/api/v1`.
5. Confirm `/etc/meki/api.env` has `LOCAL_STORAGE_DIR=/var/lib/meki/uploads`.
6. nginx:
   - add `location ^~ /api/internal/ { return 404; }` to the `meki-us.org` server;
   - keep your existing `127.0.0.1:8080` block (or use the one in the repo file);
   - run `sudo nginx -t && sudo systemctl reload nginx`.
7. Run `deploy.sh <tag>`. It rebuilds web and admin and runs `pm2 startOrReload`. If you change env files outside a deploy, run `pm2 reload meki-api meki-web --update-env`.
8. Run the runbook §7 checks, including the new CMS live-publishing lines:
   - the public `/api/internal/revalidate` → 404;
   - loopback without the secret → 401;
   - `:8080/health` → 200;
   - one Hero title **Save & publish** and revert → "refreshed", and the next page load shows it;
   - the `/_next/image` check for an uploaded image → 200 `image/*`.

## 6. Rollback

- **Code:** `deploy/vps/rollback.sh /srv/meki/releases/<previous>`. No database change is involved.
- **Hero content:** use **Restore default image** and republish. Republishing the previous texts restores them, because the audit log keeps every change.
- **Disable live publishing only:** remove both revalidation variables from `api.env`, then run `pm2 reload meki-api --update-env`. Publishing keeps working, with the 300-second refresh.
- **Uploads:** they stay in `/var/lib/meki/uploads` and are untouched by releases or rollbacks.

## 7. Test results (local, 2026-11-23)

| Check | Result |
|---|---|
| API unit: tags, configuration, delivery/retry/timeouts, secret never in status, Hero image rules, storage warning | **11/11** |
| API integration `test/cms-live-publishing.e2e-spec.ts` against a fake website on loopback | **7/7**: two consecutive publishes, draft, images (invalid refused, draft until publish, restore default, withdrawn consent dropped), security, outage → pending → retry, unpublish, FAQ and page tags |
| Website unit `tests/live-publishing.test.mjs` | **5/5** |
| Admin unit `tests/live-publishing.test.mjs` | **4/4** |
| **Real stack**: API built from source on the `meki_test` DB + `next build`/`next start` website (`qa-live.mjs`) | **33/33**; details below the table |
| Real stack, outage | **3 + 2**: site stopped → publish committed, admin told "pending" (`NETWORK`). Restarted site served stale content (`HIT`) → **Retry now**, no republish → next request showed the change |
| Admin browser journey: Homepage → Hero → choose library image → Save & publish | Chromium **16/16**, Firefox **16/16**, WebKit **16/16** (EN 1440 px + AR 390 px). Message "The live website has been refreshed", live site updated on the next request, no browser errors, no overflow |
| Logs | The secret appears 0 times in the API, website and QA logs |
| Full regression suites | API **508/508** (37 suites, test MySQL `meki_test`)<br>Website **122/122**<br>Admin **231/231**<br>`turbo typecheck lint` **7/7**, 0 errors (the same 5 earlier warnings)<br>OpenAPI regenerated (219 paths)<br>Integration matrix: **0 of 233** frontend calls without a backend route |

**Real-stack journey details (33/33):**
- **Consecutive publishes:** "CMS Test Version A" and then "CMS Test Version B" each appeared on the **very next** `/en` and `/ar` request (`MISS`, then `HIT`). No waiting.
- **Draft:** not visible on the site.
- **Images:** a too-small image was refused. Uploaded main and circle images rendered with CMS alt text only after publishing. Restore default worked.
- **Security:**
  - the route returned 401 without a secret, with a wrong secret, or with the secret in the query string;
  - GET → 405, and arbitrary tags → 400;
  - a read-only user got 403 for both publish and retry.
- **Unpublish:** the site fell back to the built-in Hero, and republishing brought it back.

The `meki_test` Hero section was restored byte-for-byte afterwards. The QA accounts were deactivated and the QA media soft-deleted.

## 8. Known limitations

- **Not verified on meki-us.org.** Run the §5 step 8 checks after deploying.
- **The `next/image` optimizer returned 400 locally for uploaded images.** Next 16 refuses to optimize from hosts that resolve to a private IP (`localhost`), an SSRF guard. In production `api.meki-us.org` resolves to the public IP. The existing Gallery uploads use the same path. `dangerouslyAllowLocalIP` was **not** enabled. Verify with the §5 step 8 `/_next/image` check.
- **The pending-refresh queue is in memory** (single API instance by design). After an API restart, one full refresh is queued automatically. Multi-instance PM2 cluster mode would need a shared queue; it is not supported anyway.
- **Single website instance.** On-demand invalidation affects the instance that receives it. That is correct for the single `meki-web` process; several instances would need a shared cache handler.
- **The Hero's first SSR request after a publish is a cache MISS** (a full render, measured at about 100–270 ms locally). That is intentional: it is how the next request is guaranteed to be fresh.
- **Production config not inspected.** I did not see the actual 8080 nginx block or `/etc/meki/*.env` on the VPS. The repo template mirrors your description.
