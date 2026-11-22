/**
 * Admin interface copy, English + Arabic. The Arabic text is a TECHNICAL INTERFACE draft for MEKI review (not approved
 * brand wording). Data (donor names, campaign titles, references) is shown exactly as the API returns it.
 */
import { cmsAr, cmsEn } from "./i18n-cms.ts";
import { contentAr, contentEn } from "./i18n-content.ts";
import { finAr, finEn } from "./i18n-finance.ts";
import { galaAr, galaEn } from "./i18n-gala.ts";
import { zeffyAr, zeffyEn } from "./i18n-zeffy.ts";
import { sdiAr, sdiEn } from "./i18n-sdi.ts";
import { givingAr, givingEn } from "./i18n-giving.ts";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const isLocale = (v: string): v is Locale => (locales as readonly string[]).includes(v);

export const en = {
  dir: "ltr" as "ltr" | "rtl",
  brand: "MEKI Admin",
  skip: "Skip to content",
  nav: {
    groups: { overview: "Overview", programs: "Program management", donors: "Donor management", events: "Event management", website: "Website management", admin: "Reports & administration" },
    items: {
      dashboard: "Dashboard", analytics: "Analytics", programs: "Programs", causes: "Causes", campaigns: "Campaigns", donorList: "Donors", donations: "Donations",
      payments: "Payments & Refunds", sdiZeffy: "SDI / Zeffy", sdiReconciliation: "SDI Reconciliation", sdiEvidence: "SDI payment evidence", sdiAttendees: "SDI Attendee List", givingIntents: "Giving Intents", zakat: "Zakat Eligibility", recurring: "Recurring Donations", receipts: "Receipts", events: "Events", bookings: "Bookings", guests: "Guest Management",
      checkin: "QR Check-in", galaOverview: "Gala Night", tickets: "Tickets", galaExports: "Guest Export", galaComms: "Communications", galaSettings: "Gala Settings", pages: "Pages", homepage: "Homepage", statistics: "Statistics", menus: "Menus", media: "Media Library", faqs: "FAQs", siteSettings: "Site Settings", reports: "Reports", users: "Users & Roles",
      audit: "Audit Logs", settings: "Settings",
    } as Record<string, string>,
    soon: "Soon",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  header: { language: "العربية", profile: "Account", changePassword: "Change password", signOut: "Sign out", signingOut: "Signing out…", confirmSignOut: "Sign out of the admin dashboard?", cancel: "Cancel", roles: "Roles" },
  breadcrumbs: { home: "Home" },
  login: {
    title: "Sign in",
    subtitle: "MEKI administration",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    errors: { invalid: "Email or password is incorrect.", locked: "Too many attempts. Please wait a minute and try again.", network: "We could not reach the server. Please try again.", unknown: "Sign-in failed. Please try again.", forbidden: "This account must change its password before using the dashboard (not available in this version)." },
    note: "Authorised MEKI staff only. Sessions are protected by secure cookies.",
  },
  states: { loading: "Loading…", error: "This section could not be loaded.", retry: "Try again", empty: "Nothing to show yet.", forbidden: "You do not have access to this section.", unavailable: "Not available until the required data exists.", notFound: "This record was not found." },
  dashboard: {
    title: "Dashboard",
    welcome: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", text: "Here is what is happening across MEKI's giving and events. Figures include verified payments only." },
    range: { label: "Period", last7: "Last 7 days", last30: "Last 30 days", thisMonth: "This month", lastMonth: "Last month", ytd: "Year to date", all: "All time" },
    currency: "Currency",
    actions: "Actions",
    kpi: {
      donations: "Total confirmed donations", donationsHint: "Verified payments, gross", donors: "Total donors", donorsHint: "Donor records", programs: "Active programs", programsHint: "Published programs", gala: "Confirmed Gala guests", galaHint: "Issued tickets (separate from donations)",
      noPermission: "Requires additional permission",
    },
    hero: { title: "Net donations", sub: "After refunds", gross: "Gross", refunded: "Refunded", donationsCount: "confirmed donations", view: "View recent donations" },
    overview: { title: "Donation overview", subtitle: "All-time status of donation intents", confirmed: "Confirmed", pending: "Pending", failed: "Failed", cancelled: "Cancelled / expired", refunded: "Refunded", of: "of {total} donations", total: "Donations (all statuses)" },
    trend: { title: "Donations over time", gross: "Gross", net: "Net of refunds", day: "Daily", month: "Monthly", note: "Comparison with a previous period is not shown." },
    distribution: { title: "Donation distribution", subtitle: "Net, by designation", general: "General fund", campaigns: "Campaigns", programmes: "Programs" },
    flow: { title: "Donation flow", gross: "Gross", refunded: "Refunded", net: "Net" },
    programs: { title: "Program performance", subtitle: "Net donations designated directly to a program", note: "General-fund and campaign donations are not attributed to programs." },
    progress: { title: "Campaign progress", subtitle: "Progress only where MEKI approved a target", raised: "raised", noTarget: "No approved target", of: "of" },
    gauges: { title: "Giving health", refundRate: "Refund rate", recurring: "Monthly-giving share", checkin: "Gala check-in rate", na: "—" },
    stacked: { title: "One-time vs monthly giving", subtitle: "Net and refunded, by frequency", oneTime: "One-time", monthly: "Monthly", net: "Net", refunded: "Refunded" },
    top: { title: "Top campaigns", subtitle: "By net donations", donations: "donations" },
    activity: { title: "Recent activity", subtitle: "From the audit log", by: "by", system: "System", ago: { minute: "{n} min ago", hour: "{n} h ago", day: "{n} d ago" }, none: "No recent activity." },
    quick: { title: "Quick actions", viewDonations: "View donations", viewDonationsSub: "Recent donations", programs: "Manage programs", programsSub: "Programs & causes", campaigns: "Manage campaigns", campaignsSub: "Lifecycle & approval", gala: "Gala bookings", galaSub: "Ticket overview", checkin: "Open check-in", checkinSub: "Upcoming module", content: "Website content", contentSub: "Upcoming module" },
    gala: { title: "Gala Night — ticketing", subtitle: "Ticket revenue is reported separately and is never added to donations", bookings: "Total bookings", confirmed: "Confirmed guests", pending: "Pending bookings", checkedIn: "Checked-in guests", revenue: "Ticket sales revenue", progress: "Ticket sales progress", noCapacity: "No approved capacity configured", notSetUp: "Gala ticketing is not set up yet." },
    table: {
      title: "Recent donations", search: "Search by reference", status: "Status", all: "All statuses", donor: "Donor", reference: "Reference", designation: "Designation", amount: "Amount", currency: "Currency", paymentStatus: "Payment status", date: "Date", actions: "Actions", view: "View details",
      anonymous: "Anonymous", hidden: "Restricted", general: "General fund", empty: "No donations match.", emptyAll: "No confirmed or pending donations yet.", prev: "Previous", next: "Next", page: "Page {page} of {pages}", total: "{n} donations",
      detail: { title: "Donation details", frequency: "Frequency", gross: "Amount", refunded: "Refunded", net: "Net", created: "Created", confirmed: "Confirmed at", close: "Close", oneTime: "One-time", monthly: "Monthly", notConfirmed: "Not confirmed" },
      statuses: { PAID: "Paid", UNPAID: "Unpaid", AUTHORIZED: "Authorized", PARTIALLY_REFUNDED: "Partially refunded", REFUNDED: "Refunded", FAILED: "Failed" } as Record<string, string>,
    },
    audit: { actions: {} as Record<string, string> },
    chartTable: { period: "Period", category: "Category", amount: "Amount", share: "Share" },
  },
  empty: { noConfirmed: "No confirmed donations in this period.", noData: "No data for this period.", chartNote: "Charts show verified payments only." },
  fin: finEn,
  content: contentEn,
  cms: cmsEn,
  gala: galaEn,
  zeffy: zeffyEn,
  sdi: sdiEn,
  giving: givingEn,
};

export type Dict = typeof en;

export const ar: Dict = {
  dir: "rtl",
  brand: "إدارة MEKI",
  skip: "انتقل إلى المحتوى",
  nav: {
    groups: { overview: "نظرة عامة", programs: "إدارة البرامج", donors: "إدارة المتبرعين", events: "إدارة الفعاليات", website: "إدارة الموقع", admin: "التقارير والإدارة" },
    items: {
      dashboard: "لوحة التحكم", analytics: "التحليلات", programs: "البرامج", causes: "القضايا", campaigns: "الحملات", donorList: "المتبرعون", donations: "التبرعات",
      payments: "المدفوعات والمستردات", sdiZeffy: "SDI / Zeffy", sdiReconciliation: "مطابقة تقارير SDI", sdiEvidence: "أدلة مدفوعات SDI", sdiAttendees: "قائمة حضور SDI", givingIntents: "نوايا التبرع", zakat: "أهلية الزكاة", recurring: "التبرعات المتكررة", receipts: "الإيصالات", events: "الفعاليات", bookings: "الحجوزات", guests: "إدارة الضيوف",
      checkin: "تسجيل الدخول بـ QR", galaOverview: "ليلة الحفل", tickets: "التذاكر", galaExports: "تصدير الضيوف", galaComms: "المراسلات", galaSettings: "إعدادات الحفل", pages: "الصفحات", homepage: "الصفحة الرئيسية", statistics: "الإحصاءات", menus: "القوائم", media: "مكتبة الوسائط", faqs: "الأسئلة الشائعة", siteSettings: "إعدادات الموقع", reports: "التقارير", users: "المستخدمون والأدوار",
      audit: "سجل التدقيق", settings: "الإعدادات",
    },
    soon: "قريباً",
    collapse: "طي الشريط الجانبي",
    expand: "توسيع الشريط الجانبي",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
  },
  header: { language: "English", profile: "الحساب", changePassword: "تغيير كلمة المرور", signOut: "تسجيل الخروج", signingOut: "جارٍ تسجيل الخروج…", confirmSignOut: "هل تريد تسجيل الخروج من لوحة الإدارة؟", cancel: "إلغاء", roles: "الأدوار" },
  breadcrumbs: { home: "الرئيسية" },
  login: {
    title: "تسجيل الدخول",
    subtitle: "إدارة MEKI",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "تسجيل الدخول",
    submitting: "جارٍ تسجيل الدخول…",
    errors: { invalid: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", locked: "محاولات كثيرة. يرجى الانتظار دقيقة ثم المحاولة مرة أخرى.", network: "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.", unknown: "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.", forbidden: "يجب على هذا الحساب تغيير كلمة المرور قبل استخدام اللوحة (غير متاح في هذا الإصدار)." },
    note: "لموظفي MEKI المصرّح لهم فقط. الجلسات محمية بملفات تعريف ارتباط آمنة.",
  },
  states: { loading: "جارٍ التحميل…", error: "تعذّر تحميل هذا القسم.", retry: "حاول مرة أخرى", empty: "لا يوجد ما يُعرض بعد.", forbidden: "ليست لديك صلاحية الوصول إلى هذا القسم.", unavailable: "غير متاح حتى تتوفر البيانات اللازمة.", notFound: "لم يتم العثور على هذا السجل." },
  dashboard: {
    title: "لوحة التحكم",
    welcome: { morning: "صباح الخير", afternoon: "مساء الخير", evening: "مساء الخير", text: "هذه نظرة على ما يجري في تبرعات MEKI وفعالياتها. تشمل الأرقام المدفوعات المؤكدة فقط." },
    range: { label: "الفترة", last7: "آخر 7 أيام", last30: "آخر 30 يوماً", thisMonth: "هذا الشهر", lastMonth: "الشهر الماضي", ytd: "منذ بداية العام", all: "كل الفترات" },
    currency: "العملة",
    actions: "إجراءات",
    kpi: {
      donations: "إجمالي التبرعات المؤكدة", donationsHint: "مدفوعات موثّقة، قبل الاسترداد", donors: "إجمالي المتبرعين", donorsHint: "سجلات المتبرعين", programs: "البرامج النشطة", programsHint: "برامج منشورة", gala: "ضيوف الحفل المؤكدون", galaHint: "تذاكر صادرة (منفصلة عن التبرعات)",
      noPermission: "تتطلب صلاحية إضافية",
    },
    hero: { title: "صافي التبرعات", sub: "بعد المستردات", gross: "الإجمالي", refunded: "المسترد", donationsCount: "تبرعاً مؤكداً", view: "عرض أحدث التبرعات" },
    overview: { title: "نظرة على التبرعات", subtitle: "حالة طلبات التبرع على مدى كل الفترات", confirmed: "مؤكدة", pending: "قيد الانتظار", failed: "فاشلة", cancelled: "ملغاة / منتهية", refunded: "مستردة", of: "من أصل {total} تبرعاً", total: "التبرعات (كل الحالات)" },
    trend: { title: "التبرعات عبر الزمن", gross: "الإجمالي", net: "الصافي بعد المستردات", day: "يومي", month: "شهري", note: "لا تُعرض المقارنة بفترة سابقة." },
    distribution: { title: "توزيع التبرعات", subtitle: "الصافي حسب التخصيص", general: "الصندوق العام", campaigns: "الحملات", programmes: "البرامج" },
    flow: { title: "تدفق التبرعات", gross: "الإجمالي", refunded: "المسترد", net: "الصافي" },
    programs: { title: "أداء البرامج", subtitle: "صافي التبرعات المخصصة مباشرة لبرنامج", note: "لا تُنسب تبرعات الصندوق العام والحملات إلى البرامج." },
    progress: { title: "تقدم الحملات", subtitle: "يظهر التقدم فقط حيث اعتمدت MEKI هدفاً", raised: "تم جمعه", noTarget: "لا يوجد هدف معتمد", of: "من" },
    gauges: { title: "مؤشرات العطاء", refundRate: "معدل الاسترداد", recurring: "حصة العطاء الشهري", checkin: "معدل تسجيل الحضور", na: "—" },
    stacked: { title: "العطاء لمرة واحدة مقابل الشهري", subtitle: "الصافي والمسترد حسب التكرار", oneTime: "مرة واحدة", monthly: "شهري", net: "الصافي", refunded: "المسترد" },
    top: { title: "أبرز الحملات", subtitle: "حسب صافي التبرعات", donations: "تبرعات" },
    activity: { title: "النشاط الأخير", subtitle: "من سجل التدقيق", by: "بواسطة", system: "النظام", ago: { minute: "قبل {n} د", hour: "قبل {n} س", day: "قبل {n} ي" }, none: "لا يوجد نشاط حديث." },
    quick: { title: "إجراءات سريعة", viewDonations: "عرض التبرعات", viewDonationsSub: "أحدث التبرعات", programs: "إدارة البرامج", programsSub: "البرامج والقضايا", campaigns: "إدارة الحملات", campaignsSub: "دورة الحياة والاعتماد", gala: "حجوزات الحفل", galaSub: "نظرة على التذاكر", checkin: "فتح تسجيل الحضور", checkinSub: "وحدة قادمة", content: "محتوى الموقع", contentSub: "وحدة قادمة" },
    gala: { title: "حفل MEKI — التذاكر", subtitle: "إيراد التذاكر يُعرض منفصلاً ولا يُضاف أبداً إلى التبرعات", bookings: "إجمالي الحجوزات", confirmed: "الضيوف المؤكدون", pending: "حجوزات قيد الانتظار", checkedIn: "الضيوف الذين سجّلوا حضورهم", revenue: "إيراد بيع التذاكر", progress: "تقدم بيع التذاكر", noCapacity: "لم تُحدَّد سعة معتمدة", notSetUp: "تذاكر الحفل غير مُعدّة بعد." },
    table: {
      title: "أحدث التبرعات", search: "ابحث بالمرجع", status: "الحالة", all: "كل الحالات", donor: "المتبرع", reference: "المرجع", designation: "التخصيص", amount: "المبلغ", currency: "العملة", paymentStatus: "حالة الدفع", date: "التاريخ", actions: "إجراءات", view: "عرض التفاصيل",
      anonymous: "مجهول", hidden: "مقيّد", general: "الصندوق العام", empty: "لا توجد تبرعات مطابقة.", emptyAll: "لا توجد تبرعات مؤكدة أو معلّقة بعد.", prev: "السابق", next: "التالي", page: "صفحة {page} من {pages}", total: "{n} تبرعاً",
      detail: { title: "تفاصيل التبرع", frequency: "التكرار", gross: "المبلغ", refunded: "المسترد", net: "الصافي", created: "أُنشئ", confirmed: "تاريخ التأكيد", close: "إغلاق", oneTime: "مرة واحدة", monthly: "شهري", notConfirmed: "غير مؤكد" },
      statuses: { PAID: "مدفوع", UNPAID: "غير مدفوع", AUTHORIZED: "مصرّح به", PARTIALLY_REFUNDED: "مسترد جزئياً", REFUNDED: "مسترد", FAILED: "فاشل" },
    },
    audit: { actions: {} },
    chartTable: { period: "الفترة", category: "الفئة", amount: "المبلغ", share: "النسبة" },
  },
  empty: { noConfirmed: "لا توجد تبرعات مؤكدة في هذه الفترة.", noData: "لا توجد بيانات لهذه الفترة.", chartNote: "تعرض الرسوم المدفوعات الموثّقة فقط." },
  fin: finAr,
  content: contentAr,
  cms: cmsAr,
  gala: galaAr,
  zeffy: zeffyAr,
  sdi: sdiAr,
  giving: givingAr,
};

export const getDict = (l: Locale): Dict => (l === "ar" ? ar : en);
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
