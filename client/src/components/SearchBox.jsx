import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchSuggest } from '../api/queries.js';
import { formatTime } from '../lib/format.js';
import styles from './SearchBox.module.css';

/** Quick search in the header: type-ahead suggestions, keyboard navigation. */
export function SearchBox() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      const clear = setTimeout(() => setItems([]), 0);
      return () => clearTimeout(clear);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggest(term, i18n.language, controller.signal)
        .then((data) => {
          setItems(data.movies);
          setActive(-1);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setItems([]);
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, i18n.language]);

  useEffect(() => {
    const onClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const goToSearch = () => {
    const term = query.trim();
    setOpen(false);
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  const openMovie = (id) => {
    setOpen(false);
    setQuery('');
    navigate(`/movies/${id}`);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      if (active >= 0 && items[active]) openMovie(items[active].id);
      else goToSearch();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.box} ref={boxRef}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className={styles.input}
        placeholder={t('search.placeholder')}
        aria-label={t('nav.search')}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 && (
        <ul className={styles.list} id={listId} role="listbox">
          {items.map((movie, index) => (
            <li key={movie.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`${styles.item} ${index === active ? styles.itemActive : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => openMovie(movie.id)}
              >
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt="" className={styles.poster} loading="lazy" />
                ) : (
                  <span className={styles.posterEmpty} aria-hidden="true" />
                )}
                <span className={styles.info}>
                  <span className={styles.title}>{movie.title}</span>
                  <span className={styles.meta}>
                    {movie.soon
                      ? t('movies.soon')
                      : movie.nextSession
                        ? t('search.next', {
                            time: formatTime(movie.nextSession.startTime, i18n.language),
                          })
                        : movie.year}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={styles.all} onClick={goToSearch}>
              {t('search.showAll')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
