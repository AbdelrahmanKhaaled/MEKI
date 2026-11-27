// Imported FIRST by phase12b-agreement.e2e-spec.ts (before AppModule validates the environment). Test-only values.
// Real environments default every switch below to false. The Gala donation form URL here is a SYNTHETIC placeholder on the
// Zeffy host (SDI's real Gala donation form URL is entered by MEKI in the secret store, never in code). Nothing is contacted.
const KEYS = [
  'GALA_TICKETING_MODE', 'GALA_HOSTED_SALES_ENABLED', 'ZEFFY_GALA_TICKET_FORM_URL', 'ZEFFY_GALA_GIVING_FORM_URL', 'SDI_GALA_GIVING_ENABLED',
  'SDI_REPORT_APPLY_ENABLED', 'ZEFFY_GALA_AUTO_CONFIRM', 'GENERAL_GIVING_AUTHORIZED', 'PROGRAMME_GIVING_AUTHORIZED', 'SDI_GENERAL_GIVING_ENABLED', 'SDI_PROGRAMME_GIVING_ENABLED',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

export const SYNTHETIC_GALA_GIVING_FORM = 'https://www.zeffy.com/en-US/donation-form/synthetic-test-gala-giving-form';

process.env.GALA_TICKETING_MODE = 'zeffy_hosted';
process.env.GALA_HOSTED_SALES_ENABLED = 'true';
process.env.ZEFFY_GALA_TICKET_FORM_URL = 'https://givebutter.com/c/SDI-Misr-El-Kheir';
process.env.ZEFFY_GALA_GIVING_FORM_URL = SYNTHETIC_GALA_GIVING_FORM;
process.env.SDI_GALA_GIVING_ENABLED = 'true';
process.env.SDI_REPORT_APPLY_ENABLED = 'true';
process.env.ZEFFY_GALA_AUTO_CONFIRM = 'false';
// The current SDI agreement: Gala campaign only — general and programme-restricted giving are NOT authorized.
process.env.GENERAL_GIVING_AUTHORIZED = 'false';
process.env.PROGRAMME_GIVING_AUTHORIZED = 'false';
process.env.SDI_GENERAL_GIVING_ENABLED = 'false';
process.env.SDI_PROGRAMME_GIVING_ENABLED = 'false';

export function restoreAgreementEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}
