import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import et from './locales/et.json';
import { resolveInitialLanguage, storeLanguage } from './language.js';

const initial = resolveInitialLanguage();

export const needsLanguageChoice = initial.needsChoice;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    et: { translation: et },
  },
  lng: initial.lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = initial.lang;

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

/** Changes the language and remembers the choice. */
export function chooseLanguage(lang) {
  storeLanguage(lang);
  return i18n.changeLanguage(lang);
}

export default i18n;
