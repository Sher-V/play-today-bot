import { Tennis77Config } from '../../constants/slots-constants';

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
 * Интерфейс ответа Tennis77 API
 * Массив объектов с информацией о занятиях/бронированиях
 */
interface Tennis77Lesson {
  id: number;
  status: number;
  lesson_date: string; // "2025-12-15"
  duration: number; // длительность в минутах
  time_from: string; // "2025-12-15 23:00:01"
  time_to: string; // "2025-12-15 23:59:00"
  is_available_for_enroll: boolean;
  is_available_for_enroll_authorized: boolean;
  room: {
    id: number;
    name: string; // "КОРТ БОЛЬШ"
  };
  branch: {
    id: number;
    name: string; // "Belokamennaya"
  };
  customers: Array<{ id: number; name: string }> | null; // если null или пустой - свободен
}

/**
 * Форматирует дату для Tennis77 API (YYYY-MM-DD)
 */
function formatDateForTennis77(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Делает запрос к Tennis77 API для периода дат
 */
async function fetchTennis77Lessons(config: Tennis77Config, dateFrom: string, dateTo: string): Promise<Tennis77Lesson[]> {
  const url = `https://tennis77.s20.online/v3/widgets/lessons/list?f_date_from=${dateFrom}&f_date_to=${dateTo}`;

  const headers: Record<string, string> = {
    'accept': '*/*',
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'authorization': config.authorization,
    'branch': String(config.branchId),
    'referer': config.referer || `https://tennis77.s20.online/common/1/online-schedule`,
    'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
  };

  // Добавляем cookie если задана
  if (config.cookie) {
    headers['cookie'] = config.cookie;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    throw new Error(`Tennis77 HTTP error! status: ${response.status}`);
  }

  return await response.json() as Tennis77Lesson[];
}

/**
 * Извлекает свободные слоты из ответа Tennis77 API
 * Слот считается свободным если:
 * - is_available_for_enroll === true
 * - customers === null или пустой массив
 */
function extractTennis77FreeSlots(lessons: Tennis77Lesson[], config: Tennis77Config): SiteSlots {
  const result: SiteSlots = {};

  for (const lesson of lessons) {
    // Проверяем, свободен ли слот
    const isFree = lesson.is_available_for_enroll && 
                   (!lesson.customers || lesson.customers.length === 0);

    if (!isFree) {
      continue;
    }

    // Парсим время начала из time_from (формат: "2025-12-15 23:00:01")
    const [date, timeStr] = lesson.time_from.split(' ');
    if (!date || !timeStr) {
      continue;
    }

    // Извлекаем время в формате HH:MM
    const [hours, minutes] = timeStr.split(':');
    const time = `${hours}:${minutes}`;

    // Получаем название корта из конфигурации или используем из API
    const roomName = config.roomNames?.[lesson.room.id] || lesson.room.name;

    // Округляем длительность: 59 минут -> 60 минут
    const duration = lesson.duration === 59 ? 60 : lesson.duration;

    const slot: Slot = {
      time,
      dateTime: `${date} ${time}`,
      duration, // длительность в минутах
      price: null, // цена не приходит в API
      roomName
    };

    if (!result[date]) {
      result[date] = [];
    }
    result[date].push(slot);
  }

  // Сортируем слоты по времени внутри каждой даты
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }

  return result;
}

/**
 * Делает запросы к Tennis77 API для всех дней
 */
export async function fetchTennis77SlotsForSite(config: Tennis77Config): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;

  // Запрашиваем данные неделями (7 дней за раз) для эффективности
  const weeks = Math.ceil(daysAhead / 7);
  
  for (let week = 0; week < weeks; week++) {
    const startDay = week * 7;
    const endDay = Math.min(startDay + 6, daysAhead - 1);
    
    const dateFrom = formatDateForTennis77(startDay);
    const dateTo = formatDateForTennis77(endDay);
    
    try {
      const lessons = await fetchTennis77Lessons(config, dateFrom, dateTo);
      const weekSlots = extractTennis77FreeSlots(lessons, config);

      // Объединяем результаты
      for (const [date, slots] of Object.entries(weekSlots)) {
        if (slots.length > 0) {
          if (!result[date]) {
            result[date] = [];
          }
          result[date].push(...slots);
          console.log(`  📅 ${date}: ${slots.length} свободных слотов`);
        }
      }

      // Задержка между запросами
      if (week < weeks - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`Error fetching Tennis77 week ${week} (${dateFrom} - ${dateTo}) for ${config.name}:`, error);
    }
  }

  // Сортируем слоты по времени внутри каждой даты
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }

  return result;
}

