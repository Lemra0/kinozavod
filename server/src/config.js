import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => ['true', '1', 'yes'].includes(value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  DATABASE_PATH: z.string().min(1).default('data/kinozavod.db'),
  DEMO_MODE: booleanFromEnv.default(true),
  TMDB_API_KEY: z.string().optional().default(''),
  SESSION_SECRET: z.string().min(1).default('dev-only-secret'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = Object.freeze({
  env: env.NODE_ENV,
  port: env.PORT,
  clientUrl: env.CLIENT_URL,
  databasePath: path.resolve(serverRoot, env.DATABASE_PATH),
  demoMode: env.DEMO_MODE,
  tmdbApiKey: env.TMDB_API_KEY.trim(),
  sessionSecret: env.SESSION_SECRET,
  paths: { serverRoot, projectRoot },
});

if (config.env === 'production' && config.sessionSecret === 'dev-only-secret') {
  console.error('SESSION_SECRET must be set in production.');
  process.exit(1);
}
