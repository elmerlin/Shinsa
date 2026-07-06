// The official "Shinsa" system account authors weekly-challenge recaps and
// announcements. Its stored username is an internal handle (`__shinsa__`);
// everywhere it's shown to a player it should read simply as "Shinsa".

export const SYSTEM_USERNAME = '__shinsa__';
export const SYSTEM_DISPLAY_NAME = 'Shinsa';

export function isSystemUsername(username?: string | null): boolean {
  return username === SYSTEM_USERNAME;
}

/** Display label for an author username — maps the system handle to "Shinsa". */
export function displayUsername(username?: string | null): string {
  return isSystemUsername(username) ? SYSTEM_DISPLAY_NAME : (username || '');
}
