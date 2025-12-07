/**
 * Генерирует timestamp для начала дня
 * @param daysFromNow - количество дней от текущей даты (0 = сегодня, 1 = завтра, и т.д.)
 * @returns Unix timestamp в секундах для начала указанного дня
 */
export function getDayTimestamp(daysFromNow: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

