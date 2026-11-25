// MEKI — client delivery of 24 Nov 2026 (TransferNow, "5-Pic Sit"): SOURCE OF TRUTH for where every supplied photo goes.
// Folder names are the client's own organisation by purpose → program / website section (not guessed from file names).
// Titles/places are DERIVED (folder name, file name, what the photo shows) and proposed — MEKI has not supplied captions, so every
// caption is marked PROPOSED in the Media Library and must be verified by MEKI. "Egypt" is used where nothing names a place.
//
// roles:  hero-main | hero-secondary  → Homepage hero (static fallback key + CMS Hero image slots)
//         cover      → program cover (static fallback key program-<slug> + Programme.coverMedia)
//         water      → the clear water-project image (campaign card "Water for families", Wash program)
//         gallery    → homepage gallery ("Our work in action") + program gallery + Media Library
//         library    → program gallery + Media Library (every supplied image is available to editors)
//         unreadable → cannot be decoded here (documented, not integrated)
//
// Generate the checksummed manifest:  node deploy/staging/nov25/build-manifest.mjs
export const SRC_SUBPATH = 'TransferNow-20261124v26ETFjR/5-Pic Sit';

const EG = ['Egypt', 'مصر'];
const GZ = ['Gaza', 'غزة'];
const LX = ['Luxor', 'الأقصر'];
const BS = ['Beni Suef', 'بني سويف'];

/** [file, role, key, titleEn, titleAr, [placeEn, placeAr]] */
const G = (folder, program, rows) => rows.map(([file, role, key, tEn, tAr, place = EG]) => ({ folder, program, file, role, key, titleEn: tEn, titleAr: tAr, placeEn: place[0], placeAr: place[1] }));

