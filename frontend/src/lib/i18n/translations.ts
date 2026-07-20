export type Locale = 'en' | 'ur' | 'hi' | 'ar' | 'es' | 'fr' | 'de' | 'zh';

export const LOCALES: { code: Locale; label: string; dir: 'ltr' | 'rtl'; priority?: string }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'Urdu', dir: 'rtl', priority: 'highest' },
  { code: 'ar', label: 'Arabic', dir: 'rtl', priority: 'highest' },
  { code: 'es', label: 'Spanish', dir: 'ltr', priority: 'high' },
  { code: 'fr', label: 'French', dir: 'ltr', priority: 'high' },
  { code: 'de', label: 'German', dir: 'ltr', priority: 'medium' },
  { code: 'zh', label: 'Chinese', dir: 'ltr', priority: 'medium' },
  { code: 'hi', label: 'Hindi', dir: 'ltr' },
];

type Dict = Record<string, string>;

const en: Dict = {
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good night',
  'settings.language': 'Language',
  'settings.save': 'Save Changes',
  'pricing.fuel': 'Pay for fuel, not features',
  'pricing.topup': 'Token Balance & Plans',
  'footer.terms': 'Terms of Service',
  'footer.refund': 'Refund Policy',
  'footer.privacy': 'Privacy Policy',
  'deploy.title': 'Deploy & Domains',
  'media.label': 'AI Media',
  'checkout.methods': 'Cards & local methods via Lemon Squeezy',
  'nav.workspace': 'Workspace',
  'nav.dashboard': 'Dashboard',
  'nav.analytics': 'Analytics',
  'nav.community': 'Community',
  'nav.settings': 'Settings',
  'download.app': 'Download app',
  'download.soon': 'Launch soon',
  'community.pool': 'Community Pool',
  'community.marketplace': 'Marketplace',
  'community.distribution': 'Auto Distribution',
};

const ur: Dict = {
  ...en,
  'greeting.morning': 'صبح بخیر',
  'greeting.afternoon': 'دوپہر بخیر',
  'greeting.evening': 'شام بخیر',
  'greeting.night': 'شب بخیر',
  'settings.language': 'زبان',
  'settings.save': 'محفوظ کریں',
  'pricing.fuel': 'فیچرز نہیں، فیول کے لیے ادائیگی',
  'footer.terms': 'شرائط و ضوابط',
  'footer.refund': 'رقم واپسی کی پالیسی',
  'footer.privacy': 'رازداری کی پالیسی',
  'media.label': 'AI میڈیا',
  'nav.workspace': 'ورک اسپیس',
  'nav.dashboard': 'ڈیش بورڈ',
  'nav.analytics': 'تجزیات',
  'nav.community': 'کمیونٹی',
  'nav.settings': 'ترتیبات',
  'download.app': 'ایپ ڈاؤن لوڈ',
  'download.soon': 'جلد آ رہا ہے',
};

const ar: Dict = {
  ...en,
  'greeting.morning': 'صباح الخير',
  'greeting.afternoon': 'مساء الخير',
  'greeting.evening': 'مساء الخير',
  'greeting.night': 'تصبح على خير',
  'settings.language': 'اللغة',
  'settings.save': 'حفظ',
  'pricing.fuel': 'ادفع للوقود وليس للميزات',
  'footer.terms': 'شروط الخدمة',
  'footer.refund': 'سياسة الاسترداد',
  'footer.privacy': 'سياسة الخصوصية',
  'media.label': 'وسائط AI',
  'nav.workspace': 'مساحة العمل',
  'nav.dashboard': 'لوحة التحكم',
  'nav.analytics': 'التحليلات',
  'nav.community': 'المجتمع',
  'nav.settings': 'الإعدادات',
  'download.app': 'تحميل التطبيق',
  'download.soon': 'قريباً',
};

