import { FindSportConfig } from '../../constants/slots-constants';

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
 * Интерфейс ответа FindSport API
 * Формат: { "2025-12-03": { "17:30": { "9702": 12, "9703": 12 } } }
 * где 12 означает что корт занят
 */
interface FindSportSchedule {
  [date: string]: {
    [time: string]: {
      [courtId: string]: number;
    };
  };
}

/**
 * Форматирует дату для FindSport API (YYYY-MM-DD)
 */
function formatDateForFindSport(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Делает запрос к FindSport API для одного дня
 */
async function fetchFindSportScheduleForDay(config: FindSportConfig, dateStr: string): Promise<FindSportSchedule> {
  const url = `https://findsport.ru/playground/schedule/${config.playgroundId}?date=${dateStr}`;

  const headers: Record<string, string> = {
    'accept': '*/*',
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'referer': `https://findsport.ru/playground/${config.playgroundId}`,
    'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest'
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
    throw new Error(`FindSport HTTP error! status: ${response.status}`);
  }

  return await response.json() as FindSportSchedule;
}

/**
 * Вычисляет время +30 минут от заданного
 * @param time - время в формате "HH:MM"
 * @returns время +30 минут в формате "HH:MM"
 */
function addThirtyMinutes(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + 30;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

/**
 * Извлекает свободные слоты из расписания FindSport
 * Слот считается свободным только если оба полчаса свободны (текущий И следующий +30 мин)
 * Это нужно потому что минимальная бронь - 1 час
 */
function extractFindSportFreeSlots(schedule: FindSportSchedule, config: FindSportConfig): SiteSlots {
  const result: SiteSlots = {};
  const allCourtIds = Object.keys(config.courts);

  for (const [date, times] of Object.entries(schedule)) {
    const daySlots: Slot[] = [];

    // Собираем все временные слоты за день
    const allTimes = Object.keys(times).sort();

    for (const time of allTimes) {
      const bookedCourts = times[time] || {};
      const nextTime = addThirtyMinutes(time);
      
      // Пропускаем 23:30 - после него нет слотов, час забронировать невозможно
      if (nextTime.startsWith('00:')) {
        continue;
      }
      
      const nextBookedCourts = times[nextTime] || {};

      // Для каждого корта проверяем, свободен ли он И на следующие 30 минут тоже
      for (const courtId of allCourtIds) {
        const isCurrentBooked = bookedCourts[courtId] === 12;
        const isNextBooked = nextBookedCourts[courtId] === 12;

        // Слот свободен только если оба полчаса свободны
        if (!isCurrentBooked && !isNextBooked) {
          daySlots.push({
            time,
            dateTime: `${date} ${time}`,
            duration: 60, // Минимальная бронь - 1 час
            price: null,
            roomName: config.courts[courtId]
          });
        }
      }
    }

    if (daySlots.length > 0) {
      // Сортируем по времени
      daySlots.sort((a, b) => a.time.localeCompare(b.time));
      result[date] = daySlots;
    }
  }

  return result;
}

/**
 * Делает запросы к FindSport API для всех дней
 */
export async function fetchFindSportSlotsForSite(config: FindSportConfig): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;

  for (let i = 0; i < daysAhead; i++) {
    const dateStr = formatDateForFindSport(i);
    try {
      const schedule = await fetchFindSportScheduleForDay(config, dateStr);
      const daySlots = extractFindSportFreeSlots(schedule, config);

      // Объединяем результаты
      for (const [date, slots] of Object.entries(daySlots)) {
        if (slots.length > 0) {
          if (!result[date]) {
            result[date] = [];
          }
          result[date].push(...slots);
          console.log(`  📅 ${date}: ${slots.length} свободных слотов`);
        }
      }

      // Задержка между запросами
      if (i < daysAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`Error fetching FindSport day ${dateStr} for ${config.name}:`, error);
    }
  }

  // Сортируем слоты по времени внутри каждой даты
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }

  return result;
}

