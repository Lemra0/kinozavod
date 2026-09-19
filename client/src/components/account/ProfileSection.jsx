import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@kinozavod/shared';
import { useAuth } from '../../auth/context.js';
import { useSearchFilters } from '../../api/queries.js';
import {
  changePasswordRequest,
  deleteAccountRequest,
  deleteAvatarRequest,
  setGenresRequest,
  updateProfileRequest,
  uploadAvatarRequest,
} from '../../api/auth.js';
import { chooseLanguage } from '../../i18n/index.js';
import { LANGUAGE_NAMES } from '../../i18n/languageNames.js';
import { Button } from '../Button.jsx';
import styles from './Sections.module.css';

/**
 * Account profile: a compact header (avatar + nickname + a gear button),
 * with all editing gathered into a single settings dialog.
 */
export function ProfileSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);

  return (
    <div className={styles.profile}>
      <div className={styles.profileHead}>
        <img
          className={styles.profileAvatar}
          src={`/api/users/${user.id}/avatar?v=${avatarBust}`}
          alt={t('account.avatarOf', { name: user.nickname })}
        />
        <div className={styles.profileName}>
          <span className={styles.profileNick}>{user.nickname}</span>
          <span className={styles.profileEmail}>{user.email}</span>
        </div>
        <button
          type="button"
          className={styles.gear}
          onClick={() => setOpen(true)}
          aria-label={t('account.settings')}
          title={t('account.settings')}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>

      {open && (
        <SettingsDialog
          onClose={() => setOpen(false)}
          onAvatarChanged={() => setAvatarBust(Date.now())}
        />
      )}
    </div>
  );
}