const es: Dict = {
  ...en,
  'greeting.morning': 'Buenos días',
  'greeting.afternoon': 'Buenas tardes',
  'greeting.evening': 'Buenas tardes',
  'greeting.night': 'Buenas noches',
  'settings.language': 'Idioma',
  'settings.save': 'Guardar cambios',
  'pricing.fuel': 'Paga por combustible, no por funciones',
  'footer.terms': 'Términos de servicio',
  'footer.refund': 'Política de reembolso',
  'footer.privacy': 'Política de privacidad',
  'media.label': 'Medios IA',
  'nav.workspace': 'Espacio de trabajo',
  'nav.dashboard': 'Panel',
  'nav.analytics': 'Analíticas',
  'nav.community': 'Comunidad',
  'nav.settings': 'Configuración',
  'download.app': 'Descargar app',
  'download.soon': 'Próximamente',
};

const fr: Dict = {
  ...en,
  'greeting.morning': 'Bonjour',
  'greeting.afternoon': 'Bon après-midi',
  'greeting.evening': 'Bonsoir',
  'greeting.night': 'Bonne nuit',
  'settings.language': 'Langue',
  'settings.save': 'Enregistrer',
  'pricing.fuel': 'Payez le carburant, pas les fonctionnalités',
  'footer.terms': 'Conditions d\'utilisation',
  'footer.refund': 'Politique de remboursement',
  'footer.privacy': 'Politique de confidentialité',
  'media.label': 'Médias IA',
  'nav.workspace': 'Espace de travail',
  'nav.dashboard': 'Tableau de bord',
  'nav.analytics': 'Analytique',
  'nav.community': 'Communauté',
  'nav.settings': 'Paramètres',
  'download.app': 'Télécharger l\'app',
  'download.soon': 'Bientôt',
};

const de: Dict = {
  ...en,
  'greeting.morning': 'Guten Morgen',
  'greeting.afternoon': 'Guten Tag',
  'greeting.evening': 'Guten Abend',
  'greeting.night': 'Gute Nacht',
  'settings.language': 'Sprache',
  'settings.save': 'Speichern',
  'pricing.fuel': 'Zahle für Treibstoff, nicht für Funktionen',
  'footer.terms': 'Nutzungsbedingungen',
  'footer.refund': 'Rückerstattungsrichtlinie',
  'footer.privacy': 'Datenschutzrichtlinie',
  'media.label': 'KI-Medien',
  'nav.workspace': 'Arbeitsbereich',
  'nav.dashboard': 'Dashboard',
  'nav.analytics': 'Analysen',
  'nav.community': 'Community',
  'nav.settings': 'Einstellungen',
  'download.app': 'App herunterladen',
  'download.soon': 'Demnächst',
};

const zh: Dict = {
  ...en,
  'greeting.morning': '早上好',
  'greeting.afternoon': '下午好',
  'greeting.evening': '晚上好',
  'greeting.night': '晚安',
  'settings.language': '语言',
  'settings.save': '保存更改',
  'pricing.fuel': '按用量付费，而非功能',
  'footer.terms': '服务条款',
  'footer.refund': '退款政策',
  'footer.privacy': '隐私政策',
  'media.label': 'AI 媒体',
  'nav.workspace': '工作区',
  'nav.dashboard': '仪表板',
  'nav.analytics': '分析',
  'nav.community': '社区',
  'nav.settings': '设置',
  'download.app': '下载应用',
  'download.soon': '即将推出',
};

const hi: Dict = {
  ...en,
  'greeting.morning': 'सुप्रभात',
  'greeting.afternoon': 'नमस्कार',
  'greeting.evening': 'शुभ संध्या',
  'greeting.night': 'शुभ रात्रि',
  'settings.language': 'भाषा',
  'settings.save': 'सहेजें',
  'pricing.fuel': 'फीचर्स नहीं, ईंधन के लिए भुगतान',
  'footer.terms': 'सेवा की शर्तें',
  'footer.refund': 'धनवापसी नीति',
  'footer.privacy': 'गोपनीयता नीति',
  'media.label': 'AI मीडिया',
};

const MAP: Record<Locale, Dict> = { en, ur, hi, ar, es, fr, de, zh };

export function t(key: string, locale: Locale = 'en'): string {
  return MAP[locale]?.[key] ?? MAP.en[key] ?? key;
}

export function getTimeGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'greeting.morning';
  if (hour >= 12 && hour < 17) return 'greeting.afternoon';
  if (hour >= 17 && hour < 22) return 'greeting.evening';
  return 'greeting.night';
}

export function isValidLocale(code: string): code is Locale {
  return LOCALES.some((l) => l.code === code);
}
