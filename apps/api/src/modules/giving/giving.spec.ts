import { validateSdiHostedConfig, type EnvironmentVariables } from '../../config/env.validation';
import { donorStage, effectiveZakat, galaGate, generalGate, intendedDesignationKey, normaliseDonationReference, programmeGate, REPORT_TYPE_FOR_INTENT, zakatGate, type GivingFlags } from './giving.rules';

/** Phase 14 — pure gate rules. The DEFAULT flags are the production defaults: every channel closed, nothing Zakat-eligible. */
const DEFAULTS: GivingFlags = {
  referenceConfirmed: false, typeConfirmed: false, zakatEnabled: false, generalAuthorized: false, sdiGeneralEnabled: false, generalFormUrl: null,
  programmeAuthorized: false, sdiProgrammeEnabled: false, designationConfirmed: false, programmeFormUrls: {},
};
const OPEN: GivingFlags = {
  ...DEFAULTS, referenceConfirmed: true, typeConfirmed: true, zakatEnabled: true, generalAuthorized: true, sdiGeneralEnabled: true, generalFormUrl: 'https://www.zeffy.com/g',
  programmeAuthorized: true, sdiProgrammeEnabled: true, designationConfirmed: true, programmeFormUrls: { health: 'https://www.zeffy.com/p' },
};

