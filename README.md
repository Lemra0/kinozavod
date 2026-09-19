# KINOZAVOD

A full-featured cinema web application with online ticket booking, user accounts, cashier tools, and an admin panel.

Supports **English, Russian, and Estonian**, dark/light themes, and real-time seat updates.

## Features

### Customer

* Movie schedule with search, filters, and sorting.
* Movie catalog with details, ratings, genres, trailers, and showtimes.
* Interactive seating with standard, VIP, and two-person sofa seats.
* Automatic seat selection and temporary seat reservations.
* Demo payments and electronic QR tickets.
* Ticket refunds and calendar export.
* User accounts, avatars, order history, favorites, and watchlist.
* Movie reviews with ratings, spoiler tags, and profanity filtering.
* Age verification for restricted movies.

### Cashier

* In-person ticket sales.
* Real-time seat selection.
* Cash and card payments.
* Ticket printing in 80 mm and A4 formats.
* QR ticket scanning and validation.
* Order search, refunds, and shift summaries.

### Admin

* Movie and showtime management.
* Import and update movies through TMDB.
* Individual and bulk showtime creation.
* Pricing and discount management.
* User and role management.
* Review moderation.
* Multilingual profanity filter.

## Tech Stack

**Frontend**

* React + Vite
* React Router
* TanStack Query
* CSS Modules
* i18next
* SVG
* html5-qrcode

**Backend**

* Node.js + Express
* SQLite + better-sqlite3
* Socket.IO
* Zod
* bcrypt
* Sharp
* QRCode

**Development**

* Vitest
* ESLint
* Prettier
* GitHub Actions

SQLite is created automatically, so no separate database setup is required.

## Quick Start

### Requirements

* Node.js **22.12+**
* Git
* Windows or Linux

```bash
git clone https://github.com/OWNER/REPO.git kinozavod
cd kinozavod
npm install
```

Create `.env` from the example:

**Windows:**

```powershell
Copy-Item .env.example .env
```

**Linux/macOS:**

```bash
cp .env.example .env
```

Start the application:

```bash
npm run dev
```

* Frontend: `http://localhost:5173`
* API: `http://localhost:3001/api/health`

The first launch automatically creates the database, cinema halls, movies, and several weeks of showtimes.

## Demo Mode

Set the following in `.env`:

```env
DEMO_MODE=true
```

This enables one-click login for all available roles.

| Role     | Available features                                |
| -------- | ------------------------------------------------- |
| Customer | Booking, tickets, reviews, profile, order history |
| Cashier  | Sales, ticket printing, QR validation             |
| Admin    | Movies, showtimes, pricing, users, moderation     |

Demo accounts and sample data are created automatically.

## TMDB Integration

Without an API key, the application uses demo movies.

To use real movie data, add your TMDB API key to `.env`:

```env
TMDB_API_KEY=your_api_key
```

Then rebuild the catalog:

```bash
npm run db:reset
npm run seed
```

The `.env` file is already included in `.gitignore. Never commit your API key to the repository.

## Commands

| Command              | Description               |
| -------------------- | ------------------------- |
| `npm run dev`        | Start frontend and API    |
| `npm test`           | Run tests                 |
| `npm run lint`       | Run ESLint                |
| `npm run format`     | Format code               |
| `npm run build`      | Build the application     |
| `npm run seed`       | Seed movies and demo data |
| `npm run demo:reset` | Reset demo accounts       |
| `npm run migrate`    | Run database migrations   |
| `npm run db:reset`   | Reset the database        |

## Project Structure

```text
client/   React application, cashier, and admin panel
server/   Express API and SQLite migrations
shared/   Shared constants and business logic
```

## Testing

```bash
npm test
```

Tests cover scheduling, pricing, ticket sales and refunds, user accounts and permissions, cashier operations, administration, reviews, profanity filtering, and real-time seat updates.

## Limitations

Some features were intentionally simplified for the scope of the portfolio project:

* Real email delivery is not configured.
* Cinema hall layouts cannot be edited visually.
* Payments are simulated.

## TMDB Notice

This project uses the TMDB API but is **not endorsed or certified by TMDB**.

> This product uses the TMDB API but is not endorsed or certified by TMDB.
