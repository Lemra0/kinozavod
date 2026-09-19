import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { RULES } from '@kinozavod/shared';

const PALETTE = ['#cf6430', '#5a9a8b', '#d9a520', '#b39352', '#2f6b5e', '#a3461c'];

/** Deterministic generated avatar: the first letter on a palette background. */
export function generatedAvatarSvg(nickname) {
  const letter = (nickname?.[0] ?? '?').toUpperCase();
  let hash = 0;
  for (const ch of nickname ?? '') hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const bg = PALETTE[Math.abs(hash) % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<rect width="256" height="256" fill="${bg}"/>
<text x="128" y="176" text-anchor="middle" font-family="'Big Shoulders Stencil Display','Oswald','Arial Narrow',sans-serif" font-weight="800" font-size="150" fill="#1b1a17">${letter}</text>
</svg>`;
}

/**
 * Crops an uploaded image to a square, resizes to 256px, saves as WebP.
 * Returns the stored relative path. Throws on invalid images.
 */
export async function saveAvatar(buffer, uploadsDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.webp`;
  const filePath = path.join(uploadsDir, name);
  await sharp(buffer)
    .resize(RULES.avatarSize, RULES.avatarSize, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(filePath);
  return name;
}

export function deleteAvatar(name, uploadsDir) {
  if (!name) return;
  fs.rmSync(path.join(uploadsDir, name), { force: true });
}
