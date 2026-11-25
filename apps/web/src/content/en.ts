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
  /** [C] page title when it differs from the card name ("Emergency Response & Gaza Relief", 25 Nov 2026) */
  pageTitle?: string;
  themes: string[]; // [C] "Areas of work" titles (Programs Word document, 25 Nov 2026)
  /** [C] description of each area of work, same order as `themes` */
  areaTexts: string[];
  /** [C] two short sentences under the italic line (MEKI client edits, 22 Nov 2026 — "Program copy") */
  summary: string;
  /** [C] "The change we aim for": four short lines with check marks */
  outcomes: string[];
  image: MediaRef;
  icon: IconName;
};

/** One "Our work in action" photo: caption "Title – Place" with the program underneath (program = programme slug; optional). */
export type GalleryItem = { width?: number; height?: number; image: MediaRef; title: string; place?: string; program?: string };
export type SocialLink = { network: string; url: string };

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
    // The website's real navigation (pages.ts NAV_ORDER). This list seeds the CMS menu (Admin → Menus), so Admin and the site agree.
    // Gala Night and the Give button are fixed entries outside the list.
    links: [
      { href: "/", label: "Home" },
      { href: "/about", label: "About MEKI" },
      { href: "/programs", label: "Programs" },
      { href: "/give", label: "Give" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
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
    // [C] MEKI client edits (22 Nov 2026, item 3): the approved mission replaces the intro text.
    lead: "We partner with people, communities and institutions worldwide to deliver evidence-based development that lasts, with every contribution transparently accounted for and its impact measured.",
    ctaPrimary: "Attend the Gala",
    ctaPrimaryHref: "/en/events/gala-night",
    ctaSecondary: "Explore our programs", // [C] one capitalization style for buttons (item 13)
    photoCaption: "Luxor · WASH program", // [P] caption from source folder; confirm with MEKI
    scroll: "Scroll",
    // Hero images: curated defaults; the CMS (Homepage → Hero) may replace them with published Media Library images.
    // Empty alt = decorative (the headline carries the meaning); editors may add EN/AR alt text in the CMS.
    image: "hero-family" as MediaRef, // client delivery 24 Nov 2026 ("Home P"): approved family / community-school photo
    imageAlt: "A mother with her daughters at a community school",
    secondaryImage: "hero-school" as MediaRef,
    secondaryImageAlt: "Pupils working together in class",
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
    { title: "Results are reported back to supporters.", text: "" }, // [C] item 11 (replaces "Released against milestones, with results reported back")
    { title: "Evidence-based programs", text: "Nine programs, one strategy." },
    { title: "A legacy to build on", text: "Drawing on 20 years of Misr El-Kheir's experience." },
  ],
  about: {
    eyebrow: "Who we are",
    title: "Thriving people, resilient institutions and strong communities.",
    // [C] "Intro copy — Who we are" (item 6). Paragraphs are separated by a blank line.
    body: "For 20 years, Misr El-Kheir has worked alongside families and communities in all 27 of Egypt's governorates, reaching more than 35 million people. It has built deep community trust and a wide network of local partners.\n\nIt has also learned that lasting change comes from addressing the connected challenges in people's lives, not one need at a time. MEKI brings that experience to partners around the world.",
    visionLabel: "Our vision",
    vision: "Thriving people, resilient institutions and strong communities, built together.",
    missionLabel: "Our mission",
    mission:
      "We partner with people, communities and institutions worldwide to deliver evidence-based development that lasts, with every contribution transparently accounted for and its impact measured.",
    legacy: "Inspired by the legacy of Misr El-Kheir.", // [C] item 6: no longer rendered under "Who we are" (it already appears in the hero)
    // [C] MEKI Legacy (Programs Word document, 25 Nov 2026) — About page section; CMS: ABOUT labels legacyTitle/legacyTagline + items legacy-1…3
    legacyTitle: "MEKI Legacy",
    legacyTagline: "Building on 20 Years of Outreach and Impact. Creating Opportunities for Generations to Come.",
    legacyParas: ["Misr El-Kheir Foundation has stood on the forefront of development and charity work alongside individuals, families, and communities across Egypt for 20 Years.","On an individual, household, community and institutional fronts this work has touched millions of lives and helped build an unmatched foundation of experience, community outreach, trust, and partner networks.","Yet the true legacy extends beyond the number of people reached or the services delivered; it is deeply embedded in the understanding that lasting change requires addressing the interconnected challenges shaping people’s lives and in the ability to turn that into more effective, sustainable interventions."],
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
    // [C] "Program copy" (item 7)
    title: "Nine Programs. One Commitment.",
    intro: "Building on 20 years of experience addressing the diverse needs of communities across Egypt, Misr El-Kheir champions a development approach that recognizes the fundamental truth of the holistic and non-fragmented nature of vulnerability across households.\n\nMEKI inherently believes that addressing one need in isolation may provide immediate relief, but sustainable progress often requires a broader understanding of the circumstances affecting each household.\n\nBecause lasting change is not simply about what we provide. It is about what becomes possible for the people we serve.",
    mandateLabel: "Program mandate",
    themesLabel: "Areas of work",
    outcomesLabel: "The change we aim to create",
    give: "Give to this program",
    howTitle: "How it works",
    how: [
      { title: "Understand", text: "One shared assessment of each family's needs and strengths." },
      { title: "Plan", text: "One household plan, with one team following up." },
      { title: "Connect", text: "Programs and local partners deliver the support each family needs." },
      { title: "Adapt", text: "Regular follow-up as circumstances change." },
      { title: "Measure", text: "Success is lasting improvement, not aid delivered." },
    ],
    items: [
      { n: "01", slug: "social-solidarity", name: "Social Solidarity & Household Resilience", short: "Alleviating Basic Household Needs Today. Building Resilience for Tomorrow.", summary: "Protecting vulnerable individuals and households from severe hardship while alleviating basic needs gaps, strengthening household stability and preserving dignity.", mandate: "For severely underprivileged households limited resources can mean making impossible choices; without appropriate assistance, this can undermine family stability, increase exposure to complex vulnerability.\n\nThis program aims to safeguard vulnerable families against economic and social hardship and progressively alleviate the underlying causes of vulnerability including debt, food insecurity, geographic hardships and destitution; through integrated assistance pathways that restore household stability, preserve dignity, strengthen family resilience, and reduce long-term dependency.", themes: ["Protecting Vulnerable Individuals and Households","Strengthening Household Stability and Resilience"], areaTexts: ["Safeguarding individuals and households facing severe financial, social, or situational hardship affecting access to basic household needs.","Addressing conditions that threaten household security, reducing exposure to recurring distress, and supporting families’ ability to maintain stability during difficult circumstances."], outcomes: ["Greater household stability and security.","Improved ability to meet essential needs.","Reduced exposure to severe financial and social distress.","Stronger household resilience."], image: "program-social-solidarity", icon: "users" },
      { n: "02", slug: "health", name: "Health Access, Coverage & Quality", short: "Making Healthcare More Accessible. Improving National Health Ecosystems.", summary: "Reducing financial, physical and access barriers to essential healthcare while supporting continuity of treatment, improved service quality, and stronger healthcare systems for underserved populations.", mandate: "For vulnerable individuals and households, the inability to afford or access appropriate medical care can create significant multidisciplinary vulnerability; MEKI bridges critical gaps in healthcare access, and affordability, for vulnerable and underserved populations.\n\nMEKI improves health outcomes and continuity of care through medical assistance and outreach programs, that expand access to healthcare and reaches remote and underserved communities.", themes: ["Improving Equitable Access to Healthcare","Strengthening Continuity and Financial Protection","Advancing Healthcare Service Capacity"], areaTexts: ["Reducing financial, geographic, and service-related barriers that prevent vulnerable individuals from receiving appropriate healthcare when they need it.","Supporting more reliable access to necessary care while reducing the financial pressures that can interrupt treatment and undermine household stability.","Strengthening the capabilities, readiness, and quality of healthcare providers to improve the accessibility, safety, and effectiveness of services delivered to communities."], outcomes: ["Improved access to essential healthcare.","Reduced financial hardship associated with medical needs.","Greater continuity of necessary treatment.","Improved quality and reliability of healthcare services.","Stronger health-related functional and participatory outcomes for beneficiaries."], image: "program-health", icon: "stethoscope" },
      { n: "03", slug: "education", name: "Education", short: "Expanding Opportunity Through Supporting Learner’s Journey.", summary: "Expanding equitable access to quality learning, supporting educational continuity and achievement, and enabling children and young people to progress toward their full potential.", mandate: "MEKI ensures equitable educational opportunities and support by removing barriers that prevent disadvantaged learners from accessing, continuing, and succeeding in education.\n\nThrough strengthening educational institutions, reaching underserved communities, improving accessibility for learners with disabilities, providing scholarships and supporting learners throughout their educational journeys.", themes: ["Expanding Equitable Access to Education","Strengthening Educational Quality and Inclusion","Supporting Achievement and Educational Progression"], areaTexts: ["Addressing barriers that prevent disadvantaged learners from accessing appropriate educational opportunities, with particular attention to underserved populations and those at risk of exclusion.","Improving the learning environment and institutional capabilities needed to provide accessible, inclusive, and effective educational experiences.","Helping learners remain engaged, develop their capabilities, complete relevant educational stages, and progress toward further learning and opportunities."], outcomes: ["Increased access to education among underserved populations.","Improved student retention and continuity.","More inclusive and supportive learning environments.","Stronger educational achievement and progression.","Expanded opportunities for personal and future economic development."], image: "program-education", icon: "graduation" },
      { n: "04", slug: "economic-empowerment", name: "Economic Empowerment & Labor Market Activation", short: "Turning Potential into Opportunity. Opportunity into Sustainable Livelihoods.", summary: "Connecting skills, capabilities, aspirations and labor market demands with productive opportunities that support sustainable income, decent work, and economic independence.", mandate: "For many people, Economic Vulnerability is not a consequence of lack of motivation or potential, but the absence of relevant skills, productive resources, or viable economic opportunities.\n\nThe aim of this program is to transform economic vulnerability into sustainable livelihoods, empowering young entrepreneurs and enabling working-age individuals to access productive opportunities.\n\nMEKI empowers people to become economically active, financially independent, and capable of contributing to their families and communities through incubation, income generation, technical and vocational education, market-relevant skills development, and employment pathways.", themes: ["Developing Market-Relevant Capabilities","Expanding Access to Productive Opportunities","Strengthening Livelihood Sustainability"], areaTexts: ["Strengthening the practical knowledge, competencies, and work readiness that enable individuals to participate effectively in changing labor markets.","Connecting individuals with appropriate pathways into employment, entrepreneurship, and economically productive activities.","Supporting individuals’ capacity to maintain economic participation, generate more reliable income, and build resilience against future financial shocks."], outcomes: ["Improved employability and economic participation.","Greater access to appropriate income-generating opportunities.","More sustainable livelihoods.","Stronger household financial resilience.","Reduced long-term economic vulnerability."], image: "program-economic-empowerment", icon: "briefcase" },
      { n: "05", slug: "housing", name: "Housing & Safe Living Conditions", short: "Safer Homes. Stable Households. More Secure Futures.", summary: "Improving the safety, adequacy, and dignity of living environments so vulnerable families have a more secure foundation for health, stability, and wellbeing.", mandate: "For vulnerable households; unsafe housing structures and deteriorating living environments can reinforce existing vulnerability and undermine efforts to improve household wellbeing; which creates serious risks to physical wellbeing, and emotional security.\n\nThe aim of this program is to ensure vulnerable families have access to safe, adequate, and dignified living environments that protect their health, security, and wellbeing by addressing critical housing deficiencies, and restoring essential living conditions, family stability, protection, and social resilience.", themes: ["Improving Housing Safety and Adequacy","Protecting Housing Security and Dignity","Strengthening Long-Term Residential Resilience"], areaTexts: ["Addressing physical living conditions that expose vulnerable families to safety risks, structural deterioration, or inadequate residential environments.","Supporting vulnerable households in accessing or maintaining appropriate living conditions that provide essential protection and stability.","Improving the sustainability and suitability of household living environments so families are better protected against recurring housing-related vulnerabilities."], outcomes: ["Safer and more adequate living conditions.","Reduced exposure to housing-related risks.","Greater household security and stability.","Improved dignity and wellbeing.","Stronger resilience among vulnerable families."], image: "program-housing", icon: "home" },
      { n: "06", slug: "wash", name: "WASH, Environment & Climate Resilience", short: "Safer Water. Healthier Communities. A More Resilient Future.", summary: "Strengthening access to essential water and sanitation while addressing infrastructure gaps in underserved communities and tackling pressing environmental issues.", mandate: "Access to safe water, sanitation, and essential environmental services plays a fundamental role in protecting health, preserving dignity, and supporting everyday life.\n\nWhere these services are inadequate or unreliable, communities may face heightened health risks, additional financial burdens, and barriers to social and economic participation.\n\nMEKI ensures access to safe drinking water, water networks, wells, and environmental preservation and resilience initiatives; to improve community health, and quality of life by addressing critical gaps in essential infrastructure and environmental services.", themes: ["Expanding Access to Essential Water and Sanitation Services","Improving Environmental Health and Safety","Strengthening Infrastructure and Community Resilience"], areaTexts: ["Reducing gaps in the availability, accessibility, and adequacy of water and sanitation services for underserved households and communities.","Addressing environmental conditions and service deficiencies that negatively affect community health, wellbeing, and quality of life.","Supporting more reliable and sustainable essential services while reducing vulnerability to relevant environmental and climate-related risks."], outcomes: ["Improved access to essential water and sanitation services.","Healthier and safer community environments.","Reduced vulnerability associated with infrastructure gaps.","Greater reliability of supported services.","Stronger community resilience."], image: "program-wash", icon: "droplets" },
      { n: "07", slug: "emergency-response", name: "Emergency Response", pageTitle: "Emergency Response & Gaza Relief", short: "Immediate Crisis Relief. Supporting Recovery Beyond the Crisis.", summary: "Protecting lives and preserving dignity during crises through timely humanitarian assistance, coordinated support, and pathways toward recovery.", mandate: "For vulnerable families, emergencies and sudden crises may create immediate threats to safety, health, food security, shelter, and household stability.\n\nThe consequences can extend long after the immediate emergency has passed.\n\nMEKI's established humanitarian response capabilities and partnerships mobilize timely assistance, essential supplies, shelter, and early recovery support, strengthening community preparedness and resilience while helping affected populations restore stability.", themes: ["Strengthening Emergency Preparedness and Response Capacity","Protecting Lives and Essential Human Needs","Supporting Stabilization and Early Recovery"], areaTexts: ["Improving the ability to identify urgent needs, mobilize appropriate resources, and coordinate timely assistance during crises.","Addressing immediate humanitarian vulnerabilities and supporting access to essential protection, assistance, and services for affected populations.","Helping affected individuals and communities restore essential stability and reconnect with appropriate development and recovery pathways."], outcomes: ["Faster access to essential humanitarian assistance.","Reduced immediate distress and exposure to crisis-related risks.","Improved protection of vulnerable populations.","Greater coordination of emergency interventions."], image: "program-emergency-response", icon: "lifebuoy" },
      { n: "08", slug: "heritage-culture", name: "Heritage, Culture & Identity", short: "Preserving Identity. Enriching Lives. Strengthening Communities.", summary: "Strengthening cultural participation, preserving heritage, and expanding opportunities for creativity, inclusion, identity, and meaningful community engagement.", mandate: "Human wellbeing is shaped not only by access to essential services and economic opportunities, but also by identity, belonging, creativity, and participation in community life.\n\nMEKI aims to enrich the individual and community through initiatives that nurture creativity, strengthen national identity and belonging, preserve cultural heritage, and empower children and youth in underserved communities to participate in and contribute to Egypt's cultural and social development.", themes: ["Preserving Heritage and Cultural Identity","Expanding Cultural Participation and Inclusion","Nurturing Creativity, Belonging, and Community Engagement"], areaTexts: ["Supporting the continuity, appreciation, and preservation of cultural traditions and heritage that connect communities to their history and identity.","Improving opportunities for individuals and underserved communities to engage meaningfully in cultural, artistic, and social activities.","Strengthening opportunities for expression, participation, personal development, and positive connections within communities."], outcomes: ["Stronger preservation and appreciation of heritage.","Improved opportunities for creativity and expression.","Greater social inclusion and belonging.","Stronger cultural and community engagement."], image: "program-heritage-culture", icon: "landmark" },
      { n: "09", slug: "scientific-research", name: "Scientific Research & Research Ecosystem", short: "Advancing Knowledge. Enabling Innovation. Creating Meaningful Impact.", summary: "Advancing applied research, strengthening research capabilities, and connecting scientific evidence with practical solutions to development challenges.", mandate: "Complex development challenges require more than established responses, they require reliable evidence, scientific inquiry, innovation, and the ability to translate knowledge into practical solutions.\n\nThis program harnesses MEKI’s massive outreach and ensures sustainability, evidence and scientific method application in all its projects, while bolstering scientific knowledge, applied research, and innovation to address Egypt's priority social, economic, and development challenges.", themes: ["Advancing Applied and Development-Oriented Research","Strengthening Research Capabilities and Collaboration","Connecting Evidence with Practical Solutions"], areaTexts: ["Supporting the generation of knowledge and evidence relevant to priority scientific, social, economic, and development challenges.","Enhancing the capabilities of researchers and institutions while encouraging collaboration and knowledge exchange across the research ecosystem.","Promoting the translation of research findings into improved practices, informed decisions, innovation, and responses to societal needs."], outcomes: ["Stronger research capabilities and collaboration.","Increased generation of relevant scientific and development evidence.","Greater application of research in addressing real-world challenges.","Improved evidence-informed decision-making.","Stronger connections between research, innovation, and societal needs."], image: "program-scientific-research", icon: "flask" },
    ] as Programme[],
  },
  enabling: {
    eyebrow: "Enabling functions",
    title: "The capabilities behind every program.",
    // [C] "Intro copy — Enabling functions" (item 10): "They are capabilities, not programs." removed.
    intro: "Three capabilities support all nine programs.",
    items: [
      { name: "NGO Engagement & Development", tagline: "Stronger Local Partners. Greater Community Impact.", text: "Strengthening the governance and capabilities of local nonprofit organizations enables development interventions to reach more communities effectively and sustainably through a network of 4000+ development partners.", icon: "handshake" as IconName },
      { name: "Field Offices", tagline: "Closer to Communities. More Responsive to Their Needs.", text: "MEKI outreach and field base spans across all governorates, connecting development programs with the individuals, households, and communities they serve.", icon: "map" as IconName },
      { name: "Business Intelligence", tagline: "Turning Evidence into Meaningful Action.", text: "Reliable information enables better decisions about where support is needed, which interventions are most relevant, and how progress should be measured, by connecting community insights, program information, and development data.", icon: "chart" as IconName },
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
      { slug: "water", title: "Water for families", programme: "WASH, Environment & Climate Resilience", programmeSlug: "wash", text: "Bringing safe water from station to home, with trenching and pipe connections in Luxor.", image: "water-pipeline" },
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
      { title: "Held for its purpose", text: "Every gift is held for the purpose you chose. Results are reported back to supporters." }, // [C] item 11
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
    // [C] Item 12 + feedback 23 Nov: one caption format, "Title – Place", with the program underneath. Title and place come only from the
    // photo's source folder (public/images/work/manifest.json); "Egypt" where the folder names no city. Program = the program whose work
    // the folder documents (slug → the program's own name, so it always matches the Programs section). MEKI to confirm.
    items: [
      { image: "weavers-loom" as MediaRef, title: "Hand-weaving workshop", place: "Alexandria", program: "economic-empowerment" },
      { image: "water-station" as MediaRef, title: "Water desalination station", place: "Luxor", program: "wash" },
      { image: "greenhouse-harvest" as MediaRef, title: "Greenhouses", place: "Beni Suef", program: "economic-empowerment" },
      { image: "housing-site" as MediaRef, title: "Shelter & Warmth housing works", place: "Egypt", program: "housing" },
      { image: "mobile-clinic" as MediaRef, title: "Mobile medical unit", place: "Egypt", program: "health" },
      { image: "farmer-portrait" as MediaRef, title: "Water-connection project", place: "Luxor", program: "wash" },
      { image: "operating-room" as MediaRef, title: "Hospital support", place: "Egypt", program: "health" },
    ] as GalleryItem[],
    note: "Captions follow “Title – Place”, with the program, taken from the photos' source folders; photographer credits to be confirmed.",
    showMore: "Show more photos",
    showLess: "Show fewer photos",
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
      { href: "/give", label: "Give" },
      { href: "/faq", label: "FAQ" },
    ],
    contactTitle: "Contact",
    contactPending: "Contact details will be published soon.",
    followUs: "Follow us", // [C] item 14
    newTab: "(opens in a new tab)",
    /** [C] item 14 + MEKI confirmation 24 Nov 2026: official accounts. Source of truth = Admin → Site settings → Social links (this list is only the fallback). */
    social: [
      { network: "linkedin", url: "https://www.linkedin.com/company/misr-el-kheir-international" },
      { network: "facebook", url: "https://www.facebook.com/meki.Intr/" },
      { network: "instagram", url: "https://www.instagram.com/meki.intr/" },
    ] as SocialLink[],
    legalPending: "Privacy · Terms · Cookies (coming soon)",
    // rights: "MEKI. All rights reserved.",
    rights: "All Rights Reserved Qeema Tech",
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

/**
 * Footer fields that come from Site settings (Admin → Site settings): free footer text, footer note (shown only when it is not the
 * built-in placeholder), contact details. All optional — absent means "nothing published", never a placeholder.
 */
export type FooterSiteFields = { text?: string; note?: string; email?: string; phone?: string; address?: string };
/** Logo files chosen in Site settings (same-origin /brand/ files or Media Library images); absent → the approved built-in artwork. */
export type BrandLogos = { green?: string; white?: string };
export type Dict = Omit<typeof en, "footer" | "gallery"> & { brand?: BrandLogos; footer: typeof en.footer & FooterSiteFields; gallery: Omit<typeof en.gallery, "items"> & { items: GalleryItem[]; showMore?: string; showLess?: string } };
