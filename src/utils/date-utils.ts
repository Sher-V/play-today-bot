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

/**
 * Определяет, является ли день выходным (суббота или воскресенье) в московском времени
 */
export function isWeekend(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Используем Intl для получения дня недели в московском часовом поясе
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    weekday: 'short'
  });
  const weekday = formatter.format(dateObj);
  
  // 'Sat' = суббота, 'Sun' = воскресенье
  return weekday === 'Sat' || weekday === 'Sun';
}

/**
 * Получает час в московском времени из даты
 */
export function getMoscowHour(date: Date | string): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Используем Intl для получения часа в московском часовом поясе
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hour12: false
  });
  return parseInt(formatter.format(dateObj), 10);
}

