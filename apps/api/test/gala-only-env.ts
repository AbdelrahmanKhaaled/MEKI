// Imported FIRST by phase14b-gala-only.e2e-spec.ts (before AppModule validates the environment). TEST-ONLY values.
// A HYPOTHETICAL "Gala-only launch": Gala ticket sales and Gala donation intents open; program and general giving NOT authorized
// (the current SDI agreement). All form URLs are SYNTHETIC placeholders on the Zeffy host. Nothing is contacted or paid.
const KEYS = [
  'GALA_TICKETING_MODE', 'GALA_HOSTED_SALES_ENABLED', 'ZEFFY_GALA_TICKET_FORM_URL', 'ZEFFY_GALA_GIVING_FORM_URL', 'SDI_GALA_GIVING_ENABLED',
  'SDI_REPORT_APPLY_ENABLED', 'ZEFFY_GALA_AUTO_CONFIRM', 'GENERAL_GIVING_AUTHORIZED', 'PROGRAMME_GIVING_AUTHORIZED', 'SDI_GENERAL_GIVING_ENABLED',
  'SDI_PROGRAMME_GIVING_ENABLED', 'SDI_PROGRAMME_DESIGNATION_CONFIRMED', 'SDI_PROGRAMME_FORM_URLS', 'ZEFFY_DONATION_FORM_URL',
  'SDI_DONATION_REFERENCE_CONFIRMED', 'SDI_DONATION_TYPE_CONFIRMED', 'ZAKAT_GIVING_ENABLED', 'GIVING_GALA_ONLY_MODE', 'GIVING_GALA_EVENT_SLUG',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const tag = Date.now().toString(36);
export const P14B_EVENT = `p14b-${tag}`;
export const P14B_PROGRAMME = `p14b-prog-${tag}`;
export const SYNTH_GALA_GIVING = 'https://www.zeffy.com/en-US/donation-form/synthetic-test-gala-giving-form';
export const SYNTH_PROGRAMME_FORM = 'https://www.zeffy.com/en-US/donation-form/synthetic-test-programme-form';

process.env.GALA_TICKETING_MODE = 'zeffy_hosted';
process.env.GALA_HOSTED_SALES_ENABLED = 'true';
process.env.ZEFFY_GALA_TICKET_FORM_URL = 'https://givebutter.com/c/SDI-Misr-El-Kheir';
process.env.ZEFFY_GALA_GIVING_FORM_URL = SYNTH_GALA_GIVING;
process.env.SDI_GALA_GIVING_ENABLED = 'true';
process.env.SDI_REPORT_APPLY_ENABLED = 'true';
process.env.ZEFFY_GALA_AUTO_CONFIRM = 'false';
// The CURRENT agreement: no program or general giving.
process.env.GENERAL_GIVING_AUTHORIZED = 'false';
process.env.PROGRAMME_GIVING_AUTHORIZED = 'false';
process.env.SDI_GENERAL_GIVING_ENABLED = 'false';
process.env.SDI_PROGRAMME_GIVING_ENABLED = 'false';
process.env.SDI_PROGRAMME_DESIGNATION_CONFIRMED = 'false';
delete process.env.SDI_PROGRAMME_FORM_URLS;
delete process.env.ZEFFY_DONATION_FORM_URL;
process.env.SDI_DONATION_REFERENCE_CONFIRMED = 'true';
process.env.SDI_DONATION_TYPE_CONFIRMED = 'true';
process.env.ZAKAT_GIVING_ENABLED = 'true'; // switch only; nothing is Zakat-eligible unless two administrators approve it
process.env.GIVING_GALA_ONLY_MODE = 'true';
process.env.GIVING_GALA_EVENT_SLUG = P14B_EVENT;

export function restoreGalaOnlyEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}
