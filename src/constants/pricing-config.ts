import { TennisSiteId } from './tennis-constants';

// Интерфейс для временного диапазона с ценой
export interface TimePriceRange {
  startHour: number;  // Начальный час (включительно)
  endHour: number;    // Конечный час (исключительно)
  price: number;      // Цена за час в рублях
}

// Интерфейс для часов работы корта
export interface WorkingHours {
  startHour: number;  // Начальный час работы (включительно)
  endHour: number;    // Конечный час работы (исключительно)
}

// Интерфейс для конфигурации цен корта
export interface CourtPricingConfig {
  weekday: TimePriceRange[];  // Цены для рабочих дней
  weekend: TimePriceRange[];  // Цены для выходных дней
  workingHours?: WorkingHours; // Часы работы корта (опционально)
}

// Конфигурация цен для кортов
export const COURT_PRICING: Record<string, CourtPricingConfig> = {
  [TennisSiteId.SPORTVSEGDA_YANTAR]: {
    weekday: [
      { startHour: 7, endHour: 16, price: 4000 },
      { startHour: 16, endHour: 22, price: 5000 },
      { startHour: 22, endHour: 23, price: 3600 },
      { startHour: 23, endHour: 24, price: 3000 },
    ],
    weekend: [
      { startHour: 7, endHour: 9, price: 3500 },
      { startHour: 9, endHour: 22, price: 5000 },
      { startHour: 22, endHour: 24, price: 3000 },
    ],
  },
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: {
    weekday: [
      { startHour: 6, endHour: 12, price: 4500 },
      { startHour: 12, endHour: 15, price: 3600 },
      { startHour: 15, endHour: 23, price: 5000 },
      { startHour: 23, endHour: 24, price: 4500 },
    ],
    weekend: [
      { startHour: 6, endHour: 24, price: 4500 },
    ],
  },
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: {
    weekday: [
      { startHour: 6, endHour: 12, price: 4500 },
      { startHour: 12, endHour: 15, price: 3600 },
      { startHour: 15, endHour: 23, price: 5000 },
      { startHour: 23, endHour: 24, price: 4500 },
    ],
    weekend: [
      { startHour: 6, endHour: 24, price: 4500 },
    ],
  },
  [TennisSiteId.OLONETSKIY]: {
    weekday: [
      { startHour: 7, endHour: 15, price: 3500 },
      { startHour: 15, endHour: 18, price: 3700 },
      { startHour: 18, endHour: 24, price: 4100 },
    ],
    weekend: [
      { startHour: 7, endHour: 9, price: 3700 },
      { startHour: 9, endHour: 21, price: 4100 },
      { startHour: 21, endHour: 24, price: 3700 },
    ],
    workingHours: { startHour: 7, endHour: 24 }, // Олонецкий работает с 7:00 до 00:00 (24:00)
  },
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: {
    weekday: [
      { startHour: 7, endHour: 23, price: 4000 },
    ],
    weekend: [
      { startHour: 7, endHour: 23, price: 4000 },
    ],
  },
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: {
    weekday: [
      { startHour: 7, endHour: 16, price: 2700 },
      { startHour: 16, endHour: 22, price: 3000 },
      { startHour: 22, endHour: 24, price: 2700 },
    ],
    weekend: [
      { startHour: 7, endHour: 9, price: 2700 },
      { startHour: 9, endHour: 20, price: 3000 },
      { startHour: 20, endHour: 24, price: 2700 },
    ],
  },
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: {
    weekday: [
      { startHour: 7, endHour: 24, price: 4800 },
    ],
    weekend: [
      { startHour: 7, endHour: 24, price: 4800 },
    ],
  },
  [TennisSiteId.SLICE_TENNIS]: {
    weekday: [
      { startHour: 6, endHour: 7, price: 1400 }, // Для 06:00 используем ту же цену, что и для 7-8
      { startHour: 7, endHour: 8, price: 1400 },
      { startHour: 8, endHour: 15, price: 2000 },
      { startHour: 15, endHour: 22, price: 3000 },
      { startHour: 22, endHour: 23, price: 2200 },
      { startHour: 23, endHour: 24, price: 2200 }, // Для 23:00 используем ту же цену, что и для 22-23
    ],
    weekend: [
      { startHour: 6, endHour: 7, price: 2000 }, // Для 06:00 используем ту же цену, что и для 7-9
      { startHour: 7, endHour: 9, price: 2000 },
      { startHour: 9, endHour: 19, price: 2800 },
      { startHour: 19, endHour: 23, price: 2200 },
      { startHour: 23, endHour: 24, price: 2200 }, // Для 23:00 используем ту же цену, что и для 19-23
    ],
    workingHours: { startHour: 7, endHour: 23 }, // Slice работает с 7 до 23
  },
  [TennisSiteId.MEGASPORT_TENNIS]: {
    weekday: [
      { startHour: 7, endHour: 9, price: 2500 },
      { startHour: 9, endHour: 15, price: 3000 },
      { startHour: 15, endHour: 22, price: 3900 },
      { startHour: 22, endHour: 23, price: 2500 },
    ],
    weekend: [
      { startHour: 7, endHour: 9, price: 2700 },
      { startHour: 9, endHour: 21, price: 3900 },
      { startHour: 21, endHour: 23, price: 2700 },
    ],
  },
  [TennisSiteId.GALLERY_CORT]: {
    weekday: [
      { startHour: 8, endHour: 9, price: 2500 },
      { startHour: 9, endHour: 17, price: 2800 },
      { startHour: 17, endHour: 22, price: 3500 },
      { startHour: 22, endHour: 23, price: 2900 },
    ],
    weekend: [
      { startHour: 8, endHour: 9, price: 2900 },
      { startHour: 9, endHour: 22, price: 3500 },
      { startHour: 22, endHour: 23, price: 2900 },
    ],
  },
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: {
    weekday: [
      { startHour: 6, endHour: 24, price: 3300 },
    ],
    weekend: [
      { startHour: 6, endHour: 24, price: 3300 },
    ],
  },
  [TennisSiteId.ITC_TSARITSYNO]: {
    weekday: [
      { startHour: 7, endHour: 15, price: 2000 },
      { startHour: 15, endHour: 18, price: 2300 },
      { startHour: 18, endHour: 21, price: 3000 },
      { startHour: 21, endHour: 23, price: 2700 },
      { startHour: 23, endHour: 24, price: 1900 },
    ],
    weekend: [
      { startHour: 7, endHour: 10, price: 2100 },
      { startHour: 10, endHour: 15, price: 2700 },
      { startHour: 15, endHour: 20, price: 2300 },
      { startHour: 20, endHour: 24, price: 2200 },
    ],
  },
  [TennisSiteId.ENERGIYA_STADIUM]: {
    weekday: [
      { startHour: 6, endHour: 11, price: 2600 },
      { startHour: 11, endHour: 17, price: 2600 },
      { startHour: 17, endHour: 24, price: 3200 }, // 17:30-24 соответствует 17-24 в системе по часам
    ],
    weekend: [
      { startHour: 6, endHour: 24, price: 2600 },
    ],
  },
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: {
    weekday: [
      { startHour: 7, endHour: 10, price: 2300 },
      { startHour: 10, endHour: 17, price: 2500 },
      { startHour: 17, endHour: 22, price: 3000 },
      { startHour: 22, endHour: 24, price: 3000 }, // Предположение: та же цена, что и 17-22
    ],
    weekend: [
      { startHour: 7, endHour: 24, price: 2700 },
    ],
    workingHours: { startHour: 7, endHour: 24 }, // Корт работает с 7:00 до 00:00 (24:00)
  },
  [TennisSiteId.TENNIS77_KURGANSKAYA]: {
    weekday: [
      { startHour: 7, endHour: 10, price: 2300 },
      { startHour: 10, endHour: 17, price: 2500 },
      { startHour: 17, endHour: 24, price: 3000 },
    ],
    weekend: [
      { startHour: 7, endHour: 24, price: 2700 },
    ],
    workingHours: { startHour: 7, endHour: 24 }, // Корт работает с 7:00 до 00:00 (24:00)
  },
  [TennisSiteId.LIGA_TENNIS]: {
    weekday: [
      { startHour: 7, endHour: 16, price: 3200 },
      { startHour: 16, endHour: 23, price: 3700 },
    ],
    weekend: [
      { startHour: 7, endHour: 23, price: 3700 },
    ],
    workingHours: { startHour: 7, endHour: 23 }, // Корт работает с 7:00 до 23:00
  },
  [TennisSiteId.TENNISTIME]: {
    weekday: [
      { startHour: 7, endHour: 8, price: 1900 },
      { startHour: 8, endHour: 14, price: 2700 },
      { startHour: 14, endHour: 22, price: 3200 },
      { startHour: 22, endHour: 24, price: 2700 },
    ],
    weekend: [
      { startHour: 7, endHour: 8, price: 1900 },
      { startHour: 8, endHour: 10, price: 2700 },
      { startHour: 10, endHour: 22, price: 3200 },
      { startHour: 22, endHour: 24, price: 2700 },
    ],
    workingHours: { startHour: 7, endHour: 24 }, // Корт работает с 7:00 до 00:00 (24:00)
  },
  [TennisSiteId.REZIDENCYA]: {
    weekday: [
      { startHour: 8, endHour: 22, price: 2600 },
      { startHour: 22, endHour: 23, price: 2200 },
    ],
    weekend: [
      { startHour: 8, endHour: 22, price: 2600 },
      { startHour: 22, endHour: 23, price: 2200 },
    ],
    workingHours: { startHour: 7, endHour: 23 }, // Корт работает с 7:00 до 23:00
  },
};