export const ENTRIES = [
  // ───────── Homepage hero ("Home P": the two approved hero options) ─────────
  ...G('home p', null, [
    ['DSC06120.JPG', 'hero-main', 'hero-family', 'A mother with her daughters at a community school', 'أمٌّ مع بناتها في مدرسة مجتمعية'],
    ['2026-11-18 at 2.23.11 PM.jpeg', 'hero-secondary', 'hero-school', 'Pupils working together in class', 'تلاميذ يعملون معًا في الفصل'],
  ]),

  // ───────── 01 Social Solidarity & Household Resilience ─────────
  ...G('Household aid and resiliance', 'social-solidarity', [
    ['6R6A4043.JPG', 'cover', 'program-social-solidarity', 'Volunteers delivering blankets to families', 'متطوعون يوصلون البطاطين إلى الأسر'],
    ['6R6A4122.JPG', 'gallery', 'household-door-delivery', 'Door-to-door aid delivery', 'توصيل المساعدات من باب إلى باب'],
    ['6R6A3197.JPG', 'library', 'household-aid-delivery', 'Aid delivery to a village home', 'توصيل مساعدات إلى منزل في قرية'],
    ['6R6A4071.JPG', 'library', 'household-blankets-distribution', 'Blanket distribution', 'توزيع البطاطين'],
    ['DOD02119 copy2٢.png', 'library', 'household-family-meal', 'A family sharing a meal', 'أسرة تتشارك وجبة'],
    ['DSC05847.JPG', 'library', 'household-classroom', 'Pupils in a supported classroom', 'تلاميذ في فصل مدعوم'],
    ['WhatsApp Image 2026-11-18 at 2.58.29 PM(3).jpeg', 'library', 'household-volunteer-bags', 'Volunteer carrying aid bags', 'متطوع يحمل حقائب مساعدات'],
  ]),

  // ───────── 02 Health ─────────
  ...G('Health', 'health', [
    ['DSC05616.JPG', 'cover', 'program-health', 'A patient on a rehabilitation walk with his doctor', 'مريض في جلسة تأهيل مع طبيبه'],
    ['Screen Shot 2024-07-02 at 1.12.50 PM.png', 'gallery', 'health-ward', 'Renovated hospital ward', 'عنبر مستشفى بعد التجديد'],
    ['كوم حمادة ٢.JPG', 'gallery', 'health-dialysis-kom-hamada', 'Dialysis unit', 'وحدة غسيل كلوي', ['Kom Hamada', 'كوم حمادة']],
    ['Screen Shot 2024-07-02 at 1.15.39 PM.png', 'library', 'health-ward-2', 'Hospital ward', 'عنبر مستشفى'],
    ['Screen Shot 2024-07-02 at 1.19.17 PM.png', 'library', 'health-neonatal-room', 'Neonatal room', 'غرفة حديثي الولادة'],
    ['Screen Shot 2024-07-02 at 1.22.09 PM.png', 'library', 'health-children-corridor', 'Children\'s hospital corridor', 'ممر مستشفى الأطفال'],
    ['Screen Shot 2024-07-02 at 1.23.01 PM.png', 'library', 'health-nurses-station', 'Nurses\' station', 'محطة التمريض'],
    ['WhatsApp Image 2024-07-01 at 12.38.43 PM.jpeg', 'library', 'health-children-corridor-2', 'Children\'s hospital corridor', 'ممر مستشفى الأطفال'],
    ['WhatsApp Image 2024-07-01 at 12.38.51 PM (3).jpeg', 'library', 'health-ward-3', 'Hospital ward', 'عنبر مستشفى'],
    ['ابو الريش قبل.JPG', 'library', 'health-corridor-before-abu-el-rish', 'Hospital corridor before renovation', 'ممر المستشفى قبل التجديد', ['Abu El Rish', 'أبو الريش']],
    ['IMG_1746.HEIC', 'library', 'health-dialysis-patient', 'Dialysis session', 'جلسة غسيل كلوي'],
  ]),

  // ───────── 03 Education (+ "Ibn El-Sabeel" students' residence) ─────────
  ...G('Education', 'education', [
    ['khairy (46 of 191).jpg', 'cover', 'program-education', 'Pupils on a bench in the school yard', 'تلاميذ على مقعد في فناء المدرسة'],
    ['1S9A3753.JPG', 'gallery', 'education-school-building', 'Community school building', 'مبنى مدرسة مجتمعية'],
    ['تعليم.jpg', 'gallery', 'education-graduation-stage', 'Graduation ceremony', 'حفل تخرج'],
    ['1J2A8512-1.png', 'library', 'education-flag-ceremony', 'Pupils at the morning flag ceremony', 'تلاميذ في طابور العلم'],
    ['52.jpeg', 'library', 'education-pupils-writing', 'Pupils writing in class', 'تلاميذ يكتبون في الفصل'],
    ['DSC05908.jpg', 'library', 'education-classroom', 'Classroom', 'فصل دراسي'],
    ['Khairy (10 of 199).jpg', 'library', 'education-schoolgirl', 'Schoolgirl with her backpack', 'تلميذة تحمل حقيبتها'],
    ['Khairy (13 of 199).jpg', 'library', 'education-schoolboy', 'Schoolboy with his backpack', 'تلميذ يحمل حقيبته'],
    ['khairy (40 of 191).jpg', 'library', 'education-playground-swings', 'School playground', 'ملعب المدرسة'],
    ['khairy (45 of 191).jpg', 'library', 'education-tire-swing', 'A pupil on a swing', 'تلميذ على أرجوحة'],
    ['khairy (56 of 64).jpg', 'library', 'education-school-colourful', 'School building', 'مبنى مدرسة'],
    ['Screenshot 2026-01-22 at 6.15.01 PM.png', 'library', 'education-graduates', 'Graduates in academic dress', 'خريجون بالزي الأكاديمي'],
  ]),
  ...G('ابن السبيل', 'education', [
    ['1J0A6168.JPG', 'gallery', 'ibn-el-sabeel-dorm', 'Students\' residence bedroom', 'غرفة نوم في سكن الطلاب'],
    ['6R6A3154.01_08_54_24.Still014.png', 'library', 'ibn-el-sabeel-entrance', 'Students\' residence entrance', 'مدخل سكن الطلاب'],
  ]),

  // ───────── 04 Economic Empowerment & Labor Market Activation ─────────
  ...G('Economic Empowerment', 'economic-empowerment', [
    ['khairy (50 of 183).jpg', 'cover', 'program-economic-empowerment', 'Sewing workshop', 'ورشة خياطة'],
    ['khairy (18 of 183).jpg', 'gallery', 'economic-greenhouse-harvest', 'Greenhouse harvest', 'حصاد من الصوب الزراعية', BS],
    ['300A2807.jpg', 'gallery', 'economic-carpet-showroom', 'Handmade carpets showroom', 'معرض السجاد اليدوي'],
    ['1S9A6324.JPG', 'library', 'economic-carpentry-workshop', 'Carpentry workshop', 'ورشة نجارة'],
    ['2M5A4533.JPG', 'library', 'economic-livestock-shed', 'Livestock shed', 'عنبر ماشية'],
    ['44.jpg', 'library', 'economic-livestock-shed-2', 'Livestock shed', 'عنبر ماشية'],
    ['DSC04504.JPG', 'library', 'economic-fishermen-boats', 'Fishermen preparing their boats', 'صيادون يجهزون قواربهم'],
    ['DSC04530.JPG', 'library', 'economic-fisherman-nile', 'A fisherman on the river', 'صياد على النهر'],
    ['khairy (5 of 183).jpg', 'library', 'economic-greenhouse-farmer', 'Greenhouse farmer', 'مزارع في الصوب الزراعية', BS],
    ['khairy (6 of 64).jpg', 'library', 'economic-carpentry-craftsman', 'Carpentry craftsman', 'نجار في ورشته'],
    ['WhatsApp Image 2026-11-18 at 2.17.09 PM.jpeg', 'library', 'economic-farmer-tiller', 'Farmer with a tiller', 'مزارع مع آلة زراعية'],
  ]),
  ...G('Economic Empowerment/استثمار', 'economic-empowerment', [
    ['1.png', 'library', 'investment-factory-complex', 'Textile factories complex', 'مجمع مصانع المنسوجات'],
    ['5.png', 'library', 'investment-factory-building', 'Textile factories complex building', 'مبنى مجمع مصانع المنسوجات'],
    ['6.png', 'library', 'investment-factory-building-2', 'Textile factories complex building', 'مبنى مجمع مصانع المنسوجات'],
    ['12.png', 'library', 'investment-cutting-machine', 'Automatic fabric cutting', 'قص الأقمشة آليًا'],
    ['32.png', 'library', 'investment-fabric-spreading', 'Fabric spreading', 'فرد الأقمشة'],
    ['36.png', 'library', 'investment-sewing-line', 'Sewing line', 'خط الخياطة'],
    ['51.png', 'library', 'investment-ironing', 'Garment pressing', 'كي الملابس'],
    ['53.png', 'library', 'investment-production-floor', 'Production floor', 'صالة الإنتاج'],
    ['55.png', 'library', 'investment-factory-hall', 'Factory hall', 'صالة المصنع'],
    ['63.png', 'library', 'investment-sewing-workers', 'Garment workers', 'عاملات الملابس'],
    ['65.png', 'library', 'investment-cutting-table', 'Cutting tables', 'طاولات القص'],
    ['66.png', 'library', 'investment-factory-sign', 'Textile factories complex sign', 'لافتة مجمع مصانع المنسوجات'],
    ['68.png', 'library', 'investment-factory-gate', 'Textile factories complex gate', 'بوابة مجمع مصانع المنسوجات'],
    ['69.png', 'library', 'investment-factory-entrance', 'Textile factories complex entrance', 'مدخل مجمع مصانع المنسوجات'],
  ]),

  // ───────── 05 Housing & Safe Living Conditions ─────────
  ...G('Housing', 'housing', [
    ['6R6A0542.JPG', 'cover', 'program-housing', 'A newly built family home', 'منزل أسرة جديد'],
    ['Screen Shot 2025-04-30 at 1.33.44 AM.png', 'gallery', 'housing-painted-home', 'Painted family home', 'منزل مطلي لأسرة'],
    ['6R6A4044.JPG', 'library', 'housing-renovated-home', 'Renovated home', 'منزل بعد التجديد'],
    ['Screen Shot 2025-04-30 at 1.33.56 AM.png', 'library', 'housing-painted-home-2', 'Painted family home', 'منزل مطلي لأسرة'],
    ['Screen Shot 2025-04-30 at 1.34.12 AM.png', 'library', 'housing-painted-home-3', 'Painted family home', 'منزل مطلي لأسرة'],
    ['Screen Shot 2025-04-30 at 1.36.48 AM.png', 'library', 'housing-girl-at-home', 'A girl outside her family\'s home', 'فتاة أمام منزل أسرتها'],
  ]),

  // ───────── 06 WASH, Environment & Climate Resilience ─────────
  ...G('Wash', 'wash', [
    ['khairy (63 of 155).jpg', 'cover', 'program-wash', 'Water station and storage tank', 'محطة مياه وخزان', LX],
    ['EE1A4743.jpg', 'water', 'water-pipeline', 'Laying a drinking-water pipeline', 'مد خط مياه الشرب'],
    ['22.jpg', 'gallery', 'wash-girl-drinking', 'A girl drinking clean water', 'فتاة تشرب مياهًا نظيفة'],
    ['EE1A4541.jpg', 'library', 'wash-tap-hands', 'Clean water from the tap', 'مياه نظيفة من الصنبور'],
    ['EE1A4568.jpg', 'library', 'wash-water-splash', 'Fresh water flowing', 'تدفق المياه النظيفة'],
    ['EE1A4901.jpg', 'library', 'wash-girl-glass', 'A girl filling a glass of water', 'فتاة تملأ كوب ماء'],
  ]),

  // ───────── 07 Emergency Response ─────────
  ...G('emergency response', 'emergency-response', [
    ['10.png', 'cover', 'program-emergency-response', 'Aid convoy on the road', 'قافلة مساعدات على الطريق'],
    ['معبر20.JPG', 'gallery', 'emergency-convoy-launch', 'Aid convoy departure with volunteers', 'انطلاق قافلة المساعدات مع المتطوعين'],
    ['15 gaza.png', 'gallery', 'emergency-gaza-aid-box', 'A child carrying an aid box', 'طفلة تحمل صندوق مساعدات', GZ],
    ['16 gaza.png', 'library', 'emergency-gaza-distribution', 'Aid distribution', 'توزيع المساعدات', GZ],
    ['17 gaza.png', 'library', 'emergency-gaza-distribution-2', 'Aid distribution to families', 'توزيع المساعدات على الأسر', GZ],
    ['18 gaza.png', 'library', 'emergency-gaza-mother-child', 'Relief worker with a mother and child', 'عاملة إغاثة مع أم وطفلها', GZ],
    ['12.png', 'library', 'emergency-trucks', 'Aid trucks', 'شاحنات المساعدات'],
    ['13 معبر.png', 'library', 'emergency-border-trucks', 'Aid trucks at the border crossing', 'شاحنات المساعدات عند المعبر'],
    ['14معبر.png', 'library', 'emergency-border-volunteers', 'Volunteers at the border crossing', 'متطوعون عند المعبر'],
    ['معبر19.png', 'library', 'emergency-border-flags', 'Volunteers with flags at the crossing', 'متطوعون بالأعلام عند المعبر'],
    ['1.JPG', 'library', 'emergency-packing-tent', 'Relief packing hall', 'صالة تعبئة المساعدات'],
    ['2.JPG', 'library', 'emergency-sorting', 'Sorting relief supplies', 'فرز المستلزمات الإغاثية'],
    ['3.JPG', 'library', 'emergency-medical-supplies', 'Packing medical supplies', 'تعبئة المستلزمات الطبية'],
    ['4.JPG', 'library', 'emergency-volunteers-packing', 'Volunteers packing aid', 'متطوعون يعبئون المساعدات'],
    ['5.JPG', 'library', 'emergency-relief-hall', 'Volunteers in the relief hall', 'متطوعون في صالة الإغاثة'],
    ['6.JPG', 'library', 'emergency-convoy-truck', 'Aid truck', 'شاحنة مساعدات'],
    ['7.JPG', 'library', 'emergency-convoy-truck-2', 'Aid truck', 'شاحنة مساعدات'],
    ['8.JPG', 'library', 'emergency-convoy-volunteer', 'Volunteer beside the aid convoy', 'متطوع بجوار قافلة المساعدات'],
    ['9.JPG', 'library', 'emergency-convoy-line', 'Aid convoy leaving', 'قافلة مساعدات منطلقة'],
  ]),

  // ───────── 08 Heritage, Culture & Identity (+ "Disability": inclusive sport and performance) ─────────
  ...G('Culture and Heritage', 'heritage-culture', [
    ['khairy (13 of 64).jpg', 'cover', 'program-heritage-culture', 'Women weaving at the loom', 'نساء يعملن على النول'],
    ['300A2665.jpg', 'gallery', 'heritage-weaver', 'Hand-weaving workshop', 'ورشة النسيج اليدوي'],
    ['ارتكاز دعم الفنون والثقافة.jpg', 'gallery', 'heritage-arts-concert', 'Arts and culture concert', 'حفل دعم الفنون والثقافة'],
    ['300A2669.jpg', 'library', 'heritage-weaving-hands', 'Weaving a carpet by hand', 'نسج سجادة يدويًا'],
    ['khairy (20 of 64).jpg', 'library', 'heritage-stage-event', 'Cultural event on stage', 'فعالية ثقافية على المسرح'],
    ['Khairy (8 of 72).jpg', 'library', 'heritage-handicrafts-showcase', 'Handicrafts showcase', 'معرض الحرف اليدوية'],
    ['نور والامل ٢.jpg', 'library', 'heritage-orchestra', 'Orchestra at the International Handicrafts Show', 'أوركسترا في المعرض الدولي للحرف اليدوية'],
  ]),
  ...G('disability', 'heritage-culture', [
    ['khairy (91 of 183).jpg', 'gallery', 'disability-swimmer', 'Inclusive swimming', 'سباحة دامجة'],
    ['18.jpg', 'library', 'disability-football', 'Playing football on crutches', 'لعب كرة القدم على عكازين'],
    ['77.jpg', 'library', 'disability-performer', 'Musician performing on stage', 'عازفة على المسرح'],
  ]),

  // ───────── 09 Scientific Research & Research Ecosystem ─────────
  ...G('Scientific research', 'scientific-research', [
    ['DSC00190.jpg', 'cover', 'program-scientific-research', 'A researcher at work in a greenhouse lab', 'باحث يعمل في معمل داخل صوبة زراعية'],
    ['DSC07575.JPG', 'gallery', 'research-laboratory', 'Research laboratory', 'معمل أبحاث'],
  ]),
];
