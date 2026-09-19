import { FALLBACK_LOCALE, LOCALES } from '@kinozavod/shared';

const STORAGE_KEY = 'kz-lang';

export function getStoredLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be unavailable (private mode). The choice then lasts for this visit only.
  }
}

/** Returns the first supported language from the browser settings, or null. */
export function detectBrowserLanguage() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const base = String(tag || '')
      .toLowerCase()
      .split('-')[0];
    if (LOCALES.includes(base)) return base;
  }
  return null;
}

/**
 * Decides the starting language.
 * `needsChoice` is true when neither a stored choice nor a supported browser
 * language exists — then the first-visit language dialog is shown.
 */
export function resolveInitialLanguage() {
  const stored = getStoredLanguage();
  if (stored) return { lang: stored, needsChoice: false };

  const detected = detectBrowserLanguage();
  if (detected) return { lang: detected, needsChoice: false };

  return { lang: FALLBACK_LOCALE, needsChoice: true };
}
