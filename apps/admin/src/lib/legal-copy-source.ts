import type { LegalKind } from "./legal-copy-schemas";

/**
 * Phase 13B — the three Gala legal texts as supplied VERBATIM in MEKI's "Website Comments.docx" (received 21 November 2026),
 * section "Updates from our Fiscal Sponsor “SDI”". Characters, punctuation and spacing are kept exactly as received
 * (including the missing final period of the website text and the unhyphenated "tax deductible"); do not edit them here.
 *
 * This is ONLY a source an administrator can load into the existing approval-gated draft editor. Loading it does not save,
 * approve or publish anything: SDI's written approval must still be recorded by a second administrator, and the receipt
 * wording (B) is never published by MEKI — SDI configures it on its own Zeffy receipts.
 * Arabic wording was not supplied; nothing is translated here.
 */
export const SDI_WORDING_SOURCE = "Website Comments.docx (MEKI, received 2026-11-21): “Updates from our Fiscal Sponsor SDI”";

export const SDI_WORDING_NOV21: Record<LegalKind, { textEn: string; ticketPrice: string; fairMarketValue: string; deductibleAmount: string }> = {
  TICKET_PURCHASE_DISCLOSURE: {
    textEn:
      "Spring of Dignity International is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code, EIN 42-2797838. Each USD 500 ticket includes dinner and a program valued at USD 200 per guest. The remaining USD 300 is tax-deductible to the extent permitted by law. Additional donations are tax-deductible to the extent permitted by law.",
    ticketPrice: "500.00",
    fairMarketValue: "200.00",
    deductibleAmount: "300.00",
  },
  TICKET_RECEIPT: {
    textEn:
      "Thank you for your support of the Egypt Gala. You paid USD 500 per ticket. In exchange, you received goods and services (dinner and program) with an estimated fair market value of USD 200 per ticket. The tax-deductible portion of your contribution, to the extent permitted by law, is USD 300 per ticket. Spring of Dignity International is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code, EIN 42-2797838.",
    ticketPrice: "500.00",
    fairMarketValue: "200.00",
    deductibleAmount: "300.00",
  },
  WEBSITE_DISCLOSURE: {
    textEn:
      "The Egypt Gala is cohosted by Misr El Kheir Foundation and Spring of Dignity International. All tickets and donations are paid to Spring of Dignity International, a US 501(c)(3) nonprofit, EIN 42-2797838, which retains discretion and control over their use. Gifts support Misr El Kheir Foundation’s programs in Egypt. Each USD 500 ticket includes dinner and program valued at USD 200 per guest. The remaining USD 300, and all donations, are tax deductible to the extent permitted by law",
    ticketPrice: "500.00",
    fairMarketValue: "200.00",
    deductibleAmount: "300.00",
  },
};
