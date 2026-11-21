import type { MediaRef } from "./media";

/**
 * English (default locale) content.
 *
 * Provenance legend (see docs/01):
 *  [V]  verified — MEKI Brand Guidelines v1.0 (Oct 2026), MEK Updated Sector Mandates,
 *       MEK Integrated Service Portfolio 2026–2030 graphic.
 *  [P]  proposed — microcopy written by the development team; editable, needs MEKI approval.
 *  [PREVIEW] — proposed campaign labels from client photo folders; NOT approved fundraisers.
 *
 * Never add figures, contacts, legal claims or campaign totals here without a source.
 */

export type IconName =
  | "users" | "stethoscope" | "graduation" | "briefcase" | "home" | "droplets" | "lifebuoy"
  | "landmark" | "flask" | "handshake" | "map" | "chart";

export type Programme = {
  n: string;
  slug: string;
  name: string; // [V] exact Brand Guidelines p.24 name
  short: string; // [V] Brand Guidelines p.24
  mandate: string; // [V] Portfolio graphic mandate
  themes: string[]; // [V] Portfolio graphic sub-themes
  image: MediaRef;
  icon: IconName;
};

export type Campaign = {
  slug: string;
  title: string; // [PREVIEW]
  programme: string;
  programmeSlug: string;
  text: string; // [P]
  image: MediaRef;
};

