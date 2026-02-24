import { COURT_PRICING, WorkingHours } from '../constants/pricing-config';
import { getMoscowHour, isWeekend } from './date-utils';

/**
 * Определяет, находится ли приложение в режиме разработки
 */
export const isDev = process.env.NODE_ENV === 'development';

/**
 * Базовый URL Mini App (подбор группы, создание/список тренировок).
 * Если не задан — используется продовый домен.
 * В .env задайте без завершающего слеша, например: https://play-today-miniapp-dev.web.app
 */
export function getMiniappBaseUrl(): string {
  const url = process.env.MINIAPP_BASE_URL || 'https://play-today-miniapp.web.app';
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Получает токен бота в зависимости от окружения
 * @returns Bot token или null если не найден
 */
export function getBotToken(): string | null {
  const token = isDev ? process.env.BOT_TOKEN_DEV : process.env.BOT_TOKEN;
  const tokenName = isDev ? 'BOT_TOKEN_DEV' : 'BOT_TOKEN';
  
  if (!token) {
    console.error(`[getBotToken] ${tokenName} not found in environment variables`);
    return null;
  }
  
  return token;
}

/**
 * Получает часы работы корта
 * @param siteId ID площадки
 * @returns Часы работы корта или null, если конфигурация не найдена или не указана
 */
export function getCourtWorkingHours(siteId: string): WorkingHours | null {
  const config = COURT_PRICING[siteId];
  if (!config || !config.workingHours) {
    return null;
  }
  return config.workingHours;
}

/**
 * Получает цену за час для указанного корта, даты и времени
 * @param siteId ID площадки
 * @param dateTime Дата и время слота (строка в формате ISO или Date объект)
 * @param duration Длительность слота в минутах (опционально). Если 30, цена делится на 2
 * @returns Цена в рублях или null, если конфигурация не найдена
 */
export function getCourtPrice(
  siteId: string,
  dateTime: string | Date,
  duration?: number
): number | null {
  const config = COURT_PRICING[siteId];
  if (!config) {
    return null;
  }

  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  const hour = getMoscowHour(date);
  const isWeekendDay = isWeekend(date);

  const ranges = isWeekendDay ? config.weekend : config.weekday;

  // Находим подходящий диапазон
  for (const range of ranges) {
    if (hour >= range.startHour && hour < range.endHour) {
      let price = range.price;
      // Если слот 30 минут, делим цену на 2 (цена в конфиге указана за 60 минут)
      if (duration === 30) {
        price = price / 2;
      }
      return price;
    }
  }

  // Если не нашли подходящий диапазон, возвращаем null
  return null;
}

