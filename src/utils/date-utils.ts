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

/**
 * Возвращает дату «сегодня» в указанном часовом поясе в формате YYYY-MM-DD.
 * @param timeZone IANA-часовой пояс (например Europe/Moscow).
 */
/**
 * Форматирует дату в формат "15 фев" (день + короткий месяц).
 * @param dateKey Дата в формате YYYY-MM-DD
 */
export function formatDateShort(dateKey: string): string {
  const date = new Date(dateKey);
  const day = date.getDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${day} ${months[date.getMonth()]}`;
}

export function getTodayKeyInTimezone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}