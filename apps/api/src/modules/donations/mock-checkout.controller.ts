import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { Public, SkipCsrf } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationsService } from './donations.service';
import { formatAmount } from './money';
import { MockPaymentProvider } from './payments/mock-payment.provider';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import { WebhooksService } from './webhooks.service';

class MockOutcomeDto {
  @IsIn(['succeed', 'fail', 'cancel'])
  outcome!: 'succeed' | 'fail' | 'cancel';
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * DEVELOPMENT/TEST-ONLY stand-in for a provider-hosted checkout page (the mock provider's checkoutUrl).
 *  - 404 unless NODE_ENV is development/test AND the active provider is `mock` (env validation already forbids
 *    mock in staging/production).
 *  - Never collects card data. The "outcome" buttons make the mock provider send a SIGNED webhook through the
 *    normal WebhooksService pipeline (signature check, amount/currency/session matching, idempotency) and then
 *    redirect to the donation return URL — the same contract a real gateway follows.
 *  - Every resulting record is isTest=true and excluded from financial reports.
 */
@ApiExcludeController()
@Public()
@SkipCsrf()
@Controller('dev/mock-checkout')
export class MockCheckoutController {
  constructor(
    private readonly config: AppConfigService,
    private readonly registry: PaymentProviderRegistry,
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly donations: DonationsService,
  ) {}

  private assertEnabled() {
    const env = this.config.get('NODE_ENV');
    if ((env !== 'development' && env !== 'test') || this.registry.active()?.code !== 'mock') throw new NotFoundException();
  }

  private async load(sessionRef: string) {
    this.assertEnabled();
    if (!/^mock_sess_[a-f0-9]{18}$/.test(sessionRef)) throw new NotFoundException();
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { provider_providerSessionRef: { provider: 'mock', providerSessionRef: sessionRef } },
      include: { donation: { include: { recurringDonation: true } } },
    });
    if (!attempt) throw new NotFoundException();
    return attempt;
  }

  private headers(res: Response) {
    const web = new URL(this.config.get('DONATION_RETURN_URL').replace('{locale}', 'en')).origin;
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${web}; frame-ancestors 'none'`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
  }

  @Get(':sessionRef')
  async page(@Param('sessionRef') sessionRef: string, @Res() res: Response) {
    const a = await this.load(sessionRef);
    const minor = (await this.prisma.currency.findUnique({ where: { code: a.currency } }))?.minorUnits ?? 2;
    const open = (a.status === 'CREATED' || a.status === 'REQUIRES_ACTION') && (!a.expiresAt || a.expiresAt > new Date());
    const urls = this.donations.returnUrls(a.donation.reference, a.donation.locale);
    this.headers(res);
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEST checkout — no real payment</title>
<style>body{font-family:system-ui,sans-serif;max-width:30rem;margin:2rem auto;padding:0 1rem;color:#13241f}
.b{background:#b00020;color:#fff;padding:.6rem;border-radius:.5rem;text-align:center;font-weight:700}
button{display:block;width:100%;margin:.5rem 0;padding:.8rem;border-radius:.6rem;border:1px solid #0b3b30;font-size:1rem;cursor:pointer;background:#fff}
button.ok{background:#0b3b30;color:#fff}a{color:#0b3b30}</style></head><body>
<p class="b">TEST MODE — mock payment provider. No real money is charged and no card details are collected.</p>
<h1>Mock checkout</h1>
<p>Donation <strong>${esc(a.donation.reference)}</strong><br>Amount <strong>${esc(formatAmount(a.amount, minor))} ${esc(a.currency)}</strong>${a.donation.recurringDonation ? ' · monthly' : ''}</p>
${
  open
    ? `<form method="post"><button class="ok" name="outcome" value="succeed">Simulate successful payment</button>
<button name="outcome" value="fail">Simulate declined payment</button>
<button name="outcome" value="cancel">Cancel and return</button></form>`
    : `<p>This checkout session is no longer active (${esc(a.status.toLowerCase())}).</p><p><a href="${esc(urls.returnUrl)}">Return to MEKI</a></p>`
}
</body></html>`);
  }

  @Post(':sessionRef')
  async complete(@Param('sessionRef') sessionRef: string, @Body() dto: MockOutcomeDto, @Res() res: Response) {
    const a = await this.load(sessionRef);
    const urls = this.donations.returnUrls(a.donation.reference, a.donation.locale);
    this.headers(res);
    if (dto.outcome === 'cancel') {
      return res.redirect(303, urls.cancelUrl);
    }
    const minor = (await this.prisma.currency.findUnique({ where: { code: a.currency } }))?.minorUnits ?? 2;
    const payload = {
      id: `evt_mockcheckout_${a.reference}_${dto.outcome}`,
      created: Math.floor(Date.now() / 1000),
      type: dto.outcome === 'succeed' ? 'payment.succeeded' : 'payment.failed',
      attemptReference: a.reference,
      sessionRef,
      paymentRef: `mock_pay_${a.reference}`,
      amount: formatAmount(a.amount, minor),
      currency: a.currency,
      ...(a.donation.recurringDonation?.providerAgreementRef ? { agreementRef: a.donation.recurringDonation.providerAgreementRef } : {}),
      ...(dto.outcome === 'fail' ? { failureCode: 'card_declined', failureReason: 'Simulated decline (test)' } : {}),
    };
    const signed = MockPaymentProvider.sign(this.config.get('MOCK_PAYMENT_WEBHOOK_SECRET')!, payload);
    // Same entry point as an external delivery: signature verification + idempotent processing.
    await this.webhooks.ingest('mock', Buffer.from(signed.body), { [signed.header]: signed.signature });
    return res.redirect(303, urls.returnUrl);
  }
}
