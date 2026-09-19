import { addDays } from '@kinozavod/shared';
import { DEMO_MOVIES } from '../data/demoMovies.js';

export function demoMovieRecords(today) {
  return DEMO_MOVIES.map((m) => {
    const upcoming = m.releaseInDays > 0;
    const start = upcoming ? addDays(today, m.releaseInDays) : addDays(today, -7);
    return {
      source: 'demo',
      originalTitle: m.originalTitle,
      originalLanguage: 'en',
      durationMin: m.durationMin,
      ageRating: m.ageRating,
      releaseDate: start,
      rentalStart: start,
      rentalEnd: null,
      posterPath: `demo:${m.key}`,
      trailerKey: null,
      country: m.country,
      year: m.year,
      director: m.director,
      cast: m.cast,
      genres: m.genres,
      supports3d: m.supports3d,
      popularity: m.weight,
      translations: Object.fromEntries(
        ['en', 'ru', 'et'].map((l) => [l, { title: m.title[l], overview: m.overview[l] }]),
      ),
    };
  });
}

const escapeXml = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Generated poster in the site style: title, a stencil number and simple geometry. */
export function demoPosterSvg(key) {
  const movie = DEMO_MOVIES.find((m) => m.key === key);
  if (!movie) return null;

  const [bg, accent] = movie.palette;
  const h = hash(movie.key);
  const light = parseInt(bg.slice(1, 3), 16) > 160;
  const ink = light ? '#1b1a17' : '#e6e0d3';
  const words = movie.originalTitle.toUpperCase().split(' ');
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= 11) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const circleX = 60 + (h % 220);
  const circleY = 90 + ((h >> 8) % 160);
  const radius = 50 + ((h >> 16) % 70);

  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="24" y="${392 + i * 44 - (lines.length - 1) * 44}" font-size="42">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513" width="342" height="513">
<rect width="342" height="513" fill="${bg}"/>
<g opacity="0.08" stroke="${ink}">${Array.from({ length: 15 }, (_, i) => `<line x1="${i * 24}" y1="0" x2="${i * 24}" y2="513"/>`).join('')}</g>
<circle cx="${circleX}" cy="${circleY}" r="${radius}" fill="${accent}"/>
<rect x="0" y="${circleY + radius - 20}" width="342" height="6" fill="${ink}" opacity="0.6"/>
<g font-family="'Oswald','Arial Narrow',Arial,sans-serif" font-weight="600" fill="${ink}" letter-spacing="1">${titleSvg}</g>
<rect x="24" y="428" width="60" height="6" fill="${accent}"/>
<text x="24" y="470" font-family="'IBM Plex Sans',Arial,sans-serif" font-size="15" fill="${ink}" opacity="0.8">${escapeXml(movie.director)}</text>
<text x="24" y="492" font-family="'IBM Plex Sans',Arial,sans-serif" font-size="12" fill="${ink}" opacity="0.6">KINOZAVOD · DEMO</text>
</svg>`;
}
