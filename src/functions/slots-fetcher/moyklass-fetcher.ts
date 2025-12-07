import { MoyKlassConfig } from '../../constants/slots-constants';

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
 * Интерфейс ответа MoyKlass API
 */
interface MoyKlassResponse {
  content: string;  // HTML с расписанием
}

/**
 * Извлекает слоты из HTML ответа MoyKlass
 * Парсит div.lesson-item с attr-id="2025-12-09_11:00_60,90"
 */
function extractMoyKlassSlots(html: string): Slot[] {
  const slots: Slot[] = [];
  
  // Регулярка для lesson-item: attr-id="2025-12-09_11:00_60,90" и lesson-item-class-name
  const lessonItemRegex = /<div class="lesson-item"[^>]*attr-id="([^"]+)"[^>]*>[\s\S]*?<div class="lesson-item-class-name">\s*([^<]+)<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
  
  let match;
  while ((match = lessonItemRegex.exec(html)) !== null) {
    try {
      const attrId = match[1];  // "2025-12-09_11:00_60,90"
      const className = match[2].trim();  // "Аренда корта Бауманская ВЫХОДНЫЕ СТАНДАРТ"
      
      // Парсим attr-id: дата_время_длительности
      const parts = attrId.split('_');
      if (parts.length < 2) continue;
      
      const date = parts[0];       // "2025-12-09"
      const time = parts[1];       // "11:00"
      const durations = parts[2];  // "60,90" (опционально)
      
      // Берём первую длительность из списка
      const duration = durations ? parseInt(durations.split(',')[0], 10) : 60;
      
      slots.push({
        time,
        dateTime: `${date} ${time}`,
        duration,
        price: null,  // MoyKlass не показывает цену в расписании
        roomName: className
      });
    } catch (e) {
      // Игнорируем ошибки парсинга
    }
  }
  
  return slots;
}

/**
 * Форматирует дату для MoyKlass API (YYYY-MM-DD) - начало недели (понедельник)
 */
function getWeekStartDate(weeksFromNow: number): string {
  const date = new Date();
  // Сдвигаем на нужное количество недель
  date.setDate(date.getDate() + weeksFromNow * 7);
  // Находим понедельник этой недели
  const dayOfWeek = date.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;  // Воскресенье = 0
  date.setDate(date.getDate() + diff);
  return date.toISOString().split('T')[0];
}

/**
 * Делает запрос к MoyKlass API для одной недели
 * @param weekIndex - индекс недели (0 = текущая, 1+ = следующие)
 */
async function fetchMoyKlassSlotsForWeek(config: MoyKlassConfig, startDate: string, weekIndex: number): Promise<Slot[]> {
  // Первая неделя: базовый URL, последующие: с доп. параметрами
  let url: string;
  if (weekIndex === 0) {
    url = `https://app.moyklass.com/api/site/widget/content/schedule?id=${config.widgetId}`;
  } else {
    url = `https://app.moyklass.com/api/site/widget/content/schedule?id=${config.widgetId}&show_type=calendar&action_type=date_next&start_date=${startDate}&calendar_view_type=week`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': config.origin,
      'Referer': `${config.origin}/`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`MoyKlass HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as MoyKlassResponse;
  
  if (!data.content) {
    return [];
  }
  
  return extractMoyKlassSlots(data.content);
}

/**
 * Делает запросы к MoyKlass API для всех недель
 */
export async function fetchMoyKlassSlotsForSite(config: MoyKlassConfig): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const weeksAhead = config.weeksAhead || 2;
  
  for (let i = 0; i < weeksAhead; i++) {
    const startDate = getWeekStartDate(i);
    try {
      const weekSlots = await fetchMoyKlassSlotsForWeek(config, startDate, i);
      
      // Группируем слоты по датам
      for (const slot of weekSlots) {
        const date = slot.dateTime.split(' ')[0];
        if (!result[date]) {
          result[date] = [];
        }
        result[date].push(slot);
      }
      
      if (weekSlots.length > 0) {
        console.log(`  📅 Неделя с ${startDate}: ${weekSlots.length} слотов`);
      }
      
      // Задержка между запросами
      if (i < weeksAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching MoyKlass week ${startDate} for ${config.name}:`, error);
    }
  }
  
  // Сортируем слоты по времени внутри каждой даты
  for (const date in result) {
    result[date].sort((a, b) => a.time.localeCompare(b.time));
  }
  
  return result;
}