export const en = {
  locale: "en",
  dir: "ltr",
  meta: {
    title: "MEKI — Lasting Change, Built Together.",
    description:
      "MEKI unites partners across the world behind development that lasts. Nine evidence-based programs, inspired by the legacy of Misr El-Kheir, with every contribution accounted for.",
  },
  previewBar: "Preview site · Online giving is not yet open. No payments are taken on this page.",
  draftTranslation: "",
  nav: {
    skip: "Skip to content",
    links: [
      { href: "#who-we-are", label: "Who we are" },
      { href: "#programmes", label: "Programs" },
      { href: "#impact", label: "Impact" },
      { href: "#campaigns", label: "Campaigns" },
      { href: "#giving", label: "How giving works" },
      { href: "#faq", label: "FAQ" },
    ],
    gala: { href: "/en/events/gala-night", label: "Gala Night" },
    donate: "Give",
    menu: "Menu",
    close: "Close menu",
    language: "العربية",
    languageLabel: "Switch to Arabic",
    home: "MEKI home",
  },
  hero: {
    eyebrow: "Inspired by the legacy of Misr El-Kheir", // [V] legacy line
    titleA: "Lasting Change,", // [V] tagline
    titleB: "Built Together.",
    lead: "MEKI unites partners across the world behind development that lasts, supporting people, communities and institutions through evidence-based programs, with every contribution accounted for from start to finish.", // [V] boilerplate
    ctaPrimary: "Attend the Gala",
    ctaPrimaryHref: "/en/events/gala-night",
    ctaSecondary: "Explore Our Programs",
    photoCaption: "Luxor · WASH program", // [P] caption from source folder; confirm with MEKI
    scroll: "Scroll",
  },
  galaBanner: {
    eyebrow: "MEKI Gala Night",
    title: "Every Light Counts",
    text: "A black-tie evening in New York, where each guest's light joins a shared illumination.",
    date: "Saturday, December 12, 2026",
    venue: "583 Park Avenue, New York",
    cta: "Attend the Gala",
    href: "/en/events/gala-night",
  },
  quick: {
    title: "Give today",
    preview: "Preview",
    oneOff: "One-off",
    monthly: "Monthly",
    frequencyLabel: "Donation frequency",
    whereLabel: "Where it goes",
    whereDefault: "Where it is needed most",
    amountLabel: "Amount (USD)",
    other: "Other",
    otherLabel: "Other amount in US dollars",
    otherPlaceholder: "Enter amount",
    give: "Give {amount}",
    giveMonthly: "Give {amount} monthly",
    chooseAmount: "Choose an amount",
    note: "Online giving is not open yet. No payment is taken on this page.",
    secure: "No payment details are collected here.",
    methodsAria: "Payment methods under consideration. None are active yet; final methods depend on the payment provider.",
  },
  trust: [
    { title: "Every contribution accounted for", text: "From start to finish." },
    { title: "Released against milestones", text: "With results reported back." },
    { title: "Evidence-based programs", text: "Nine programs, one strategy." },
    { title: "A legacy to build on", text: "Drawing on 20 years of Misr El-Kheir's experience." },
  ],
  about: {
    eyebrow: "Who we are",
    title: "Thriving people, resilient institutions and strong communities.",
    body: "MEKI unites partners across the world behind development that lasts. Drawing on 20 years of Misr El-Kheir's experience, we support people, communities and institutions through evidence-based programs, with every contribution accounted for from start to finish.",
    visionLabel: "Our vision",
    vision: "Thriving people, resilient institutions and strong communities, built together.",
    missionLabel: "Our mission",
    mission:
      "We partner with people, communities and institutions worldwide to deliver evidence-based development that lasts, with every contribution transparently accounted for and its impact measured.",
    legacy: "Inspired by the legacy of Misr El-Kheir.",
    vmEyebrow: "Vision & mission", // [P]
    vmTitle: "Where we are going, and how we get there.", // [P]
    vmTagline: "Lasting Change, Built Together.", // [V] tagline
    captionA: "Hand-weaving workshop – Alexandria", // Phase 13B: "Title – Place" (source folder: Abis carpets, Alexandria)
    captionB: "Water-connection project – Luxor", // source folder: water trenching and connections, Luxor
  },
  how: {
    eyebrow: "How we work",
    title: "Connect. Unite. Empower. Account.",
    intro: "Four verbs carry the mission, from the first conversation to the final report.",
    items: [
      { verb: "Connect", text: "We link donors, companies and institutions with proven development work they could not reach alone." },
      { verb: "Unite", text: "We bring many contributors behind shared programs with clear goals, so together they achieve more." },
      { verb: "Empower", text: "We fund programs that help people, communities and local institutions lead their own change." },
      { verb: "Account", text: "We hold every gift for its purpose, release it against milestones and report back on results." },
    ],
  },
  impact: {
    eyebrow: "The legacy we build on",
    title: "Two decades of work across Egypt.",
    intro: "MEKI draws on the experience of Misr El-Kheir. These are their figures, shown with their source.",
    stats: [
      { value: 20, prefix: "", suffix: "", label: "Years of Misr El-Kheir's service" },
      { value: 27, prefix: "", suffix: "", label: "Governorates served across Egypt" },
      { value: 35, prefix: "", suffix: "M+", label: "Beneficiaries reached" },
      { value: 300, prefix: "$", suffix: "M", label: "Program expenditure, past four years" },
    ],
    attribution: "Figures: Misr El-Kheir, Egypt.",
  },
  programmes: {
    eyebrow: "Our programs",
    title: "Nine programs. One purpose.",
    intro: "Each program tackles a different part of what people and communities need to thrive. Based on assessed needs, a household may enter one or more program pathways.",
    mandateLabel: "Mandate",
    themesLabel: "Focus areas",
    give: "Give to this program",
    items: [
      { n: "01", slug: "social-solidarity", name: "Social Solidarity & Household Resilience", short: "Helping families in hardship become stable and secure.", mandate: "Protect and stabilize vulnerable households, reduce repeated dependence, and connect households to progression pathways where appropriate.", themes: ["Safety-net support", "Household stabilization", "Protecting the vulnerable"], image: "livestock", icon: "users" },
      { n: "02", slug: "health", name: "Health Access, Coverage & Quality", short: "Making good healthcare affordable and reachable.", mandate: "Secure affordable, quality-assured healthcare through coverage, strategic purchasing, patient navigation, provider support and system stewardship.", themes: ["Access to care", "Continuity of treatment", "Patient support & quality"], image: "doctor-patient", icon: "stethoscope" },
      { n: "03", slug: "education", name: "Education", short: "Helping children and young people enrol, stay in school, learn and progress.", mandate: "Ensure access, retention, learning, completion and progression across the learner journey.", themes: ["Community education", "Access & scholarships", "Learner progression"], image: "student-reading", icon: "graduation" },
      { n: "04", slug: "economic-empowerment", name: "Economic Empowerment & Labor Market Activation", short: "Sustainable income through skills, decent work and enterprise.", mandate: "Move people toward sustainable income, employability, decent work and enterprise opportunities.", themes: ["Employability", "Technical education", "Enterprise & livelihoods"], image: "weaver", icon: "briefcase" },
      { n: "05", slug: "housing", name: "Housing & Safe Living Conditions", short: "Safe, adequate and dignified homes, and shelter when needed.", mandate: "Improve the safety, adequacy and dignity of living conditions and provide temporary accommodation when required.", themes: ["Safer housing", "Temporary shelter", "Rehabilitation & co-financing"], image: "housing-roof", icon: "home" },
      { n: "06", slug: "wash", name: "WASH, Environment & Climate Resilience", short: "Water, sanitation and hygiene, and protection from climate risks.", mandate: "Reduce water, sanitation, environmental and climate-related vulnerability.", themes: ["Water & sanitation access", "Environmental protection", "Climate-risk reduction"], image: "water-pier", icon: "droplets" },
      { n: "07", slug: "emergency-response", name: "Emergency Response", short: "Fast, coordinated help in crises, and early recovery.", mandate: "Provide rapid, coordinated support in crises and shocks and support early recovery.", themes: ["Readiness", "Humanitarian response", "Transition & recovery"], image: "relief", icon: "lifebuoy" },
      { n: "08", slug: "heritage-culture", name: "Heritage, Culture & Identity", short: "Participation, culture, heritage and community engagement.", mandate: "Strengthen participation, identity, culture, heritage and constructive community engagement.", themes: ["Participation", "Cultural engagement", "Identity-building opportunities"], image: "swimmer", icon: "landmark" },
      { n: "09", slug: "scientific-research", name: "Scientific Research & Research Ecosystem", short: "Funding research and strengthening the research ecosystem.", mandate: "Advance a research agenda, sponsor high-value studies, support researchers and strengthen the research ecosystem in Egypt.", themes: ["Sponsored research", "Grants & fellowships", "Research capacity building"], image: "student-lab", icon: "flask" },
    ] as Programme[],
  },
  enabling: {
    eyebrow: "Enabling functions",
    title: "The capabilities behind every program.",
    intro: "Three functions support all nine programs. They are capabilities, not programs.",
    items: [
      { name: "NGO Development", text: "Strengthen partner NGO quality, governance, capability and delivery readiness across the portfolio.", icon: "handshake" as IconName },
      { name: "Field Offices", text: "Frontline assessment, outreach, household follow-up, recertification, referral coordination and local insight.", icon: "map" as IconName },
      { name: "Business Intelligence", text: "Integrate observatory, historical, field and geo-mapping data to guide planning, targeting and fundraising.", icon: "chart" as IconName },
    ],
  },
  campaigns: {
    eyebrow: "Featured campaigns",
    title: "Where your support could go next.",
    intro: "These campaigns are drawn from program work photographed in the field. They are previews: titles, scope and fundraising approval are being confirmed with MEKI.",
    badge: "Preview · pending approval",
    donate: "Give",
    prev: "Previous campaigns",
    next: "Next campaigns",
    noFigures: "No targets or totals are shown until they are approved and verified.",
    items: [
      { slug: "hospitals", title: "Support hospital care", programme: "Health Access, Coverage & Quality", programmeSlug: "health", text: "Helping hospitals offer equipped wards and continuous care for patients who need it.", image: "doctor-patient" },
      { slug: "neonatal", title: "Neonatal incubator units", programme: "Health Access, Coverage & Quality", programmeSlug: "health", text: "Supporting hospital neonatal units that care for newborns needing incubator support.", image: "incubator" },
      { slug: "water", title: "Water for families", programme: "WASH, Environment & Climate Resilience", programmeSlug: "wash", text: "Bringing safe water from station to home, with trenching and pipe connections in Luxor.", image: "water-pipe" },
      { slug: "shelter-warmth", title: "Shelter & warmth", programme: "Housing & Safe Living Conditions", programmeSlug: "housing", text: "Making homes safer and more dignified for families living in unsafe conditions.", image: "housing-site" },
      { slug: "community-schools", title: "Community schools", programme: "Education", programmeSlug: "education", text: "Helping learners in underserved communities access school and keep progressing.", image: "student-reading" },
      { slug: "workshops", title: "Skills & workshops", programme: "Economic Empowerment & Labor Market Activation", programmeSlug: "economic-empowerment", text: "Workshops where people build practical skills that lead to decent work and income.", image: "carpentry" },
      { slug: "greenhouses", title: "Agricultural greenhouses", programme: "Economic Empowerment & Labor Market Activation", programmeSlug: "economic-empowerment", text: "Greenhouse projects in Beni Suef supporting livelihoods through farming.", image: "greenhouse" },
      { slug: "inclusive-sports", title: "Inclusive sports", programme: "Heritage, Culture & Identity", programmeSlug: "heritage-culture", text: "Sports activities for people with intellectual disabilities, built around participation.", image: "swimmer-medal" },
    ] as Campaign[],
  },
  why: {
    eyebrow: "Why support MEKI",
    quote: "Every gift, accounted for.",
    lead: "We explain how gifts are handled and how results are reported. No claims we cannot show.",
    items: [
      { title: "Held for its purpose", text: "Every gift is held for the purpose you chose and released against milestones." },
      { title: "Evidence-led", text: "Programs are built on evidence, and every figure we share has a source and a period." },
      { title: "People lead their own change", text: "We fund programs that help people, communities and local institutions lead their own change." },
      { title: "A proven legacy", text: "We draw on 20 years of Misr El-Kheir's experience in development across Egypt." },
    ],
  },
  process: {
    eyebrow: "How giving works",
    title: "A simple, secure path from your gift to results.",
    intro: "This is how online giving is designed to work once it opens.",
    steps: [
      { title: "Choose", text: "Pick one of the nine programs, or give where it is needed most." },
      { title: "Give securely", text: "Complete your gift through a secure payment channel, once it is approved and open." },
      { title: "Confirmed", text: "A donation is counted only after the payment has been verified." },
      { title: "Accounted for", text: "Your gift is released against milestones, and results are reported back." },
    ],
    neverTitle: "What we will never do",
    never: [
      "Ask you to type card numbers into this website",
      "Store your full card details",
      "Count a donation before the payment is verified",
    ],
    status: "Status: payment provider and currencies are being finalized.",
  },
  gallery: {
    eyebrow: "Our work in action",
    title: "Real people, real places.",
    intro: "Program photography from the field. Photos show the work of Misr El-Kheir in Egypt.",
    items: [
      { image: "weavers-loom" as MediaRef, caption: "Hand-weaving workshop – Alexandria" },
      { image: "water-station" as MediaRef, caption: "Water desalination station – Luxor" },
      { image: "greenhouse-harvest" as MediaRef, caption: "Greenhouses – Beni Suef" },
      { image: "housing-site" as MediaRef, caption: "Shelter & Warmth housing works – Egypt" },
      { image: "mobile-clinic" as MediaRef, caption: "Mobile medical unit – Egypt" },
      { image: "farmer-portrait" as MediaRef, caption: "Water-connection project – Luxor" },
      { image: "operating-room" as MediaRef, caption: "Hospital support – Egypt" },
    ],
    note: "Captions follow “Title – Place”, taken from the source folders; final captions and photographer credits to be confirmed.",
  },
  faq: {
    eyebrow: "Questions",
    title: "Frequently asked questions",
    intro: "Clear answers about giving to MEKI. More detail will follow as online giving opens.",
    items: [
      { q: "Can I donate online today?", a: "Not yet. Online giving is being prepared. The donation form on this page is a preview: no payment is taken and no card details are collected." },
      { q: "How will my payment be kept secure?", a: "Payment arrangements are being finalized. We will publish them before giving opens, and a donation is only counted after the payment is verified." },
      { q: "Which currencies and payment methods will be accepted?", a: "This preview shows US dollars. Final currencies and payment methods will be confirmed with our payment provider before giving opens." },
      { q: "How is my gift accounted for?", a: "We hold every gift for its purpose, release it against milestones and report back on results." },
      { q: "Can I choose where my donation goes?", a: "Yes. You can give to one of the nine programs or where it is needed most. Campaigns shown on this page are previews and will only open once approved." },
      { q: "What is MEKI's connection to Misr El-Kheir?", a: "MEKI is inspired by the legacy of Misr El-Kheir and draws on its 20 years of experience. Figures on this page are Misr El-Kheir, Egypt figures and are shown with that source." },
      { q: "Will I receive a confirmation or receipt?", a: "Confirmation, receipt and tax details will be shared when online giving opens. They are being confirmed with our fiscal sponsor." },
    ],
  },
  final: {
    titleA: "Be part of",
    titleB: "lasting change.",
    text: "Join partners across the world behind development that lasts, with every contribution accounted for from start to finish.",
    ctaPrimary: "Give today",
    ctaSecondary: "Explore our programs",
    chipProgrammes: "Nine programs, one strategy", // [V] Brand p.24
    chipAccount: "Every contribution accounted for", // [V]
  },
  footer: {
    tagline: "Lasting Change, Built Together.",
    legacy: "Inspired by the legacy of Misr El-Kheir.",
    explore: "Explore",
    programmes: "Programs",
    giving: "Giving",
    givingLinks: [
      { href: "#give", label: "Give today" },
      { href: "#giving", label: "How giving works" },
      { href: "#faq", label: "FAQ" },
    ],
    contactTitle: "Contact",
    contactPending: "Contact details will be published soon.",
    legalPending: "Privacy · Terms · Cookies (coming soon)",
    rights: "MEKI. All rights reserved.",
    backToTop: "Back to top",
  },
  dialog: {
    title: "Online giving opens soon",
    body: "Thank you for wanting to give. Online donations are not open yet. We are finalizing our payment partner and approvals so that every gift is processed securely and accounted for.",
    selection: "Your selection",
    noCharge: "No payment has been taken.",
    close: "Close",
    explore: "Explore our programs",
    preview: "See how a gift will be prepared",
  },
  checkout: {
    title: "Your details",
    intro: "We only ask for what we need to process your gift and send your receipt.",
    testBanner: "Test mode · no real money is charged",
    testBadge: "Test",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    anonymous: "Don't show my name publicly",
    privacy: "I agree to MEKI processing my details to handle this donation.",
    privacyPending: "The full privacy notice will be published before launch.",
    marketing: "Keep me updated about MEKI's work (optional)",
    submit: "Continue to secure payment",
    submitting: "Preparing secure payment…",
    redirecting: "Redirecting to the payment page…",
    back: "Back",
    monthlyUnavailable: "Monthly giving is not available yet",
    min: "The minimum amount is {amount}",
    max: "The maximum amount is {amount}",
    invalidName: "Please enter your name using letters only.",
    invalidEmail: "Please enter a valid email address.",
    consentRequired: "Please confirm you agree before continuing.",
    errors: {
      PAYMENTS_UNAVAILABLE: "Online giving is not available right now. Please try again later.",
      CAMPAIGN_NOT_ACCEPTING_DONATIONS: "This campaign is not accepting donations at the moment.",
      PROGRAMME_NOT_ACCEPTING_DONATIONS: "This program is not accepting donations at the moment.",
      AMOUNT_BELOW_MINIMUM: "The amount is below the minimum for this currency.",
      AMOUNT_ABOVE_MAXIMUM: "The amount is above the maximum for this currency.",
      CURRENCY_NOT_ACCEPTED: "This currency is not accepted.",
      RECURRING_NOT_AVAILABLE: "Monthly giving is not available yet.",
      CUSTOM_AMOUNT_NOT_ALLOWED: "Please choose one of the suggested amounts.",
      RATE_LIMITED: "Too many attempts. Please wait a minute and try again.",
      NETWORK_ERROR: "We couldn't reach our servers. Please check your connection and try again.",
      PROVIDER_UNAVAILABLE: "The payment provider is unavailable. Please try again shortly.",
      GENERIC: "Something went wrong. No payment has been taken. Please try again.",
    },
  },
  donationStatus: {
    metaTitle: "Your donation",
    eyebrow: "Your donation",
    processingTitle: "We're confirming your payment",
    processingText: "This usually takes a few seconds. Please keep this page open.",
    stillProcessingText: "Confirmation is taking longer than usual. If your payment went through, you will receive a confirmation and receipt.",
    successTitle: "Thank you for your gift",
    successText: "Your donation has been confirmed by our payment provider.",
    failedTitle: "Your payment was not completed",
    failedText: "No donation was recorded. You can try again.",
    cancelledTitle: "Payment cancelled",
    cancelledText: "You left the payment page before completing your gift. No payment was taken.",
    unknownTitle: "We couldn't show this donation here",
    unknownText: "For your security, donation details can only be shown in the browser where the gift was made. If your payment went through, you will receive a confirmation.",
    reference: "Reference",
    amount: "Amount",
    purpose: "Purpose",
    generalFund: "Where it is needed most",
    receipt: "View receipt",
    receiptNumber: "Receipt",
    retry: "Try again",
    home: "Back to home",
    testNotice: "Test donation: processed by the mock payment provider. No real money was charged.",
  },
  notFound: { title: "Page not found", text: "The page you are looking for does not exist.", back: "Back to home" },
};

export type Dict = typeof en;
