/**
 * Detects the "New badge unlocked: …" post pattern (with exactly one
 * attached image) that the server creates when a user earns an achievement
 * tier. Mirrors `client/src/utils/directMessageShares.js#parseAchievementBadgePost`
 * so both clients render the same compact card with the badge thumbnail
 * sized correctly instead of a full-width hero image.
 */
export interface AchievementBadgePost {
  badgeName: string;
  supportingCopy: string;
  image: string;
}

export function parseAchievementBadgePost(
  content: unknown,
  images: string[] | null | undefined,
): AchievementBadgePost | null {
  if (!Array.isArray(images) || images.length !== 1) return null;
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const heading = lines[0].match(/^New badge unlocked:\s*(.+)$/i);
  if (!heading) return null;

  return {
    badgeName: heading[1].trim() || 'New badge',
    supportingCopy: lines.slice(1).join('\n\n').trim(),
    image: String(images[0] || '').trim(),
  };
}