/** One dialog with every profile setting, grouped into sections. */
function SettingsDialog({ onClose, onAvatarChanged }) {
  const { t, i18n } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const { data: filters } = useSearchFilters();
  const fileInput = useRef(null);

  const [profile, setProfile] = useState({
    nickname: user.nickname,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  const [genres, setGenres] = useState(user.genres);
  const [avatarV, setAvatarV] = useState(0);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const flash = (key) => {
    setMsg(key);
    setError(null);
    setTimeout(() => setMsg(null), 2500);
  };
  const fail = (err) => setError(err);

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const patch = {};
      if (profile.nickname !== user.nickname) patch.nickname = profile.nickname;
      if (profile.firstName !== user.firstName) patch.firstName = profile.firstName;
      if (profile.lastName !== user.lastName) patch.lastName = profile.lastName;
      const { user: updated } = await updateProfileRequest(patch);
      setUser(updated);
      flash('account.saved');
    } catch (err) {
      fail(err);
    }
  };

  const toggleGenre = async (id) => {
    const next = genres.includes(id) ? genres.filter((g) => g !== id) : [...genres, id];
    setGenres(next);
    try {
      await setGenresRequest(next);
      setUser({ ...user, genres: next });
    } catch (err) {
      fail(err);
    }
  };

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAvatarRequest(file);
      setUser({ ...user, hasCustomAvatar: true });
      setAvatarV(Date.now());
      onAvatarChanged();
      flash('account.avatarSaved');
    } catch (err) {
      fail(err);
    }
  };

  const removeAvatar = async () => {
    try {
      await deleteAvatarRequest();
      setUser({ ...user, hasCustomAvatar: false });
      setAvatarV(Date.now());
      onAvatarChanged();
    } catch (err) {
      fail(err);
    }
  };

  const changeLocale = async (locale) => {
    chooseLanguage(locale);
    try {
      const { user: updated } = await updateProfileRequest({ locale });
      setUser(updated);
    } catch (err) {
      fail(err);
    }
  };

  const toggleProfanity = async () => {
    try {
      const { user: updated } = await updateProfileRequest({ showProfanity: !user.showProfanity });
      setUser(updated);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className={styles.modalBack} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('account.settings')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{t('account.settings')}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {/* Avatar */}
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('account.avatar')}</h3>
          <div className={styles.avatarRow}>
            <img
              className={styles.avatar}
              src={`/api/users/${user.id}/avatar?v=${avatarV}`}
              alt={t('account.avatarOf', { name: user.nickname })}
            />
            <div className={styles.avatarActions}>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onAvatar}
              />
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                {t('account.uploadAvatar')}
              </Button>
              {user.hasCustomAvatar && (
                <Button variant="ghost" onClick={removeAvatar}>
                  {t('account.removeAvatar')}
                </Button>
              )}
              <p className={styles.hint}>{t('account.avatarHint')}</p>
            </div>
          </div>
        </section>

        {/* Profile */}
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('account.profile')}</h3>
          <form className={styles.form} onSubmit={saveProfile}>
            <label className={styles.field}>
              <span>{t('auth.nickname')}</span>
              <input
                value={profile.nickname}
                minLength={3}
                maxLength={20}
                onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
              />
              <small className={styles.hint}>{t('account.nicknamePublic')}</small>
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>{t('checkout.firstName')}</span>
                <input
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>{t('checkout.lastName')}</span>
                <input
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span>{t('auth.birthDate')}</span>
              <input value={user.birthDate} disabled />
              <small className={styles.hint}>{t('account.birthDateLocked')}</small>
            </label>
            <Button variant="primary" type="submit">
              {t('account.save')}
            </Button>
          </form>
        </section>

        {/* Favourite genres */}
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('account.favouriteGenres')}</h3>
          <div className={styles.chips}>
            {(filters?.genres ?? []).map((genre) => (
              <button
                key={genre.id}
                type="button"
                className={styles.chip}
                aria-pressed={genres.includes(genre.id)}
                onClick={() => toggleGenre(genre.id)}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </section>

        {/* Preferences */}
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('account.preferences')}</h3>
          <div className={styles.field}>
            <span>{t('language.label')}</span>
            <div className={styles.chips}>
              {LOCALES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={styles.chip}
                  aria-pressed={i18n.language === lang}
                  onClick={() => changeLocale(lang)}
                >
                  {LANGUAGE_NAMES[lang]}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={!user.showProfanity} onChange={toggleProfanity} />
            {t('account.hideProfanity')}
          </label>
        </section>

        {/* Password */}
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>{t('account.password')}</h3>
          <PasswordForm onDone={() => flash('account.passwordChanged')} onError={fail} />
        </section>

        {/* Danger zone */}
        <section className={`${styles.group} ${styles.danger}`}>
          <h3 className={styles.groupTitle}>{t('account.dangerZone')}</h3>
          <DeleteAccount onDeleted={logout} onError={fail} />
        </section>

        {msg && (
          <p className={styles.flash} role="status">
            {t(msg)}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {t([`errors.${error.code}`, 'errors.generic'], error.details ?? {})}
          </p>
        )}
      </div>
    </div>
  );
}

function PasswordForm({ onDone, onError }) {
  const { t } = useTranslation();
  const [data, setData] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await changePasswordRequest(data);
      setData({ currentPassword: '', newPassword: '' });
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>{t('account.currentPassword')}</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={data.currentPassword}
          onChange={(e) => setData({ ...data, currentPassword: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{t('account.newPassword')}</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={data.newPassword}
          onChange={(e) => setData({ ...data, newPassword: e.target.value })}
        />
      </label>
      <Button variant="secondary" type="submit" disabled={busy}>
        {t('account.changePassword')}
      </Button>
    </form>
  );
}

function DeleteAccount({ onDeleted, onError }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const del = async () => {
    try {
      await deleteAccountRequest();
      onDeleted();
    } catch (err) {
      onError(err);
    }
  };
  return confirming ? (
    <div className={styles.confirm}>
      <p>{t('account.deleteConfirm')}</p>
      <div className={styles.confirmButtons}>
        <Button variant="secondary" onClick={del}>
          {t('account.deleteYes')}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="ghost" onClick={() => setConfirming(true)}>
      {t('account.deleteAccount')}
    </Button>
  );
}
