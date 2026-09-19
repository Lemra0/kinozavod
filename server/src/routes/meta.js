import { Router } from 'express';
import { CINEMA, LOCALES, RULES } from '@kinozavod/shared';
import { getPriceSettings } from '../settings.js';
import { getCatalogInfo } from '../modules/catalog.js';
import { meView } from '../modules/profile.js';

/** General information the client needs on start-up. */
export function metaRouter({ db, config }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      cinema: CINEMA,
      locales: LOCALES,
      demoMode: config.demoMode,
      tmdbConfigured: Boolean(config.tmdbApiKey),
      catalog: getCatalogInfo(db),
      user: req.user ? meView(db, req.user) : null,
      wordFilter: db
        .prepare(
          "SELECT list, pattern, match_type AS matchType FROM word_filter WHERE list IN ('profanity','exception')",
        )
        .all(),
      prices: getPriceSettings(db),
      rules: {
        seatHoldMinutes: RULES.seatHoldMinutes,
        maxSeatsPerOrder: RULES.maxSeatsPerOrder,
        homeScheduleDays: RULES.homeScheduleDays,
        scheduleHorizonDays: RULES.scheduleHorizonDays,
      },
    });
  });

  return router;
}