describe('Phase 14 giving gates', () => {
  it('production defaults: every donation channel is closed and Zakat is unavailable', () => {
    expect(generalGate(DEFAULTS)).toEqual({ available: false, reason: 'NOT_AUTHORIZED_BY_SDI', formUrl: null });
    expect(programmeGate(DEFAULTS, 'health')).toEqual({ available: false, reason: 'NOT_AUTHORIZED_BY_SDI', formUrl: null });
    expect(galaGate(DEFAULTS, { givingAvailable: false, formUrl: null }).reason).toBe('GALA_GIVING_NOT_AUTHORIZED');
    expect(zakatGate(DEFAULTS, { eligible: true })).toEqual({ allowed: false, reason: 'ZAKAT_NOT_ENABLED' });
  });

  it('each gate checks its own prerequisites in order', () => {
    expect(generalGate({ ...OPEN, sdiGeneralEnabled: false }).reason).toBe('FORM_NOT_ENABLED');
    expect(generalGate({ ...OPEN, referenceConfirmed: false }).reason).toBe('REFERENCE_QUESTION_NOT_CONFIRMED');
    expect(generalGate(OPEN)).toEqual({ available: true, reason: null, formUrl: 'https://www.zeffy.com/g' });
    expect(programmeGate({ ...OPEN, designationConfirmed: false }, 'health').reason).toBe('DESIGNATION_NOT_CONFIRMED');
    expect(programmeGate(OPEN, 'education').reason).toBe('NO_FORM_FOR_PROGRAMME');
    expect(programmeGate(OPEN, 'health')).toEqual({ available: true, reason: null, formUrl: 'https://www.zeffy.com/p' });
    // a programme gift is NEVER routed to the Gala form or the general form
    expect(programmeGate(OPEN, 'health').formUrl).not.toBe(OPEN.generalFormUrl);
    expect(galaGate({ referenceConfirmed: false }, { givingAvailable: true, formUrl: 'https://www.zeffy.com/gala' }).reason).toBe('REFERENCE_QUESTION_NOT_CONFIRMED');
  });

  it('Zakat: needs the switch, the Donation Type confirmation, a target and an approved eligibility', () => {
    expect(zakatGate({ ...OPEN, typeConfirmed: false }, { eligible: true }).reason).toBe('DONATION_TYPE_NOT_CONFIRMED');
    expect(zakatGate(OPEN, null).reason).toBe('NO_ZAKAT_TARGET');
    expect(zakatGate(OPEN, { eligible: false }).reason).toBe('NOT_ZAKAT_ELIGIBLE');
    expect(zakatGate(OPEN, { eligible: true })).toEqual({ allowed: true, reason: null });
  });

  it('effective eligibility: latest APPROVED decision with BOTH references; default false', () => {
    const t = (d: number) => new Date(2026, 10, d);
    const ok = { status: 'APPROVED', eligible: true, decidedAt: t(1), authorityReference: 'MEKI Sharia board 2026-11-01', sdiAcceptanceReference: 'SDI e-mail 2026-11-02' };
    expect(effectiveZakat([])).toBe(false);
    expect(effectiveZakat([ok])).toBe(true);
    expect(effectiveZakat([{ ...ok, sdiAcceptanceReference: null }])).toBe(false);
    expect(effectiveZakat([{ ...ok, status: 'PENDING_APPROVAL' }])).toBe(false);
    expect(effectiveZakat([ok, { ...ok, decidedAt: t(5), eligible: false }])).toBe(false); // a later "not eligible" decision wins
    expect(effectiveZakat([{ ...ok, status: 'REVOKED' }])).toBe(false);
  });

  it('donation references are normalised strictly; booking references are not donation references', () => {
    expect(normaliseDonationReference(' dn-7k3qx9m2pa4t ')).toBe('DN-7K3QX9M2PA4T');
    expect(normaliseDonationReference('DN7K3QX9M2PA4T')).toBe('DN-7K3QX9M2PA4T');
    expect(normaliseDonationReference('DN–7K3QX9M2PA4T')).toBe('DN-7K3QX9M2PA4T'); // en dash typed on a phone
    expect(normaliseDonationReference('EB-7K3QX9M2PA4T')).toBeNull();
    expect(normaliseDonationReference('DN-123')).toBeNull();
  });

  it('designation keys and report types per intent', () => {
    expect(intendedDesignationKey('PROGRAM_DONATION', 'health')).toBe('programme:health');
    expect(intendedDesignationKey('GALA_DONATION', null)).toBe('GALA_PROJECT');
    expect(intendedDesignationKey('GENERAL_DONATION', null)).toBe('GENERAL');
    expect(REPORT_TYPE_FOR_INTENT).toEqual({ GALA_DONATION: 'GALA_DONATIONS', PROGRAM_DONATION: 'PROGRAMME_DONATIONS', GENERAL_DONATION: 'GENERAL_DONATIONS' });
  });

  it('donor stages keep intention, pending, verified and allocated apart', () => {
    expect(donorStage({ reconciliationStatus: 'AWAITING_REPORT', paymentStatus: 'UNPAID', allocationStatus: 'PENDING_AUTHORIZATION' })).toBe('PENDING_EXTERNAL');
    expect(donorStage({ reconciliationStatus: 'VERIFIED', paymentStatus: 'UNPAID', allocationStatus: null })).toBe('PENDING_EXTERNAL'); // never verified without PAID
    expect(donorStage({ reconciliationStatus: 'VERIFIED', paymentStatus: 'PAID', allocationStatus: 'PENDING_AUTHORIZATION' })).toBe('VERIFIED');
    expect(donorStage({ reconciliationStatus: 'VERIFIED', paymentStatus: 'PAID', allocationStatus: 'AUTHORIZED' })).toBe('ALLOCATED');
    expect(donorStage({ reconciliationStatus: 'NEEDS_REVIEW', paymentStatus: 'UNPAID', allocationStatus: null })).toBe('NEEDS_REVIEW');
    expect(donorStage({ reconciliationStatus: 'REPORTED_UNPAID', paymentStatus: 'UNPAID', allocationStatus: null })).toBe('NOT_COMPLETED');
  });

  it('configuration guards: Zakat needs the Donation Type confirmation, which needs the reference confirmation', () => {
    const base = { NODE_ENV: 'development', GALA_TICKETING_MODE: 'zeffy_hosted', SDI_BOOKING_REFERENCE_QUESTION: 'MEKI Booking Reference', SDI_DONATION_REFERENCE_QUESTION: 'MEKI Donation Reference', SDI_DONATION_TYPE_QUESTION: 'Donation Type' } as unknown as EnvironmentVariables;
    const v = (o: object) => () => validateSdiHostedConfig({ ...base, ...o } as EnvironmentVariables);
    expect(v({ ZAKAT_GIVING_ENABLED: true })).toThrow(/SDI_DONATION_TYPE_CONFIRMED/);
    expect(v({ SDI_DONATION_TYPE_CONFIRMED: true })).toThrow(/SDI_DONATION_REFERENCE_CONFIRMED/);
    expect(v({ SDI_DONATION_REFERENCE_CONFIRMED: true, SDI_DONATION_TYPE_CONFIRMED: true, ZAKAT_GIVING_ENABLED: true })).not.toThrow();
    expect(v({ SDI_DONATION_REFERENCE_QUESTION: '=HYPERLINK("x")' })).toThrow(/SDI_DONATION_REFERENCE_QUESTION/);
  });
});
