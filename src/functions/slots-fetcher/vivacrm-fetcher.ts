import { VivaCrmConfig } from '../../constants/slots-constants';
import { formatDateForYClients } from './yclients-fetcher';

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
 * Парсит ISO 8601 duration (PT1H) в минуты
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+)H?(\d+)?M?/);
  if (!match) return 60;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

/**
 * Делает запрос к VivaCRM API для одного дня
 */
async function fetchVivaCrmSlotsForDay(config: VivaCrmConfig, dateStr: string): Promise<Slot[]> {
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
      
      slots.push({
        time: timePart,
        dateTime: `${datePart} ${timePart}`,
        duration,
        price: item.price?.from ?? null,
        roomName: item.roomName ? `Корт ${item.roomName}` : null
      });
    }
  }
  
  return slots;
}

/**
 * Делает запросы к VivaCRM API для всех дней
 */
export async function fetchVivaCrmSlotsForSite(config: VivaCrmConfig): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;
  
  for (let i = 0; i < daysAhead; i++) {
    const dateStr = formatDateForYClients(i); // Используем ту же функцию форматирования
    try {
      const daySlots = await fetchVivaCrmSlotsForDay(config, dateStr);
      if (daySlots.length > 0) {
        result[dateStr] = daySlots;
        console.log(`  📅 ${dateStr}: ${daySlots.length} слотов`);
      }
      
      if (i < daysAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching VivaCRM day ${dateStr} for ${config.name}:`, error);
    }
  }
  
  return result;
}

