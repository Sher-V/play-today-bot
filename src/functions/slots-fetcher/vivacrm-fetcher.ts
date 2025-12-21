import { VivaCrmConfig } from '../../constants/slots-constants';
import { formatDateForYClients } from './yclients-fetcher';

// Типы для слотов
export interface Slot {
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
 * Интерфейс ответа VivaCRM API
 */
interface VivaCrmSlot {
  timeFrom: string;       // "2025-12-04T07:00:00+03:00"
  timeTo: string;         // "2025-12-04T08:00:00+03:00"
  roomName: string;       // "13", "6", "8", etc.
  roomId: string;
  price: {
    from: number;
    to: number | null;
  };
  availableDuration: string; // "PT1H"
}

interface VivaCrmResponse {
  byTrainer: {
    NO_TRAINER?: {
      trainer: null;
      slots: VivaCrmSlot[][];
    };
  };
}

/**
 * Парсит ISO 8601 duration (PT1H, PT30M, PT1H30M, PT2H, PT2H30M) в минуты
 */
function parseDuration(duration: string): number {
  // Правильный парсинг ISO 8601 duration: PT1H, PT30M, PT1H30M, PT2H, PT2H30M
  // Примеры: "PT1H" -> 60, "PT30M" -> 30, "PT1H30M" -> 90, "PT2H" -> 120, "PT2H30M" -> 150
  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);
  
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  
  return hours * 60 + minutes;
}

/**
 * Делает запрос к VivaCRM API для одного дня
 */
export async function fetchVivaCrmSlotsForDay(config: VivaCrmConfig, dateStr: string): Promise<Slot[]> {
  const url = `https://api.vivacrm.ru/end-user/api/v1/${config.tenantId}/products/master-services/${config.serviceId}/timeslots`;
  
  const requestBody = {
    date: dateStr,
    trainers: { type: "NO_TRAINER" }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Origin': config.origin,
      'Referer': `${config.origin}/`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`VivaCRM HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as VivaCrmResponse;
  
  const slots: Slot[] = [];
  const noTrainerData = data.byTrainer?.NO_TRAINER;
  
  if (!noTrainerData?.slots) return slots;
  
  // slots - это массив массивов
  for (const slotGroup of noTrainerData.slots) {
    for (const item of slotGroup) {
      // Парсим timeFrom: "2025-12-04T07:00:00+03:00"
      const timeFrom = item.timeFrom;
      const dateTimeParts = timeFrom.split('T');
      const datePart = dateTimeParts[0];
      const timePart = dateTimeParts[1].substring(0, 5);
      
      const duration = parseDuration(item.availableDuration);
      const price = item.price?.from ?? null;
      const roomName = item.roomName ? `Корт ${item.roomName}` : null;
      
      // Фильтруем только часовые слоты: если слот 60 минут или более - превращаем в один часовой слот
      if (duration >= 60) {
        slots.push({
          time: timePart,
          dateTime: `${datePart} ${timePart}`,
          duration: 60,
          price,
          roomName
        });
      }
      // Если слот меньше 60 минут - пропускаем
    }
  }
  
  return slots;
}

/**
 * Делает запросы к VivaCRM API для всех дней
 * @param config - конфигурация площадки
 * @param startDay - начальный день (0 = сегодня, опционально)
 * @param endDay - конечный день (исключительно, опционально)
 */
export async function fetchVivaCrmSlotsForSite(config: VivaCrmConfig, startDay?: number, endDay?: number): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;
  const start = startDay !== undefined ? startDay : 0;
  // Если endDay указан явно, используем его (но не больше daysAhead из конфигурации)
  const end = endDay !== undefined ? Math.min(endDay, daysAhead) : daysAhead;
  
  // Проверяем, что start < end
  if (start >= end) {
    console.log(`⚠️ Skipping ${config.name}: startDay (${start}) >= endDay (${end}) or exceeds daysAhead (${daysAhead})`);
    return {};
  }
  
  for (let i = start; i < end; i++) {
    const dateStr = formatDateForYClients(i); // Используем ту же функцию форматирования
    try {
      const daySlots = await fetchVivaCrmSlotsForDay(config, dateStr);
      if (daySlots.length > 0) {
        result[dateStr] = daySlots;
        console.log(`  📅 ${dateStr}: ${daySlots.length} слотов`);
      }
      
      if (i < end - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching VivaCRM day ${dateStr} for ${config.name}:`, error);
    }
  }
  
  return result;
}

