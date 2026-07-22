import i18next from 'i18next';

// 31 Supported Languages Scope
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'es', label: 'Español - España (Spanish - Spain)' },
  { code: 'ar', label: 'العربية (Arabic)' },
  { code: 'bg', label: 'Български (Bulgarian)' },
  { code: 'cs', label: 'Čeština (Czech)' },
  { code: 'da', label: 'Dansk (Danish)' },
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'fi', label: 'Suomi (Finnish)' },
  { code: 'el', label: 'Ελληνικά (Greek)' },
  { code: 'hu', label: 'Magyar (Hungarian)' },
  { code: 'id', label: 'Bahasa Indonesia (Indonesian)' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'ms', label: 'Bahasa Melayu (Malay)' },
  { code: 'no', label: 'Norsk (Norwegian)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'pt-BR', label: 'Português - Brasil (Portuguese - Brazil)' },
  { code: 'pt-PT', label: 'Português - Portugal (Portuguese - Portugal)' },
  { code: 'ro', label: 'Română (Romanian)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
  { code: 'es-419', label: 'Español - Latinoamérica (Spanish - Latin America)' },
  { code: 'sv', label: 'Svenska (Swedish)' },
  { code: 'th', label: 'ไทย (Thai)' },
  { code: 'zh-TW', label: '繁體中文 (Traditional Chinese)' },
  { code: 'tr', label: 'Türkçe (Turkish)' },
  { code: 'uk', label: 'Українська (Ukrainian)' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)' }
];

// Helper to detect initial user/system language
function detectSystemLanguage() {
  const navLang = navigator.language || 'en';
  if (navLang.startsWith('zh-TW') || navLang.startsWith('zh-HK') || navLang.startsWith('zh-MO')) return 'zh-TW';
  if (navLang.startsWith('zh')) return 'zh-CN';
  if (navLang.startsWith('ja')) return 'ja';
  if (navLang.startsWith('ko')) return 'ko';
  if (navLang.startsWith('pt-PT')) return 'pt-PT';
  if (navLang.startsWith('pt')) return 'pt-BR';
  if (navLang.startsWith('es-419') || navLang.includes('MX') || navLang.includes('AR') || navLang.includes('CO') || navLang.includes('CL')) return 'es-419';
  if (navLang.startsWith('es')) return 'es';
  if (navLang.startsWith('de')) return 'de';
  if (navLang.startsWith('fr')) return 'fr';
  if (navLang.startsWith('it')) return 'it';
  if (navLang.startsWith('ru')) return 'ru';
  if (navLang.startsWith('pl')) return 'pl';
  if (navLang.startsWith('tr')) return 'tr';
  if (navLang.startsWith('vi')) return 'vi';
  if (navLang.startsWith('ar')) return 'ar';
  if (navLang.startsWith('bg')) return 'bg';
  if (navLang.startsWith('cs')) return 'cs';
  if (navLang.startsWith('da')) return 'da';
  if (navLang.startsWith('nl')) return 'nl';
  if (navLang.startsWith('fi')) return 'fi';
  if (navLang.startsWith('el')) return 'el';
  if (navLang.startsWith('hu')) return 'hu';
  if (navLang.startsWith('id')) return 'id';
  if (navLang.startsWith('ms')) return 'ms';
  if (navLang.startsWith('no') || navLang.startsWith('nb') || navLang.startsWith('nn')) return 'no';
  if (navLang.startsWith('ro')) return 'ro';
  if (navLang.startsWith('sv')) return 'sv';
  if (navLang.startsWith('th')) return 'th';
  if (navLang.startsWith('uk')) return 'uk';
  return 'en';
}

let isInitialized = false;

/**
 * Loads JSON resource files for all 9 supported languages
 */
async function loadLanguageResources() {
  const resources = {};
  for (const langObj of SUPPORTED_LANGUAGES) {
    const code = langObj.code;
    try {
      const response = await fetch(`./locales/${code}/translation.json`);
      if (response.ok) {
        const json = await response.json();
        resources[code] = { translation: json };
      } else {
        console.warn(`[i18n] Failed to fetch translation file for ${code}: ${response.status}`);
      }
    } catch (err) {
      console.error(`[i18n] Error loading translation for ${code}:`, err);
    }
  }
  return resources;
}

/**
 * Initializes the i18next framework
 * @param {string} initialLanguage - Saved or requested language code
 */
export async function initI18n(initialLanguage = null) {
  if (isInitialized) return i18next;

  const targetLang = initialLanguage || detectSystemLanguage();
  const resources = await loadLanguageResources();

  await i18next.init({
    lng: targetLang,
    fallbackLng: 'en',
    debug: false,
    resources: resources,
    interpolation: {
      escapeValue: false // not needed for DOM updates
    }
  });

  isInitialized = true;
  updateDOMTranslations();

  console.log(`[i18n] i18next initialized successfully with active language: ${i18next.language}`);
  return i18next;
}

/**
 * Translate a key with optional dynamic placeholder parameters
 * @param {string} key 
 * @param {object} options 
 */
export function t(key, options = {}) {
  if (!isInitialized) return key;
  return i18next.t(key, options);
}

/**
 * Change the active language dynamically
 * @param {string} langCode 
 */
export async function changeLanguage(langCode) {
  if (!isInitialized) return;
  await i18next.changeLanguage(langCode);
  updateDOMTranslations();
  console.log(`[i18n] Active language switched to: ${langCode}`);
}

/**
 * Get current active language code
 */
export function getCurrentLanguage() {
  return isInitialized ? i18next.language : 'en';
}

/**
 * Scans DOM for data-i18n attributes and updates textContent / titles
 */
export function updateDOMTranslations() {
  if (!isInitialized) return;

  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    const translation = i18next.t(key);
    
    // Check if attribute specifically specifies title or placeholder
    if (el.hasAttribute('data-i18n-attr')) {
      const attr = el.getAttribute('data-i18n-attr');
      el.setAttribute(attr, translation);
    } else {
      // Direct text update while preserving HTML nodes if nested
      el.textContent = translation;
    }
  });

  // Also translate title attributes if specified with data-i18n-title
  const titleElements = document.querySelectorAll('[data-i18n-title]');
  titleElements.forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.setAttribute('title', i18next.t(key));
    }
  });
}
