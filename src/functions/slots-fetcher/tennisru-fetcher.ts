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
 * Использует московское время (UTC+3)
 */
function formatDateForTennisRu(daysFromNow: number): string {
  const now = new Date();
  
  // Используем Intl.DateTimeFormat для работы с московским временем
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Получаем текущую дату в московском времени
  const todayMoscow = formatter.format(now);
  const [year, month, day] = todayMoscow.split('-').map(Number);
  
  // Создаем дату в московском времени (интерпретируем строку как UTC+3)
  const moscowMidnight = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+03:00`);
  
  // Добавляем дни, работая с UTC timestamp
  const targetTimestamp = moscowMidnight.getTime() + daysFromNow * 24 * 60 * 60 * 1000;
  const targetDate = new Date(targetTimestamp);
  
  // Форматируем результат в московском времени
  const resultDate = formatter.format(targetDate);
  
  return `${resultDate}T00:00:00`;
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
      // API возвращает время в московском времени, добавляем +03:00 для корректной интерпретации
      const startTimeWithTz = rentInfo.startTime + '+03:00';
      const finishTimeWithTz = rentInfo.finishTime + '+03:00';
      
      const startDate = new Date(startTimeWithTz);
      const finishDate = new Date(finishTimeWithTz);
      
      // Проверяем, что даты валидны
      if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
        continue;
      }
      
      // Вычисляем длительность в минутах
      const durationMs = finishDate.getTime() - startDate.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      // Форматируем дату и время в московском времени для вывода
      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
      const timeStr = startDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
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

