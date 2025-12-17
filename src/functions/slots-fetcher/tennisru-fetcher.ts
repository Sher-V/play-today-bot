import { TennisRuConfig } from '../../constants/slots-constants';

// Типы для слотов
interface Slot {
  time: string;
  dateTime: string;
  duration: number;
  price: number | null;
  roomName: string | null;
}

// Результат для каждой площадки
interface SiteSlots {
  [date: string]: Slot[];
}

/**
 * Интерфейс ответа Tennis.ru API
 */
interface TennisRuRentInfo {
  startTime: string;      // "2025-12-19T07:00:00"
  finishTime: string;     // "2025-12-19T08:00:00"
  busy: boolean;
  busyWithYou: boolean;
  price: number;
}

interface TennisRuCourtSchedule {
  courtId: string;
  rentInfo: TennisRuRentInfo[];
}

interface TennisRuResponse {
  result: boolean;
  schedule: TennisRuCourtSchedule[];
}

/**
 * Форматирует дату для Tennis.ru API (YYYY-MM-DDTHH:mm:ss без timezone)
 */
function formatDateForTennisRu(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  // Устанавливаем время в 00:00:00
  date.setHours(0, 0, 0, 0);
  
  // Форматируем вручную без timezone offset (API ожидает формат YYYY-MM-DDTHH:mm:ss)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Делает запрос к Tennis.ru API для одного дня
 */
async function fetchTennisRuDay(config: TennisRuConfig, dateStr: string): Promise<TennisRuCourtSchedule[]> {
  const url = `https://prilt.tennis.ru/Tennis_rf/hs/mobileapp/DailySchedule/${config.clubId}/${dateStr}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${config.authToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Tennis.ru HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as TennisRuResponse;
  
  if (!data.result || !data.schedule || data.schedule.length === 0) {
    return [];
  }

  return data.schedule;
}

/**
 * Извлекает свободные слоты из ответа Tennis.ru API
 */
function extractTennisRuFreeSlots(schedule: TennisRuCourtSchedule[], config: TennisRuConfig): SiteSlots {
  const result: SiteSlots = {};

  // Фильтруем корты по списку courtIds, если он задан
  const filteredSchedule = config.courtIds && config.courtIds.length > 0
    ? schedule.filter(courtSchedule => config.courtIds!.includes(courtSchedule.courtId))
    : schedule;

  for (const courtSchedule of filteredSchedule) {
    const courtName = config.courtNames?.[courtSchedule.courtId] || null;

    if (!courtSchedule.rentInfo || courtSchedule.rentInfo.length === 0) {
      continue;
    }

    for (const rentInfo of courtSchedule.rentInfo) {
      // Пропускаем занятые слоты
      if (rentInfo.busy) {
        continue;
      }

      // Парсим дату и время из startTime (формат: "2025-12-19T07:00:00")
      const startDate = new Date(rentInfo.startTime);
      const finishDate = new Date(rentInfo.finishTime);
      
      // Проверяем, что даты валидны
      if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
        continue;
      }
      
      // Вычисляем длительность в минутах
      const durationMs = finishDate.getTime() - startDate.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      // Форматируем дату (YYYY-MM-DD) и время (HH:MM)
      const dateStr = startDate.toISOString().split('T')[0];
      const timeStr = startDate.toISOString().split('T')[1].substring(0, 5);
      const dateTimeStr = `${dateStr} ${timeStr}`;

      const slot: Slot = {
        time: timeStr,
        dateTime: dateTimeStr,
        duration: durationMinutes,
        price: rentInfo.price,
        roomName: courtName
      };

      if (!result[dateStr]) {
        result[dateStr] = [];
      }
      result[dateStr].push(slot);
    }
  }

  // Сортируем слоты по времени внутри каждой даты
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }

  return result;
}

/**
 * Делает запросы к Tennis.ru API для всех дней
 */
export async function fetchTennisRuSlotsForSite(config: TennisRuConfig): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;
  
  for (let i = 0; i < daysAhead; i++) {
    const dateStr = formatDateForTennisRu(i);
    const dateKey = dateStr.split('T')[0];
    try {
      const schedule = await fetchTennisRuDay(config, dateStr);
      const daySlots = extractTennisRuFreeSlots(schedule, config);
      
      // Объединяем слоты для этой даты
      for (const [date, slots] of Object.entries(daySlots)) {
        if (!result[date]) {
          result[date] = [];
        }
        result[date].push(...slots);
      }
      
      // Выводим информацию о количестве слотов для этого дня
      if (daySlots[dateKey] && daySlots[dateKey].length > 0) {
        console.log(`  📅 ${dateKey}: ${daySlots[dateKey].length} слотов`);
      }
      
      // Задержка между запросами
      if (i < daysAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching Tennis.ru day ${dateStr} for ${config.name}:`, error);
    }
  }
  
  // Сортируем слоты по времени внутри каждой даты (на случай если были объединены)
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }
  
  return result;
}

