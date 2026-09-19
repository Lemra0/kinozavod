import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Poster } from './Poster.jsx';
import { formatReleaseDate } from '../lib/format.js';
import styles from './SoonList.module.css';

export function SoonList({ movies }) {
  const { i18n } = useTranslation();
  return (
    <ul className={styles.grid}>
      {movies.map((movie) => (
        <li key={movie.id}>
          <Link to={`/movies/${movie.id}`} className={styles.item}>
            <Poster src={movie.posterUrl} />
            <span className={styles.title}>{movie.title}</span>
            <span className={styles.date}>
              {formatReleaseDate(movie.rentalStart, i18n.language)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
