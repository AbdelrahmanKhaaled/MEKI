// Imported FIRST by phase14-giving.e2e-spec.ts (before AppModule validates the environment). TEST-ONLY values.
// Every real environment defaults these switches to false. All form URLs below are SYNTHETIC placeholders on the Zeffy host
// (never SDI's real forms, which only MEKI enters in the secret store). Nothing is contacted; no payment can happen.
const KEYS = [
  'GALA_TICKETING_MODE', 'GALA_HOSTED_SALES_ENABLED', 'ZEFFY_GALA_TICKET_FORM_URL', 'ZEFFY_GALA_GIVING_FORM_URL', 'SDI_GALA_GIVING_ENABLED',
  'SDI_REPORT_APPLY_ENABLED', 'ZEFFY_GALA_AUTO_CONFIRM', 'GENERAL_GIVING_AUTHORIZED', 'PROGRAMME_GIVING_AUTHORIZED', 'SDI_GENERAL_GIVING_ENABLED',
  'SDI_PROGRAMME_GIVING_ENABLED', 'SDI_PROGRAMME_DESIGNATION_CONFIRMED', 'SDI_PROGRAMME_FORM_URLS', 'ZEFFY_DONATION_FORM_URL',
  'SDI_DONATION_REFERENCE_CONFIRMED', 'SDI_DONATION_TYPE_CONFIRMED', 'ZAKAT_GIVING_ENABLED',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const tag = Date.now().toString(36);
/** Synthetic programme that has an SDI form in this TEST configuration; a second one deliberately has none. */
export const P14_PROGRAMME = `p14-prog-${tag}`;
export const P14_PROGRAMME_NO_FORM = `p14-noform-${tag}`;
export const SYNTH = {
  galaGiving: 'https://www.zeffy.com/en-US/donation-form/synthetic-test-gala-giving-form',
  general: 'https://www.zeffy.com/en-US/donation-form/synthetic-test-general-form',
  programme: 'https://www.zeffy.com/en-US/donation-form/synthetic-test-programme-form',
};

process.env.GALA_TICKETING_MODE = 'zeffy_hosted';
process.env.GALA_HOSTED_SALES_ENABLED = 'false';
process.env.ZEFFY_GALA_TICKET_FORM_URL = 'https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york';
process.env.ZEFFY_GALA_GIVING_FORM_URL = SYNTH.galaGiving;
process.env.SDI_GALA_GIVING_ENABLED = 'true';
process.env.SDI_REPORT_APPLY_ENABLED = 'true';
process.env.ZEFFY_GALA_AUTO_CONFIRM = 'false';
// A HYPOTHETICAL future agreement, so the code paths can be exercised. Individual tests switch channels off again.
process.env.GENERAL_GIVING_AUTHORIZED = 'true';
process.env.PROGRAMME_GIVING_AUTHORIZED = 'true';
process.env.SDI_GENERAL_GIVING_ENABLED = 'true';
process.env.ZEFFY_DONATION_FORM_URL = SYNTH.general;
process.env.SDI_PROGRAMME_GIVING_ENABLED = 'true';
process.env.SDI_PROGRAMME_DESIGNATION_CONFIRMED = 'true';
process.env.SDI_PROGRAMME_FORM_URLS = JSON.stringify({ [P14_PROGRAMME]: SYNTH.programme });
process.env.SDI_DONATION_REFERENCE_CONFIRMED = 'true';
process.env.SDI_DONATION_TYPE_CONFIRMED = 'true';
process.env.ZAKAT_GIVING_ENABLED = 'true';

export function restoreGivingEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}
