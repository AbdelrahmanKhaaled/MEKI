// Imported FIRST by phase12-sdi.e2e-spec.ts (before AppModule validates the environment). Test-only values.
// The SDI hosted mode is switched on for THIS suite only; restoreSdiEnv() puts every value back so later suites keep their mode.
const KEYS = ['GALA_TICKETING_MODE', 'GALA_HOSTED_SALES_ENABLED', 'ZEFFY_GALA_TICKET_FORM_URL', 'SDI_REPORT_APPLY_ENABLED', 'ZEFFY_GALA_AUTO_CONFIRM', 'SDI_GENERAL_GIVING_ENABLED', 'SDI_PROGRAMME_GIVING_ENABLED'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/** The SDI-provided Gala form (Givebutter). Never contacted by tests. */
export const SDI_GALA_FORM = 'https://givebutter.com/c/SDI-Misr-El-Kheir';

process.env.GALA_TICKETING_MODE = 'zeffy_hosted';
process.env.GALA_HOSTED_SALES_ENABLED = 'true';
process.env.ZEFFY_GALA_TICKET_FORM_URL = SDI_GALA_FORM;
process.env.SDI_REPORT_APPLY_ENABLED = 'true';
process.env.ZEFFY_GALA_AUTO_CONFIRM = 'false';
process.env.SDI_GENERAL_GIVING_ENABLED = 'false';
process.env.SDI_PROGRAMME_GIVING_ENABLED = 'false';

export function restoreSdiEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}
