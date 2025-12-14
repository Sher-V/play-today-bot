import { COURT_PRICING, WorkingHours } from '../constants/pricing-config';
import { getMoscowHour, isWeekend } from './date-utils';

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
 * @returns Цена за час в рублях или null, если конфигурация не найдена
 */
export function getCourtPrice(
  siteId: string,
  dateTime: string | Date
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
      return range.price;
    }
  }

  // Если не нашли подходящий диапазон, возвращаем null
  return null;
}

