import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context.js';
import { addWatchlistRequest, myWatchlistRequest, removeWatchlistRequest } from '../api/auth.js';
import { Button } from './Button.jsx';

/** "Want to watch" toggle. Signed-in only; sends guests to login. */
export function WatchButton({ movieId }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inList, setInList] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    myWatchlistRequest(i18n.language)
      .then((r) => active && setInList(r.movies.some((m) => m.id === movieId)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, movieId, i18n.language]);

  const toggle = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/movies/${movieId}`)}`);
      return;
    }
    setBusy(true);
    const next = !inList;
    setInList(next); // optimistic
    try {
      if (next) await addWatchlistRequest(movieId);
      else await removeWatchlistRequest(movieId);
    } catch {
      setInList(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={inList ? 'primary' : 'secondary'} onClick={toggle} disabled={busy}>
      {inList ? t('movie.inWatchlist') : t('movie.wantToWatch')}
    </Button>
  );
}
