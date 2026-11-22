"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Checkbox, Field, TextInput, inputCls } from "@/components/content/ui";
import { ConfirmDialog, DataTable, DateText, Notice, PageHeader, Pagination, SearchFilter, SelectFilter, useErrorText } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage } from "@/features/finance/FinancePage";
import { ApiError } from "@/lib/api";
import { accountAr, accountEn, fill } from "@/lib/i18n-account";
import * as svc from "@/services/users";
import type { AdminUser, Role } from "@/services/users";

type Dialog = { kind: "create" } | { kind: "roles"; user: AdminUser } | { kind: "status"; user: AdminUser } | null;

/**
 * Users & Roles (existing API: users.module.ts). List: users.read · create / roles / (de)activation: users.manage ·
 * role catalogue: roles.read. The API enforces every rule (only a Super Admin grants/changes Super Admin, the last active
 * Super Admin cannot be removed, nobody deactivates themselves, new accounts must change their temporary password).
 */
export function UsersPage() {
  const { locale, t } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).users;
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.admin }, { label: c.title }]} anyOf={["users.read"]}>
      <Users />
    </FinancePage>
  );
}

function Users() {
  const { locale } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).users;
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const fallback = useErrorText();
  const errText = (e: unknown) => (e instanceof ApiError && (c.errors[e.apiMessage ?? ""] ?? c.errors[e.code])) || fallback(e);
  const manage = can("users.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["users", search, status, page], queryFn: () => svc.listUsers({ search: search || undefined, isActive: status || undefined, page, pageSize: 20 }) });
  const roles = useQuery({ queryKey: ["roles"], queryFn: svc.listRoles, enabled: can("roles.read") });

  const done = (text: string) => {
    setDialog(null);
    setMessage(text);
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["roles"] });
  };

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        right={manage && roles.data ? (
          <button type="button" className="btn-admin btn-primary" onClick={() => { setMessage(null); setDialog({ kind: "create" }); }} data-testid="user-add">
            <UserPlus className="size-4" aria-hidden="true" /> {c.add}
          </button>
        ) : undefined}
      />
      <Notice tone="gold" icon={ShieldCheck}>{c.fourEyes}</Notice>
      {message && <p role="status" data-testid="users-message" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}

      <Card labelledBy="users-title">
        <CardHeader id="users-title" title={c.title} />
        <div className="mb-4 flex flex-wrap gap-3">
          <SearchFilter value={search} onChange={(v) => { setSearch(v); setPage(1); }} label={c.search} />
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} label={c.status} allLabel={c.all} options={[{ value: "true", label: c.active }, { value: "false", label: c.inactive }]} />
        </div>
        <WidgetState q={q} isEmpty={q.data?.items.length === 0} emptyText={c.empty} minH="min-h-40">
          {q.data && (
            <>
              <DataTable
                caption={c.title}
                rowKey={(u) => u.id}
                minW="min-w-[56rem]"
                rows={q.data.items}
                columns={[
                  { key: "name", header: c.cols.name, cell: (u) => <span className="font-bold text-ink">{u.name}</span> },
                  { key: "email", header: c.cols.email, cell: (u) => <span dir="ltr">{u.email}</span> },
                  { key: "roles", header: c.cols.roles, cell: (u) => u.roles.map((r) => r.name).join(", ") },
                  {
                    key: "status",
                    header: c.cols.status,
                    cell: (u) => (
                      <span className="flex flex-wrap gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.isActive ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{u.isActive ? c.active : c.inactive}</span>
                        {u.mustChangePassword && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-bold text-warn">{c.pending}</span>}
                        {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-bold text-warn">{c.locked}</span>}
                      </span>
                    ),
                  },
                  { key: "last", header: c.cols.lastLogin, cell: (u) => (u.lastLoginAt ? <DateText value={u.lastLoginAt} /> : c.never) },
                  {
                    key: "actions",
                    header: c.cols.actions,
                    cell: (u) =>
                      manage ? (
                        <span className="flex flex-wrap gap-2">
                          {roles.data && <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => { setMessage(null); setDialog({ kind: "roles", user: u }); }}>{c.edit}</button>}
                          {u.id !== me?.id && (
                            <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => { setMessage(null); setDialog({ kind: "status", user: u }); }}>{u.isActive ? c.deactivate : c.activate}</button>
                          )}
                        </span>
                      ) : null,
                  },
                ]}
              />
              <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
            </>
          )}
        </WidgetState>
      </Card>

      {roles.data && (
        <Card labelledBy="roles-title">
          <CardHeader id="roles-title" title={c.rolesTitle} />
          <DataTable
            caption={c.rolesTitle}
            rowKey={(r) => r.key}
            minW="min-w-[40rem]"
            rows={roles.data}
            columns={[
              { key: "role", header: c.rolesCols.role, cell: (r) => <span><span className="font-bold text-ink">{r.name}</span>{r.isSystem && <span className="ms-2 text-xs text-muted">{c.system}</span>}{r.description && <span className="block text-xs text-muted">{r.description}</span>}</span> },
              { key: "users", header: c.rolesCols.users, numeric: true, cell: (r) => r.userCount },
              { key: "perms", header: c.rolesCols.permissions, cell: (r) => <span className="text-xs text-muted" dir="ltr">{r.key === "SUPER_ADMIN" ? "*" : r.permissions.join(", ")}</span> },
            ]}
          />
        </Card>
      )}

      {dialog?.kind === "create" && roles.data && <CreateDialog roles={roles.data} grantSuper={!!me?.isSuperAdmin} onClose={() => setDialog(null)} onDone={() => done(c.create.done)} errText={errText} />}
      {dialog?.kind === "roles" && roles.data && <RolesDialog user={dialog.user} roles={roles.data} grantSuper={!!me?.isSuperAdmin} onClose={() => setDialog(null)} onDone={() => done(c.saved)} errText={errText} />}
      {dialog?.kind === "status" && <StatusDialog user={dialog.user} onClose={() => setDialog(null)} onDone={(text) => done(text)} errText={errText} />}
    </>
  );
}

