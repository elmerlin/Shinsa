/**
 * Profile metadata helpers — country flag emoji + gender symbol + age + skill
 * color, mirroring the web's `PlayerRegistration.jsx` exports.
 */

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0);

/**
 * Convert a 2-letter ISO country code to its emoji flag. Computed from the
 * regional-indicator code points so we don't have to ship a 250-entry table.
 */
export function getCountryFlag(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(
    REGIONAL_INDICATOR_OFFSET + c.charCodeAt(0),
    REGIONAL_INDICATOR_OFFSET + c.charCodeAt(1),
  );
}

export const GENDER_SYMBOLS: Record<string, string> = {
  male: '♂',
  female: '♀',
};

export function getGenderSymbol(gender: string | null | undefined): string {
  return gender ? GENDER_SYMBOLS[String(gender).toLowerCase()] || '' : '';
}

/** Calculate display age from a YYYY-MM-DD date_of_birth string. */
export function getAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/** "Joined Mar 2025" — short, friendly. */
export function formatMemberSince(input: string | null | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `Joined ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}
