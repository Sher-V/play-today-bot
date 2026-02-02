/**
 * Список забаненных user ID — для них на кнопки показывается заглушка «Упс, что-то пошло не так».
 */
export const BANNED_USER_IDS = new Set<number>([
  309312962,
]);

export function isBannedUser(userId: number): boolean {
  return BANNED_USER_IDS.has(userId);
}
