import {
  YClientsConfig,
  YCLIENTS_API_URL
} from '../../constants/slots-constants';

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
 * Интерфейс ответа YClients API
 */
interface YClientsSlot {
  type: string;
  id: string;
  attributes: {
    datetime: string;   // "2025-12-04T07:00:00+03:00"
    time: string;       // "7:00"
    is_bookable: boolean;
  };
}

interface YClientsResponse {
  data: YClientsSlot[];
}

/**
 * Форматирует дату для YClients API (YYYY-MM-DD)
 */
export function formatDateForYClients(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Делает запрос к YClients API для одного дня и одного staff_id
 */
async function fetchYClientsSlotsForDayAndStaff(
  config: YClientsConfig, 
  dateStr: string, 
  staffId: number | null | undefined, 
  roomName: string | null
): Promise<Slot[]> {
  // Формируем объект записи: если staffId не задан (undefined), не включаем поле staff_id
  const record: { attendance_service_items: unknown[]; staff_id?: number | null } = {
    attendance_service_items: []
  };
  
  // Добавляем staff_id только если он явно задан (не undefined)
  if (staffId !== undefined) {
    record.staff_id = staffId;
  }
  
  const requestBody = {
    context: { location_id: config.locationId },
    filter: {
      date: dateStr,
      records: [record]
    }
  };

  const response = await fetch(YCLIENTS_API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU',
      'Authorization': `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
      'Origin': config.origin,
      'Referer': `${config.origin}/`,
      'X-Yclients-Application-Name': 'client.booking',
      'X-Yclients-Application-Platform': 'angular-18.2.13'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`YClients HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as YClientsResponse;
  
  // Трансформируем слоты
  const slots: Slot[] = [];
  
  for (const item of data.data || []) {
    if (!item.attributes.is_bookable) continue;
    
    // Парсим datetime: "2025-12-04T07:00:00+03:00"
    const datetime = item.attributes.datetime;
    const dateTimeParts = datetime.split('T');
    const datePart = dateTimeParts[0];
    const timePart = dateTimeParts[1].substring(0, 5); // "07:00"
    
    slots.push({
      time: timePart,
      dateTime: `${datePart} ${timePart}`,
      duration: config.slotDuration || 60,
      price: null,  // YClients не возвращает цену в этом эндпоинте
      roomName: roomName
    });
  }
  
  return slots;
}

/**
 * Делает запрос к YClients API для одного дня (все staff_id)
 */
async function fetchYClientsSlotsForDay(config: YClientsConfig, dateStr: string): Promise<Slot[]> {
  // Если есть staffIds - делаем запросы для каждого корта
  if (config.staffIds) {
    const allSlots: Slot[] = [];
    const staffEntries = Object.entries(config.staffIds);
    
    for (let i = 0; i < staffEntries.length; i++) {
      const [staffIdStr, roomName] = staffEntries[i];
      const staffId = parseInt(staffIdStr, 10);
      
      try {
        const slots = await fetchYClientsSlotsForDayAndStaff(config, dateStr, staffId, roomName);
        allSlots.push(...slots);
        
        // Небольшая задержка между запросами
        if (i < staffEntries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error fetching staff_id ${staffId} for ${config.name}:`, error);
      }
    }
    
    return allSlots;
  }
  
  // Иначе используем одиночный staffId из конфига
  // Если staffId не задан (undefined), передаем undefined, чтобы поле не включалось в запрос
  const staffId = config.staffId;
  return fetchYClientsSlotsForDayAndStaff(config, dateStr, staffId, config.roomName || null);
}

/**
 * Делает запросы к YClients API для всех дней
 * @param config - конфигурация площадки
 * @param startDay - начальный день (0 = сегодня, опционально)
 * @param endDay - конечный день (исключительно, опционально)
 */
export async function fetchYClientsSlotsForSite(config: YClientsConfig, startDay?: number, endDay?: number): Promise<SiteSlots> {
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
    const dateStr = formatDateForYClients(i);
    try {
      const daySlots = await fetchYClientsSlotsForDay(config, dateStr);
      if (daySlots.length > 0) {
        result[dateStr] = daySlots;
        console.log(`  📅 ${dateStr}: ${daySlots.length} слотов`);
      }
      
      // Задержка между запросами
      if (i < end - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching YClients day ${dateStr} for ${config.name}:`, error);
    }
  }
  
  return result;
}

