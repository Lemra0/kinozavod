import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { staffLookupTicket, staffUseTicket } from '../api/staff.js';
import { QrScanner } from './QrScanner.jsx';
import { formatLongDate, formatTime, hallNumber } from '../lib/format.js';
import styles from './StaffCheck.module.css';

// verdict → colour class + heading key
const VERDICT = {
  valid: { cls: 'ok', label: 'staff.check.valid' },
  admitted: { cls: 'ok', label: 'staff.check.admitted' },
  used: { cls: 'warn', label: 'staff.check.used' },
  refunded: { cls: 'bad', label: 'staff.check.refunded' },
  not_paid: { cls: 'bad', label: 'staff.check.notPaid' },
  not_found: { cls: 'bad', label: 'staff.check.notFound' },
  wrong_session: { cls: 'bad', label: 'staff.check.wrongSession' },
};

export function StaffCheckPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastCode = useRef(null);

  useEffect(() => {
    document.title = `${t('staff.nav.check')} · KINOZAVOD`;
  }, [t]);

  const check = useCallback(
    async (code) => {
      const clean = code.trim().toUpperCase();
      if (!clean || clean === lastCode.current) return;
      lastCode.current = clean;
      setBusy(true);
      try {
        const found = await staffLookupTicket(clean, lang);
        setResult(found);
      } catch {
        setResult({ verdict: 'not_found' });
      } finally {
        setBusy(false);
        // Allow re-scanning the same code after a short pause.
        setTimeout(() => {
          lastCode.current = null;
        }, 2500);
      }
    },
    [lang],
  );

  const admit = async () => {
    if (!result?.ticket) return;
    setBusy(true);
    try {
      const admitted = await staffUseTicket(result.ticket.code);
      setResult(admitted);
    } catch (err) {
      if (err.code === 'ALREADY_USED') {
        setResult({ verdict: 'used', ticket: { ...result.ticket, status: 'used' } });
      } else {
        // e.g. check-in not open yet — keep the ticket shown, surface the reason.
        setResult({ ...result, admitError: err });
      }
    } finally {
      setBusy(false);
    }
  };

  const verdict = result ? (VERDICT[result.verdict] ?? VERDICT.not_found) : null;
  const ticket = result?.ticket;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('staff.check.title')}</h1>

      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.scanToggle}>
            <button type="button" className={styles.scanBtn} onClick={() => setScanOn((v) => !v)}>
              {scanOn ? t('staff.check.stopCamera') : t('staff.check.startCamera')}
            </button>
          </div>
          {scanOn && <QrScanner active={scanOn} onScan={check} />}

          <form
            className={styles.manual}
            onSubmit={(e) => {
              e.preventDefault();
              check(manual);
            }}
          >
            <label className={styles.manualLabel}>{t('staff.check.manual')}</label>
            <div className={styles.manualRow}>
              <input
                className={styles.manualInput}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="KZ-XXXX-XXXX"
                autoFocus
              />
              <button type="submit" className={styles.checkBtn} disabled={busy}>
                {t('staff.check.check')}
              </button>
            </div>
          </form>
        </div>

        <div className={styles.right}>
          {!result && <p className={styles.placeholder}>{t('staff.check.waiting')}</p>}
          {result && (
            <div className={`${styles.verdict} ${styles[verdict.cls]}`} aria-live="assertive">
              <h2 className={styles.verdictTitle}>{t(verdict.label)}</h2>
              {ticket && (
                <>
                  <p className={styles.vMovie}>{ticket.movieTitle}</p>
                  <div className={styles.vGrid}>
                    <div>
                      <span>{t('ticket.hall')}</span>
                      <b>{hallNumber(ticket.hallNameKey.replace('halls.p', ''))}</b>
                    </div>
                    <div>
                      <span>{t('ticket.row')}</span>
                      <b>{ticket.row}</b>
                    </div>
                    <div>
                      <span>{t('ticket.seat')}</span>
                      <b>{ticket.number}</b>
                    </div>
                    <div>
                      <span>{t('ticket.start')}</span>
                      <b>{formatTime(ticket.startTime, lang)}</b>
                    </div>
                  </div>
                  <p className={styles.vMeta}>
                    {formatLongDate(ticket.startTime.slice(0, 10), lang)} · {ticket.format}
                    {ticket.ageRating && ` · ${ticket.ageRating}`}
                  </p>
                  {ticket.buyerName && <p className={styles.vMeta}>{ticket.buyerName}</p>}
                  {ticket.ageRating && (
                    <p className={styles.vAge}>
                      {t('staff.check.ageCheck')}: {t(`staff.check.age.${ticket.ageCheck}`)}
                    </p>
                  )}
                  {result.verdict === 'used' && ticket.usedAt && (
                    <p className={styles.vMeta}>
                      {t('staff.check.usedAt', { time: formatTime(ticket.usedAt, lang) })}
                    </p>
                  )}
                  {result.verdict === 'valid' && (
                    <>
                      <button
                        type="button"
                        className={styles.admit}
                        onClick={admit}
                        disabled={busy}
                      >
                        {t('staff.check.admit')}
                      </button>
                      {result.admitError && (
                        <p className={styles.admitError} role="alert">
                          {t([`errors.${result.admitError.code}`, 'errors.generic'])}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
