export type Locale = 'en' | 'ur' | 'hi' | 'ar';

export const LOCALES: { code: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'Urdu', dir: 'rtl' },
  { code: 'hi', label: 'Hindi', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', dir: 'rtl' },
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
  'pricing.topup': 'Top Up Actions',
  'footer.terms': 'Terms of Service',
  'footer.refund': 'Refund Policy',
  'footer.privacy': 'Privacy Policy',
  'deploy.title': 'Deploy & Domains',
  'media.label': 'AI Media',
  'checkout.methods': 'Cards · PayPal · Google Pay · UPI via Paddle',
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
};

const MAP: Record<Locale, Dict> = { en, ur, hi, ar };

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