function RoleChecks({ roles, value, onChange, grantSuper }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void; grantSuper: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {roles.map((r) => (
        <Checkbox
          key={r.key}
          label={r.name}
          checked={value.includes(r.key)}
          disabled={r.key === "SUPER_ADMIN" && !grantSuper}
          onChange={(on) => onChange(on ? [...value, r.key] : value.filter((k) => k !== r.key))}
        />
      ))}
    </div>
  );
}

function CreateDialog({ roles, grantSuper, onClose, onDone, errText }: { roles: Role[]; grantSuper: boolean; onClose: () => void; onDone: () => void; errText: (e: unknown) => string }) {
  const { locale } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).users;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [temp, setTemp] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const m = useMutation({ mutationFn: () => svc.createUser({ name: name.trim(), email: email.trim(), temporaryPassword: temp, roleKeys: keys }), onSuccess: onDone });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwOk = svc.passwordProblems(temp, email).length === 0;
  const ok = name.trim().length >= 2 && emailOk && pwOk && keys.length > 0;
  return (
    <ConfirmDialog open title={c.create.title} onClose={onClose} onConfirm={() => m.mutate()} confirmLabel={c.create.submit} busy={m.isPending} error={m.error ? errText(m.error) : null} confirmDisabled={!ok}>
      <TextInput label={c.create.name} value={name} onChange={setName} required maxLength={120} />
      <TextInput label={c.create.email} value={email} onChange={setEmail} required maxLength={191} type="email" dir="ltr" />
      <Field label={c.create.temp} hint={c.create.tempHint} required error={temp && !pwOk ? (locale === "ar" ? accountAr : accountEn).password.policy : null}>
        {(id, d) => <input id={id} type="password" autoComplete="new-password" value={temp} onChange={(e) => setTemp(e.target.value)} maxLength={128} dir="ltr" aria-required aria-invalid={!!temp && !pwOk} aria-describedby={d} className={inputCls} />}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-ink">{c.create.roles}</legend>
        <p className="mb-2 text-xs text-muted">{c.create.rolesHint}</p>
        <RoleChecks roles={roles} value={keys} onChange={setKeys} grantSuper={grantSuper} />
        {keys.length === 0 && <p className="mt-1 text-xs text-muted">{c.noRoles}</p>}
      </fieldset>
    </ConfirmDialog>
  );
}

function RolesDialog({ user, roles, grantSuper, onClose, onDone, errText }: { user: AdminUser; roles: Role[]; grantSuper: boolean; onClose: () => void; onDone: () => void; errText: (e: unknown) => string }) {
  const { locale } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).users;
  const [keys, setKeys] = useState(user.roles.map((r) => r.key));
  const m = useMutation({ mutationFn: () => svc.updateUser(user.id, { roleKeys: keys }), onSuccess: onDone });
  const changed = keys.slice().sort().join() !== user.roles.map((r) => r.key).sort().join();
  return (
    <ConfirmDialog open title={fill(c.editTitle, { name: user.name })} onClose={onClose} onConfirm={() => m.mutate()} confirmLabel={c.save} busy={m.isPending} error={m.error ? errText(m.error) : null} confirmDisabled={!changed || keys.length === 0}>
      <RoleChecks roles={roles} value={keys} onChange={setKeys} grantSuper={grantSuper} />
      {keys.length === 0 && <p className="text-xs text-muted">{c.noRoles}</p>}
    </ConfirmDialog>
  );
}

function StatusDialog({ user, onClose, onDone, errText }: { user: AdminUser; onClose: () => void; onDone: (text: string) => void; errText: (e: unknown) => string }) {
  const { locale } = useLocale();
  const c = (locale === "ar" ? accountAr : accountEn).users;
  const next = !user.isActive;
  const m = useMutation({ mutationFn: () => svc.setUserActive(user.id, next), onSuccess: () => onDone(next ? c.activated : c.deactivated) });
  return (
    <ConfirmDialog open danger={!next} title={next ? c.activate : c.deactivate} onClose={onClose} onConfirm={() => m.mutate()} confirmLabel={next ? c.activate : c.deactivate} busy={m.isPending} error={m.error ? errText(m.error) : null}>
      <p className="text-sm text-ink">{fill(next ? c.confirmActivate : c.confirmDeactivate, { name: user.name })}</p>
    </ConfirmDialog>
  );
}
