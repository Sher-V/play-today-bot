/**
 * Список городов для выбора пользователем.
 * В профиле и в базе хранятся названия на русском как есть (Москва, Воронеж).
 */
export const CITIES = ['Москва', 'Воронеж'] as const;

/** ID пользователей, которым доступен выбор города (Ещё → Мой город и при /start). */
export const CITY_SELECTION_ALLOWED_USER_IDS: number[] = [500405387, 503391201];

export function canSelectCity(userId: number): boolean {
  return CITY_SELECTION_ALLOWED_USER_IDS.includes(userId);
}

/** Часовой пояс города (IANA). Москва и Воронеж — UTC+3 (Europe/Moscow). */
export const CITY_TIMEZONES: Record<string, string> = {
  Москва: 'Europe/Moscow',
  Воронеж: 'Europe/Moscow',
};

/** Часовой пояс по умолчанию (Москва). */
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

/** Смещение UTC+3 для Москвы и Воронежа (формат для парсинга дат). */
export const OFFSET_UTC3 = '+03:00';

export function getCityByIndex(index: number): string | undefined {
  return CITIES[index];
}

export function getCityIndex(cityName: string): number {
  const i = CITIES.indexOf(cityName as (typeof CITIES)[number]);
  return i >= 0 ? i : -1;
}

/**
 * Возвращает IANA-часовой пояс города (например Europe/Moscow).
 * Для Москвы и Воронежа — UTC+3.
 */
export function getTimezoneForCity(cityName: string | undefined): string {
  if (!cityName) return DEFAULT_TIMEZONE;
  const key = Object.keys(CITY_TIMEZONES).find(
    k => k.toLowerCase() === String(cityName).toLowerCase()
  );
  return key ? CITY_TIMEZONES[key]! : DEFAULT_TIMEZONE;
}

/**
 * Возвращает смещение для дат в формате +HH:mm (для Москвы и Воронежа — +03:00).
 */
export function getCityOffset(cityName: string | undefined): string {
  return OFFSET_UTC3;
}

/** Воронеж. */
export function isVoronezhCity(city: string | undefined): boolean {
  return city === 'Воронеж';
}

/** Москва. */
export function isMoscowCity(city: string | undefined): boolean {
  return city === 'Москва';
}
