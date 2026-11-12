/**
 * Import FIRST in a spec file to boot the app as if no payment provider were configured on the server
 * (the shared .env.test enables the mock provider for the donation tests). Env vars set here win over
 * .env.test because ConfigModule never overrides existing process.env values.
 */
process.env.PAYMENTS_ENABLED = 'false';
process.env.PAYMENT_PROVIDER = '';
