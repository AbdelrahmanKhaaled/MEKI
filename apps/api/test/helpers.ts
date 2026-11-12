import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { PASSWORD_RESET_NOTIFIER, type PasswordResetNotifier } from '../src/modules/auth/password-reset.notifier';

export const API = '/api/v1';
export const COOKIE = 'meki_admin_sid';
export const uid = () => randomBytes(5).toString('hex');
export const TEST_PASSWORD = 'Test-Password-2026!';

/** Captures reset tokens instead of e-mailing them. */
export class CapturingNotifier implements PasswordResetNotifier {
  last?: { email: string; token: string };
  async send(email: string, token: string) {
    this.last = { email, token };
  }
}

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  notifier: CapturingNotifier;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const notifier = new CapturingNotifier();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PASSWORD_RESET_NOTIFIER)
    .useValue(notifier)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'], rawBody: true });
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), notifier, http: () => request(app.getHttpServer()) };
}

/** Creates an active admin with the given system roles (unique e-mail per call). */
export async function createAdmin(ctx: TestContext, roleKeys: string[], opts: { password?: string; mustChangePassword?: boolean } = {}) {
  const email = `t-${uid()}@meki.test`;
  const roles = await ctx.prisma.role.findMany({ where: { key: { in: roleKeys } } });
  const user = await ctx.prisma.adminUser.create({
    data: {
      email,
      name: `Test ${roleKeys.join('+')}`,
      passwordHash: await new PasswordService().hash(opts.password ?? TEST_PASSWORD),
      mustChangePassword: opts.mustChangePassword ?? false,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  return { ...user, password: opts.password ?? TEST_PASSWORD };
}

/** Unique client IP per login so per-IP login throttling does not couple unrelated tests. */
export const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export interface Session {
  cookie: string;
  csrf: string;
  userId: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

export async function login(ctx: TestContext, email: string, password: string): Promise<Session> {
  const res = await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email, password }).expect(200);
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = setCookie.find((c) => c.startsWith(`${COOKIE}=`))!.split(';')[0];
  const csrf = res.body.data.csrfToken as string;
  const withAuth = (t: request.Test) => t.set('Cookie', cookie).set('X-CSRF-Token', csrf);
  return {
    cookie,
    csrf,
    userId: res.body.data.user.id,
    get: (url) => ctx.http().get(`${API}${url}`).set('Cookie', cookie),
    post: (url, body) => {
      const t = withAuth(ctx.http().post(`${API}${url}`));
      return body ? t.send(body) : t;
    },
    patch: (url, body) => withAuth(ctx.http().patch(`${API}${url}`)).send(body ?? {}),
    put: (url, body) => withAuth(ctx.http().put(`${API}${url}`)).send(body ?? {}),
    del: (url) => withAuth(ctx.http().delete(`${API}${url}`)),
  };
}

export async function loginAs(ctx: TestContext, roleKeys: string[]) {
  const user = await createAdmin(ctx, roleKeys);
  return login(ctx, user.email, user.password);
}
