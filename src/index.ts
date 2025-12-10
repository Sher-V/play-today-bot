import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { trackButtonClick, generateSessionId, parseButtonType } from './analytics';
import {
  TENNIS_COURT_NAMES,
  TENNIS_COURT_LINKS,
  TENNIS_COURT_MAPS,
  TENNIS_COURT_METRO,
  TENNIS_COURT_DISTRICTS,
  TENNIS_COURT_IS_CITY,
  TENNIS_COURT_LOCATIONS,
} from './constants/tennis-constants';
import {
  PADEL_COURT_NAMES,
  PADEL_COURT_LINKS,
  PADEL_COURT_MAPS,
  PADEL_COURT_METRO,
  PADEL_COURT_DISTRICTS,
  PADEL_COURT_IS_CITY,
  PADEL_COURT_LOCATIONS,
} from './constants/padel-constants';
import { USER_TEXTS } from './constants/user-texts';
import { SportType, type Sport } from './constants/sport-constants';

// Типы для Cloud Functions
interface CloudFunctionRequest extends IncomingMessage {
  body: TelegramBot.Update;
  method: string;
}

interface CloudFunctionResponse extends ServerResponse {
  status(code: number): CloudFunctionResponse;
  send(body: string): CloudFunctionResponse;
}

// Типы для слотов
interface Slot {
  time: string;
  dateTime: string;
  duration?: number;
  price?: number;
  roomName: string;
}

interface SlotsData {
  lastUpdated: string;
  sites: {
    [siteName: string]: {
      [date: string]: Slot[];
    };
  };
}

// Cloud Storage настройки
const BUCKET_NAME = process.env.GCS_BUCKET;
const USE_PROD_ACTUAL_SLOTS = process.env.USE_PROD_ACTUAL_SLOTS === 'true';
// Функция для получения имени файла по дате
function getSlotsFileName(sport: Sport, date: string): string {
  return `actual-${sport}-slots-${date}.json`;
}

function getSlotsLocalPath(sport: Sport, date: string): string {
  return path.join(process.cwd(), getSlotsFileName(sport, date));
}
// Если USE_PROD_ACTUAL_SLOTS=true, всегда используем Cloud Storage (требуется BUCKET_NAME)
const USE_LOCAL_STORAGE = USE_PROD_ACTUAL_SLOTS ? false : !BUCKET_NAME;
const storage = (USE_PROD_ACTUAL_SLOTS || BUCKET_NAME) ? new Storage() : null;

// Режим работы: dev (polling) или prod (webhook)
const isDev = process.env.NODE_ENV === 'development';

// Ленивая инициализация бота (создаётся при первом вызове)
let bot: TelegramBot | null = null;

function getBot(): TelegramBot {
  if (!bot) {
    const token = isDev ? process.env.BOT_TOKEN_DEV : process.env.BOT_TOKEN;
    const tokenName = isDev ? 'BOT_TOKEN_DEV' : 'BOT_TOKEN';
    if (!token) {
      throw new Error(`${tokenName} не найден в переменных окружения`);
    }
    // В dev режиме используем polling, в prod - только API без polling
    bot = new TelegramBot(token, { polling: isDev });
  }
  return bot;
}

/**
 * Извлекает сообщение об ошибке из объекта ошибки
 */
function getErrorMessage(error: unknown): string {
  const err = error as { response?: { body?: { description?: string } }; message?: string };
  return err?.response?.body?.description || err?.message || String(error);
}

/**
 * Безопасное обновление текста сообщения
 * Игнорирует ошибку "message is not modified"
 */
async function safeEditMessageText(
  text: string,
  options: TelegramBot.EditMessageTextOptions
): Promise<TelegramBot.Message | boolean> {
  try {
    return await getBot().editMessageText(text, options);
  } catch (error: unknown) {
    // Игнорируем ошибку, если сообщение не изменилось
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes('message is not modified')) {
      return true;
    }
    throw error;
  }
}

/**
 * Безопасное обновление разметки сообщения
 * Игнорирует ошибку "message is not modified"
 */
async function safeEditMessageReplyMarkup(
  markup: TelegramBot.InlineKeyboardMarkup,
  options: TelegramBot.EditMessageReplyMarkupOptions
): Promise<TelegramBot.Message | boolean> {
  try {
    return await getBot().editMessageReplyMarkup(markup, options);
  } catch (error: unknown) {
    // Игнорируем ошибку, если сообщение не изменилось
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes('message is not modified')) {
      return true;
    }
    throw error;
  }
}

/**
 * Безопасный ответ на callback query
 * Игнорирует ошибки "query is too old" и "query ID is invalid"
 */
async function safeAnswerCallbackQuery(
  queryId: string,
  options?: Omit<TelegramBot.AnswerCallbackQueryOptions, 'callback_query_id'>
): Promise<boolean> {
  try {
    return await getBot().answerCallbackQuery(queryId, options);
  } catch (error: unknown) {
    // Игнорируем ошибки, связанные с истекшими или невалидными query
    const errorMessage = getErrorMessage(error);
    if (
      errorMessage.includes('query is too old') ||
      errorMessage.includes('query ID is invalid') ||
      errorMessage.includes('response timeout expired')
    ) {
      return true;
    }
    throw error;
  }
}

// Хранилище обработанных callback queries для предотвращения повторной обработки
const processedQueries = new Set<string>();
// Очищаем старые записи каждые 5 минут (300000 мс)
setInterval(() => {
  processedQueries.clear();
}, 300000);

// Временное хранилище пользователей (в памяти)
// ⚠️ Важно: для production нужно использовать Firestore или другую БД,
// так как Cloud Functions не сохраняет состояние между вызовами
interface UserProfile {
  name?: string;
  level?: string;
  districts?: string[];
}
const users = new Map<number, UserProfile>();

// Опции районов
const districtOptions = [
  { id: 'center', label: 'Центр' },
  { id: 'south', label: 'Юг / Юго-Запад' },
  { id: 'north', label: 'Север / Северо-Запад' },
  { id: 'east', label: 'Восток / Юго-Восток' },
  { id: 'west', label: 'Запад / Северо-Запад' },
  { id: 'any', label: 'Не важно, могу ездить' }
];

// ID локаций для поиска кортов
const LocationId = {
  CENTER: 'center',
  WEST: 'west',
  NORTH: 'north',
  SOUTH: 'south',
  EAST: 'east',
  MOSCOW_REGION: 'moscow-region',
  ANY: 'any'
} as const;

// Лейблы локаций
const locationLabels = new Map<string, string>([
  [LocationId.CENTER, 'Центр'],
  [LocationId.WEST, 'Запад'],
  [LocationId.NORTH, 'Север'],
  [LocationId.SOUTH, 'Юг'],
  [LocationId.EAST, 'Восток'],
  [LocationId.MOSCOW_REGION, 'Подмосковье'],
  [LocationId.ANY, 'Не важно']
]);

// Опции времени для поиска кортов
const timeOptions = [
  { id: 'morning', label: 'Утро (6:00-12:00)', startHour: 6, endHour: 12 },
  { id: 'day', label: 'День (12:00-18:00)', startHour: 12, endHour: 18 },
  { id: 'evening', label: 'Вечер (18:00-00:00)', startHour: 18, endHour: 24 },
  { id: 'any', label: 'Не важно' }
];

// Временное хранилище для состояния поиска (дата, спорт, выбранные локации, выбранное время)
interface SearchState {
  date: string;
  dateStr: string;
  sport: Sport;
  selectedLocations: string[];
  selectedTimeSlots: string[];
  // Данные для пагинации
  siteSlots?: { siteName: string; slots: Slot[] }[];
  lastUpdated?: string;
  currentPage?: number;
  totalPages?: number;
}
const searchStates = new Map<number, SearchState>();

// === Функции для работы со слотами ===

/**
 * Загружает слоты из Cloud Storage или локального файла для конкретной даты
 */
async function loadSlots(sport: Sport, date: string): Promise<SlotsData | null> {
  try {
    const fileName = getSlotsFileName(sport, date);
    const localPath = getSlotsLocalPath(sport, date);
    
    // Если USE_PROD_ACTUAL_SLOTS=true, всегда используем Cloud Storage
    if (USE_PROD_ACTUAL_SLOTS) {
      if (!BUCKET_NAME) {
        console.error('USE_PROD_ACTUAL_SLOTS=true требует GCS_BUCKET в переменных окружения');
        return null;
      }
      
      // Загружаем из Cloud Storage
      const bucket = storage!.bucket(BUCKET_NAME);
      const file = bucket.file(fileName);
      
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`Файл слотов не найден в Cloud Storage: ${fileName}`);
        return null;
      }
      
      const [contents] = await file.download();
      return JSON.parse(contents.toString());
    }
    
    // Обычная логика: локальное хранилище или Cloud Storage
    if (USE_LOCAL_STORAGE) {
      // Загружаем из локального файла
      if (!fs.existsSync(localPath)) {
        console.error(`Локальный файл слотов не найден: ${localPath}`);
        return null;
      }
      const data = fs.readFileSync(localPath, 'utf-8');
      return JSON.parse(data);
    } else {
      // Загружаем из Cloud Storage
      const bucket = storage!.bucket(BUCKET_NAME!);
      const file = bucket.file(fileName);
      
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`Файл слотов не найден в Cloud Storage: ${fileName}`);
        return null;
      }
      
      const [contents] = await file.download();
      return JSON.parse(contents.toString());
    }
  } catch (error) {
    console.error(`Ошибка загрузки слотов для ${sport} на ${date}:`, error);
    return null;
  }
}

/**
 * Получает слоты на указанную дату
 */
function getSlotsByDate(slotsData: SlotsData, targetDate: string): { siteName: string; slots: Slot[] }[] {
  const result: { siteName: string; slots: Slot[] }[] = [];
  
  for (const [siteName, dates] of Object.entries(slotsData.sites)) {
    const slots = dates[targetDate];
    if (slots && slots.length > 0) {
      result.push({ siteName, slots });
    }
  }
  
  return result;
}

/**
 * Фильтрует слоты по выбранным локациям
 */
function filterSlotsByLocation(
  siteSlots: { siteName: string; slots: Slot[] }[],
  selectedLocations: string[],
  sport: Sport
): { siteName: string; slots: Slot[] }[] {
  // Если выбрано "Не важно", возвращаем все слоты
  if (selectedLocations.includes('any')) {
    return siteSlots;
  }
  
  // Получаем маппинг локаций для текущего спорта
  const COURT_LOCATIONS = sport === SportType.PADEL ? PADEL_COURT_LOCATIONS : TENNIS_COURT_LOCATIONS;
  
  // Фильтруем слоты по локациям
  return siteSlots.filter(({ siteName }) => {
    const courtLocations = COURT_LOCATIONS[siteName] || [];
    // Проверяем, есть ли пересечение между выбранными локациями и локациями корта
    return courtLocations.some(loc => selectedLocations.includes(loc));
  });
}

/**
 * Фильтрует слоты по выбранному времени
 */
function filterSlotsByTime(
  siteSlots: { siteName: string; slots: Slot[] }[],
  selectedTimeSlots: string[]
): { siteName: string; slots: Slot[] }[] {
  // Если выбрано "Не важно", возвращаем все слоты
  if (selectedTimeSlots.includes('any')) {
    return siteSlots;
  }
  
  // Получаем выбранные временные диапазоны
  const selectedRanges = timeOptions
    .filter(opt => selectedTimeSlots.includes(opt.id) && opt.id !== 'any' && opt.startHour !== undefined && opt.endHour !== undefined)
    .map(opt => ({ startHour: opt.startHour!, endHour: opt.endHour! }));
  
  if (selectedRanges.length === 0) {
    return siteSlots;
  }
  
  // Фильтруем слоты по времени
  return siteSlots.map(({ siteName, slots }) => {
    const filteredSlots = slots.filter(slot => {
      // Парсим время из слота (формат обычно "HH:MM")
      const timeMatch = slot.time.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) {
        return false;
      }
      
      const hour = parseInt(timeMatch[1], 10);
      
      // Проверяем, попадает ли час в один из выбранных диапазонов
      return selectedRanges.some(range => {
        if (range.endHour === 24) {
          // Вечер: 18:00-00:00 (18-23)
          return hour >= range.startHour && hour < 24;
        } else {
          return hour >= range.startHour && hour < range.endHour;
        }
      });
    });
    
    return { siteName, slots: filteredSlots };
  }).filter(({ slots }) => slots.length > 0);
}

/**
 * Сортирует слоты по приоритету:
 * 1. Сначала корты с метро
 * 2. В конце корты из moscow-region
 */
function sortSlotsByPriority(
  siteSlots: { siteName: string; slots: Slot[] }[],
  sport: Sport
): { siteName: string; slots: Slot[] }[] {
  const COURT_METRO = sport === SportType.PADEL ? PADEL_COURT_METRO : TENNIS_COURT_METRO;
  const COURT_LOCATIONS = sport === SportType.PADEL ? PADEL_COURT_LOCATIONS : TENNIS_COURT_LOCATIONS;
  
  return [...siteSlots].sort((a, b) => {
    const aHasMetro = !!COURT_METRO[a.siteName];
    const bHasMetro = !!COURT_METRO[b.siteName];
    const aIsMoscowRegion = (COURT_LOCATIONS[a.siteName] || []).includes('moscow-region');
    const bIsMoscowRegion = (COURT_LOCATIONS[b.siteName] || []).includes('moscow-region');
    
    // Если у корта A есть метро, а у B нет - A идет первым
    if (aHasMetro && !bHasMetro) {
      return -1;
    }
    // Если у корта B есть метро, а у A нет - B идет первым
    if (!aHasMetro && bHasMetro) {
      return 1;
    }
    
    // Если у обоих кортов одинаковое наличие метро, проверяем moscow-region
    // Корты из moscow-region идут в конец
    if (aIsMoscowRegion && !bIsMoscowRegion) {
      return 1;
    }
    if (!aIsMoscowRegion && bIsMoscowRegion) {
      return -1;
    }
    
    // В остальных случаях сохраняем исходный порядок
    return 0;
  });
}

/**
 * Получает список доступных дат (начиная с сегодня, на 14 дней вперед)
 * Теперь даты генерируются, так как данные разбиты по файлам
 */
function getAvailableDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Генерируем даты на 14 дней вперед
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(formatDateToYYYYMMDD(date));
  }
  
  return dates;
}

/**
 * Форматирует дату в формат YYYY-MM-DD в локальном времени
 */
function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Количество дней на странице
const DAYS_PER_PAGE = 7;

/**
 * Получает даты для страницы с учетом смещения страницы
 * @param pageOffset - смещение страницы (0 = первые дни начиная с сегодня, 1 = следующие дни)
 * @returns массив дат для отображения (ровно DAYS_PER_PAGE дней)
 */
function getDatesForWeekRange(pageOffset: number = 0): string[] {
  // Используем московское время для определения "сегодня"
  const moscowToday = getMoscowTime();
  moscowToday.setHours(0, 0, 0, 0);
  
  // Для первой страницы начинаем строго с сегодняшнего дня
  // Для последующих страниц начинаем с сегодня + смещение * DAYS_PER_PAGE дней
  const startDate = new Date(moscowToday);
  if (pageOffset > 0) {
    startDate.setDate(startDate.getDate() + (pageOffset * DAYS_PER_PAGE));
  }
  
  // Генерируем все даты в диапазоне
  const allDatesInRange: string[] = [];
  const currentDate = new Date(startDate);
  
  for (let i = 0; i < DAYS_PER_PAGE; i++) {
    // Используем форматирование московской даты для правильного определения даты
    const dateStr = formatMoscowDateToYYYYMMDD(currentDate);
    
    // Добавляем все даты без фильтрации по наличию слотов
    allDatesInRange.push(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return allDatesInRange;
}

/**
 * Форматирует дату для отображения на кнопке (например, "5 дек" или "5 дек, пн")
 */
function formatDateButton(dateKey: string): string {
  const date = new Date(dateKey);
  // Используем московское время для правильного определения "сегодня" и "завтра"
  const moscowToday = getMoscowTime();
  moscowToday.setHours(0, 0, 0, 0);
  const tomorrow = new Date(moscowToday);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateObj = new Date(dateKey);
  dateObj.setHours(0, 0, 0, 0);
  
  if (dateObj.getTime() === moscowToday.getTime()) {
    return 'Сегодня';
  }
  if (dateObj.getTime() === tomorrow.getTime()) {
    return 'Завтра';
  }
  
  const day = date.getDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const weekDays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const weekDay = weekDays[date.getDay()];
  return `${day} ${months[date.getMonth()]}, ${weekDay}`;
}

/**
 * Форматирует время из ISO строки в формат "12:00"
 */
function formatLastUpdatedTime(lastUpdated: string): string {
  try {
    const date = new Date(lastUpdated);
    // Конвертируем в московское время (GMT+3)
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(date);
  } catch (error) {
    console.error('Ошибка форматирования времени:', error);
    return '';
  }
}

/**
 * Форматирует одну страницу слотов для отображения пользователю
 */
function formatSlotsPage(
  date: string,
  siteSlots: { siteName: string; slots: Slot[] }[],
  sport: Sport = SportType.TENNIS,
  page: number = 1,
  pageSize: number = 5,
  lastUpdated?: string,
  prefix?: string
): string {
  if (siteSlots.length === 0) {
    const emoji = sport === SportType.PADEL ? '🏓' : '🎾';
    return `${emoji} На ${date} свободных кортов не найдено.`;
  }
  
  const emoji = sport === SportType.PADEL ? '🏓' : '🎾';
  const COURT_NAMES = sport === SportType.PADEL ? PADEL_COURT_NAMES : TENNIS_COURT_NAMES;
  const COURT_LINKS = sport === SportType.PADEL ? PADEL_COURT_LINKS : TENNIS_COURT_LINKS;
  const COURT_METRO = sport === SportType.PADEL ? PADEL_COURT_METRO : TENNIS_COURT_METRO;
  const COURT_MAPS = sport === SportType.PADEL ? PADEL_COURT_MAPS : TENNIS_COURT_MAPS;
  const COURT_DISTRICTS = sport === SportType.PADEL ? PADEL_COURT_DISTRICTS : TENNIS_COURT_DISTRICTS;
  const COURT_IS_CITY = sport === SportType.PADEL ? PADEL_COURT_IS_CITY : TENNIS_COURT_IS_CITY;
  
  let message = '';
  if (prefix) {
    message = `${prefix}\n\n`;
  }
  message += `${emoji} *Свободные корты на ${date}*\n\n`;
  
  // Вычисляем, какие корты показывать на этой странице
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageSlots = siteSlots.slice(startIndex, endIndex);
  
  for (const { siteName, slots } of pageSlots) {
    const displayName = COURT_NAMES[siteName] || siteName;
    const metro = COURT_METRO[siteName];
    const district = COURT_DISTRICTS[siteName];
    const isCity = COURT_IS_CITY[siteName] || false;
    const bookingLink = COURT_LINKS[siteName];
    const mapLink = COURT_MAPS[siteName];
    
    // Формируем название с метро/городом и округом в скобочках
    let nameWithMetro = displayName;
    if (metro && district) {
      if (isCity) {
        // Для городов выводим только город с префиксом "г.", без округа
        nameWithMetro = `${displayName} (г. ${metro})`;
      } else {
        // Для метро выводим метро и округ
        nameWithMetro = `${displayName} (м. ${metro}, ${district})`;
      }
    } else if (metro) {
      const metroPrefix = isCity ? 'г. ' : 'м. ';
      nameWithMetro = `${displayName} (${metroPrefix}${metro})`;
    } else if (district) {
      nameWithMetro = `${displayName} (${district})`;
    }
    
    // Формируем строку со ссылками
    const links: string[] = [];
    if (mapLink) {
      links.push(`[Карта](${mapLink})`);
    }
    if (bookingLink) {
      links.push(`[Забронировать](${bookingLink})`);
    }
    
    if (links.length > 0) {
      message += `📍 *${nameWithMetro}* — ${links.join(' | ')}\n`;
    } else {
      message += `📍 *${nameWithMetro}*\n`;
    }
    
    // Удаляем дубли (по времени и корту)
    const uniqueSlots = slots.filter((slot, index, self) => 
      index === self.findIndex(s => 
        s.time === slot.time && s.roomName === slot.roomName
      )
    );
    
    // Группируем слоты по времени
    const groupedByTime: { [time: string]: Slot[] } = {};
    for (const slot of uniqueSlots) {
      if (!groupedByTime[slot.time]) {
        groupedByTime[slot.time] = [];
      }
      groupedByTime[slot.time].push(slot);
    }
    
    // Сортируем по времени
    const times = Object.keys(groupedByTime).sort();
    
    for (const time of times) {
      const timeSlots = groupedByTime[time];
      const price = timeSlots[0].price;
      const duration = timeSlots[0].duration;
      
      // Формируем строку с информацией о слоте
      let slotInfo = `  ⏰ ${time}`;
      if (duration) {
        slotInfo += ` (${duration} мин)`;
      }
      if (price) {
        slotInfo += ` — ${price}₽`;
      }
      slotInfo += '\n';
      
      message += slotInfo;
    }
    
    message += '\n';
  }
  
  // Добавляем информацию о странице, если есть несколько страниц
  const totalPages = Math.ceil(siteSlots.length / pageSize);
  if (totalPages > 1) {
    message += `\n\n📄 _Страница ${page} из ${totalPages}_`;
  }
  
  // Добавляем информацию об актуальности данных
  if (lastUpdated) {
    const formattedTime = formatLastUpdatedTime(lastUpdated);
    if (formattedTime) {
      message += `\nℹ️ _Данные актуальны на ${formattedTime} (МСК) и обновляются каждые 20 минут._`;
    }
  }
  
  return message;
}

// Генерация клавиатуры для выбора районов
function getDistrictKeyboard(selectedDistricts: string[]): TelegramBot.InlineKeyboardButton[][] {
  return [
    ...districtOptions.map(opt => [{
      text: selectedDistricts.includes(opt.id) ? `✅ ${opt.label}` : opt.label,
      callback_data: `district_${opt.id}`
    }]),
    [{ text: '✔️ Готово', callback_data: 'district_done' }]
  ];
}

/**
 * Подсчитывает количество доступных кортов по локациям на основе слотов
 */
async function getAvailableCourtsCountByLocation(
  sport: Sport,
  date: string,
  selectedTimeSlots: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    [LocationId.WEST]: 0,
    [LocationId.EAST]: 0,
    [LocationId.NORTH]: 0,
    [LocationId.SOUTH]: 0,
    [LocationId.CENTER]: 0,
    [LocationId.MOSCOW_REGION]: 0
  };

  // Загружаем слоты для выбранной даты
  const slotsData = await loadSlots(sport, date);
  if (!slotsData) {
    return counts;
  }

  // Получаем слоты на дату
  const siteSlots = getSlotsByDate(slotsData, date);
  
  // Фильтруем по выбранному времени
  const filteredByTime = filterSlotsByTime(siteSlots, selectedTimeSlots);
  
  // Получаем маппинг локаций для текущего спорта
  const COURT_LOCATIONS = sport === SportType.PADEL ? PADEL_COURT_LOCATIONS : TENNIS_COURT_LOCATIONS;
  
  // Подсчитываем уникальные корты в каждой локации
  const courtsByLocation = new Map<string, Set<string>>();
  
  for (const { siteName } of filteredByTime) {
    const courtLocations = COURT_LOCATIONS[siteName] || [];
    for (const location of courtLocations) {
      if (!courtsByLocation.has(location)) {
        courtsByLocation.set(location, new Set());
      }
      courtsByLocation.get(location)!.add(siteName);
    }
  }
  
  // Заполняем counts
  for (const [location, courts] of courtsByLocation.entries()) {
    if (counts.hasOwnProperty(location)) {
      counts[location] = courts.size;
    }
  }
  
  return counts;
}

// Генерация клавиатуры для выбора локаций
async function getLocationKeyboard(
  selectedLocations: string[],
  searchState?: SearchState
): Promise<TelegramBot.InlineKeyboardButton[][]> {
  // Получаем актуальное количество доступных кортов
  let countsByRegion: Record<string, number> = {};
  
  let useFallback = false;
  
  if (searchState && searchState.selectedTimeSlots.length > 0) {
    try {
      countsByRegion = await getAvailableCourtsCountByLocation(
        searchState.sport,
        searchState.date,
        searchState.selectedTimeSlots
      );
    } catch (error) {
      console.error('Ошибка при подсчете доступных кортов:', error);
      // В случае ошибки не показываем количество кортов (оставляем countsByRegion пустым)
      useFallback = true;
      countsByRegion = {};
    }
  } else if (searchState) {
    // Если время не выбрано, не показываем количество кортов
    useFallback = true;
    countsByRegion = {};
  }
  
  // Вспомогательная функция для получения текста кнопки
  const getButtonText = (id: string) => {
    const label = locationLabels.get(id) || id;
    const count = countsByRegion[id];
    // Показываем количество только если не используем fallback и count определен
    const countText = !useFallback && count !== undefined ? ` (${count})` : '';
    const baseText = selectedLocations.includes(id) ? `✅ ${label}` : label;
    return `${baseText}${countText}`;
  };
  
  return [
    // Север - отдельная строка
    [{
      text: getButtonText(LocationId.NORTH),
      callback_data: `location_${LocationId.NORTH}`
    }],
    // Запад, Центр, Восток - в одной строке
    [
      {
        text: getButtonText(LocationId.WEST),
        callback_data: `location_${LocationId.WEST}`
      },
      {
        text: getButtonText(LocationId.CENTER),
        callback_data: `location_${LocationId.CENTER}`
      },
      {
        text: getButtonText(LocationId.EAST),
        callback_data: `location_${LocationId.EAST}`
      }
    ],
    // Юг - отдельная строка
    [{
      text: getButtonText(LocationId.SOUTH),
      callback_data: `location_${LocationId.SOUTH}`
    }],
    // Подмосковье - отдельная строка
    [{
      text: getButtonText(LocationId.MOSCOW_REGION),
      callback_data: `location_${LocationId.MOSCOW_REGION}`
    }],
    // Не важно - отдельная строка
    [{
      text: getButtonText(LocationId.ANY),
      callback_data: `location_${LocationId.ANY}`
    }],
    // Готово - отдельная строка
    [{ text: '✔️ Готово', callback_data: 'location_done' }]
  ];
}

/**
 * Получает доступные временные диапазоны на основе текущего времени
 * Если dateKey - сегодняшняя дата, фильтруем прошедшие диапазоны
 */
// Функция для получения московского часа (0-23)
// Использует Intl API для правильной работы независимо от часового пояса сервера
function getMoscowHour(): number {
  const now = new Date();
  const moscowHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      hour12: false
    }).format(now)
  );
  return moscowHour;
}

// Функция для получения московского времени (для обратной совместимости)
// Возвращает Date объект с московскими значениями, но getHours() будет работать неправильно
// Используйте getMoscowHour() для получения московского часа
function getMoscowTime(): Date {
  const now = new Date();
  // Получаем компоненты московского времени
  const moscowParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);
  
  const parts: { [key: string]: string } = {};
  moscowParts.forEach(part => {
    parts[part.type] = part.value;
  });
  
  // Создаем Date с московскими значениями
  // Внимание: getHours() этого объекта вернет час в локальном времени сервера, не московский!
  // Используйте getMoscowHour() для получения московского часа
  return new Date(
    parseInt(parts.year!),
    parseInt(parts.month!) - 1,
    parseInt(parts.day!),
    parseInt(parts.hour!),
    parseInt(parts.minute!),
    parseInt(parts.second!)
  );
}

/**
 * Форматирует московскую дату в формат YYYY-MM-DD
 * Использует правильное форматирование без конвертации в UTC
 */
function formatMoscowDateToYYYYMMDD(moscowDate: Date): string {
  // Используем Intl для получения правильной даты в московском часовом поясе
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(moscowDate);
}

function getAvailableTimeOptions(dateKey: string): typeof timeOptions {
  // Получаем сегодняшнюю дату в московском времени
  const now = new Date();
  const today = formatMoscowDateToYYYYMMDD(now);
  
  // Если это не сегодня, возвращаем все опции
  if (dateKey !== today) {
    return timeOptions;
  }
  
  // Если это сегодня, фильтруем прошедшие диапазоны по московскому времени
  const currentHour = getMoscowHour();
  
  return timeOptions.filter(opt => {
    if (opt.id === 'any') {
      return true; // "Не важно" всегда доступно
    }
    
    // Проверяем, что endHour определен
    if (opt.endHour === undefined) {
      return false;
    }
    
    // Проверяем, не прошел ли диапазон
    if (opt.endHour === 24) {
      // Вечер: доступен если текущий час < 24 (всегда доступен до конца дня)
      return currentHour < 24;
    } else {
      // Утро и День: доступны если текущий час < endHour
      return currentHour < opt.endHour;
    }
  });
}

// Генерация клавиатуры для выбора времени
function getTimeKeyboard(selectedTimeSlots: string[], availableOptions: typeof timeOptions = timeOptions): TelegramBot.InlineKeyboardButton[][] {
  return [
    ...availableOptions.map(opt => [{
      text: selectedTimeSlots.includes(opt.id) ? `✅ ${opt.label}` : opt.label,
      callback_data: `time_${opt.id}`
    }]),
    [{ text: '✔️ Готово', callback_data: 'time_done' }]
  ];
}

/**
 * Генерация клавиатуры с пагинацией и кнопкой "Выбрать другую дату"
 */
function getPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  sport: Sport,
  showFeedback: boolean = false
): TelegramBot.InlineKeyboardButton[][] {
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Кнопки пагинации
  if (totalPages > 1) {
    const paginationRow: TelegramBot.InlineKeyboardButton[] = [];
    
    if (currentPage > 1) {
      paginationRow.push({ text: '◀️ Назад', callback_data: `page_${currentPage - 1}` });
    }
    
    paginationRow.push({ text: `${currentPage}/${totalPages}`, callback_data: 'page_info' });
    
    if (currentPage < totalPages) {
      paginationRow.push({ text: 'Вперед ▶️', callback_data: `page_${currentPage + 1}` });
    }
    
    buttons.push(paginationRow);
  }
  
  // Кнопки обратной связи (только на первой странице при первом показе результатов)
  if (showFeedback && currentPage === 1) {
    buttons.push([
      { text: 'Спасибо 👍', callback_data: 'feedback_yes' },
      { text: 'Не помогло 👎', callback_data: 'feedback_no' }
    ]);
  }
  
  // Кнопка "Выбрать другую дату"
  buttons.push([{ text: '📅 Выбрать другую дату', callback_data: `select_another_date_${sport}` }]);
  
  return buttons;
}

/**
 * Создает клавиатуру с кнопками для случая, когда кортов не найдено на конкретное время
 */
function getNoCourtsFoundKeyboard(sport: Sport): TelegramBot.InlineKeyboardButton[][] {
  return [
    [{ text: '👇 Показать альтернативы', callback_data: `show_alternatives_${sport}` }],
    [{ text: '🔍 Изменить параметры"', callback_data: `select_another_date_${sport}` }]
  ];
}

// Обработка команды /start
async function handleStart(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || 'друг';
  
  await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: '🎾 Найти корт (теннис)' }],
        [{ text: '🏓 Найти корт (падел)' }],
        [{ text: '💬 Чат участников' }],
      ],
      resize_keyboard: true
    }
  });
}

// Обработка команды /help
async function handleHelp(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  
  await getBot().sendMessage(chatId, USER_TEXTS.HELP, { parse_mode: 'Markdown' });
}

// Обработка текстовых сообщений
async function handleMessage(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from?.id;

  // Проверяем команды
  if (text === '/start') {
    // Отслеживаем команду /start
    if (userId) {
      trackButtonClick({
        userId,
        userName: msg.from?.first_name || msg.from?.username || undefined,
        chatId,
        buttonType: 'command',
        buttonId: '/start',
        buttonLabel: '/start',
        sessionId: generateSessionId(userId),
        context: {
          command: 'start',
          username: msg.from?.username,
          languageCode: msg.from?.language_code,
        },
      }).catch(err => {
        console.error('Error tracking button click:', err);
      });
    }
    return handleStart(msg);
  }
  if (text === '/help') {
    // Отслеживаем команду /help
    if (userId) {
      trackButtonClick({
        userId,
        userName: msg.from?.first_name || msg.from?.username || undefined,
        chatId,
        buttonType: 'command',
        buttonId: '/help',
        buttonLabel: '/help',
        sessionId: generateSessionId(userId),
        context: {
          command: 'help',
          username: msg.from?.username,
          languageCode: msg.from?.language_code,
        },
      }).catch(err => {
        console.error('Error tracking button click:', err);
      });
    }
    return handleHelp(msg);
  }

  // Пропускаем другие команды
  if (text?.startsWith('/')) return;

  // Проверяем, это ответ на вопрос "Как к тебе обращаться?"
  if (msg.reply_to_message?.text === USER_TEXTS.ASK_NAME && userId && text) {
    // Сохраняем имя пользователя
    const profile = users.get(userId) || {};
    profile.name = text;
    users.set(userId, profile);

    // Задаём вопрос об уровне игры
    await getBot().sendMessage(chatId, USER_TEXTS.LEVELS_EXPLANATION(text), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎾 Новичок', callback_data: 'level_beginner' }],
          [{ text: '🙂 Играл(а) немного', callback_data: 'level_casual' }],
          [{ text: '🔥 Уверенный любитель', callback_data: 'level_intermediate' }],
          [{ text: '🏆 Сильный любитель', callback_data: 'level_advanced' }]
        ]
      }
    });
    return;
  }

  switch (text) {
    case '🎾 Найти корт (теннис)':
      // Отслеживаем клик на текстовую кнопку
      if (userId) {
        trackButtonClick({
          userId,
          userName: msg.from?.first_name || msg.from?.username || undefined,
          chatId,
          buttonType: 'text',
          buttonId: text,
          buttonLabel: text,
          sessionId: generateSessionId(userId),
          context: {
            command: 'find_tennis_court',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      await getBot().sendMessage(chatId, USER_TEXTS.DATE_SELECTION, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.TENNIS}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.TENNIS}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.TENNIS}` }]
          ]
        }
      });
      break;
    case '🏓 Найти корт (падел)':
      // Отслеживаем клик на текстовую кнопку
      if (userId) {
        trackButtonClick({
          userId,
          userName: msg.from?.first_name || msg.from?.username || undefined,
          chatId,
          buttonType: 'text',
          buttonId: text,
          buttonLabel: text,
          sessionId: generateSessionId(userId),
          context: {
            command: 'find_padel_court',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      await getBot().sendMessage(chatId, USER_TEXTS.DATE_SELECTION, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.PADEL}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.PADEL}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.PADEL}` }]
          ]
        }
      });
      break;
    case '💬 Чат участников':
      // Отслеживаем клик на текстовую кнопку
      if (userId) {
        trackButtonClick({
          userId,
          userName: msg.from?.first_name || msg.from?.username || undefined,
          chatId,
          buttonType: 'text',
          buttonId: text,
          buttonLabel: text,
          sessionId: generateSessionId(userId),
          context: {
            command: 'feedback',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      await getBot().sendMessage(chatId, USER_TEXTS.FEEDBACK);
      break;
    // case '👤 Профиль':
    //   await getBot().sendMessage(chatId, '👤 Как к тебе обращаться?', {
    //     reply_markup: {
    //       force_reply: true
    //     }
    //   });
    //   break;
  }
}

// Обработка callback query (для inline кнопок)
async function handleCallbackQuery(query: TelegramBot.CallbackQuery) {
  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId) return;

  // Проверяем, не обрабатывали ли мы уже этот callback query
  if (processedQueries.has(query.id)) {
    // Отвечаем на дубликат, но не обрабатываем его
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Помечаем query как обработанный
  processedQueries.add(query.id);

  // Отвечаем на callback query сразу, до любых долгих операций
  // Это важно, чтобы избежать ошибки "query is too old"
  await safeAnswerCallbackQuery(query.id);

  // Отслеживаем клик на кнопку (не блокируем выполнение)
  if (data) {
    const buttonInfo = parseButtonType(data);
    const buttonLabel = query.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find(btn => btn.callback_data === data)?.text;
    
    trackButtonClick({
      userId,
      userName: query.from.first_name || query.from.username || undefined,
      chatId,
      buttonType: 'callback',
      buttonId: data,
      buttonLabel,
      messageId: query.message?.message_id,
      sessionId: generateSessionId(userId),
      context: {
        buttonType: buttonInfo.type,
        buttonAction: buttonInfo.action,
        username: query.from.username,
        languageCode: query.from.language_code,
      },
    }).catch(err => {
      // Логируем ошибку, но не прерываем выполнение
      console.error('Error tracking button click:', err);
    });
  }

  // Обработка выбора уровня игры
  if (data?.startsWith('level_')) {
    const levels: Record<string, string> = {
      'level_beginner': '🎾 Новичок — беру ракетку 0–5 раз, почти не играл(а)',
      'level_casual': '🙂 Играл(а) немного — могу перекинуть мяч, играю время от времени',
      'level_intermediate': '🔥 Уверенный любитель — подача, розыгрыши, играю ≈1 раз в неделю',
      'level_advanced': '🏆 Сильный любитель — регулярные тренировки / турниры'
    };

    const profile = users.get(userId) || {};
    profile.level = data;
    profile.districts = []; // Инициализируем пустой выбор районов
    users.set(userId, profile);

    const levelText = levels[data] || data;
    
    // Сообщение об уровне
    await getBot().sendMessage(chatId, USER_TEXTS.LEVEL_SELECTED(levelText));
    
    // Переходим к выбору районов
    await getBot().sendMessage(chatId, USER_TEXTS.DISTRICT_SELECTION, {
      reply_markup: {
        inline_keyboard: getDistrictKeyboard([])
      }
    });
    return;
  }

  // Обработка выбора локаций
  if (data?.startsWith('location_')) {
    const searchState = searchStates.get(userId);
    if (!searchState) {
      await getBot().sendMessage(chatId, USER_TEXTS.ERROR_SESSION_EXPIRED);
      return;
    }
    
    const locationId = data.replace('location_', '');
    
    // Кнопка "Готово"
    if (locationId === 'done') {
      if (searchState.selectedLocations.length === 0) {
        await safeAnswerCallbackQuery(query.id, { text: USER_TEXTS.VALIDATION_LOCATION_REQUIRED });
        return;
      }
      
      // Загружаем слоты для выбранной даты
      const slotsData = await loadSlots(searchState.sport, searchState.date);
      if (!slotsData) {
        await getBot().sendMessage(chatId, USER_TEXTS.ERROR_LOAD_SLOTS);
        searchStates.delete(userId);
        return;
      }
      
      // Получаем слоты на выбранную дату
      const siteSlots = getSlotsByDate(slotsData, searchState.date);
      
      // Фильтруем по локациям
      const filteredByLocation = filterSlotsByLocation(siteSlots, searchState.selectedLocations, searchState.sport);
      
      // Фильтруем по времени
      const filteredSlots = sortSlotsByPriority(
        filterSlotsByTime(filteredByLocation, searchState.selectedTimeSlots),
        searchState.sport
      );
      
      // Форматируем и отправляем сообщение
      const emoji = searchState.sport === SportType.PADEL ? '🏓' : '🎾';
      await safeEditMessageText(
        USER_TEXTS.SEARCHING_COURTS(searchState.dateStr, emoji),
        { chat_id: chatId, message_id: query.message?.message_id }
      );
      
      // Проверяем, найдены ли корты
      if (filteredSlots.length === 0) {
        // Проверяем, были ли выбраны конкретные фильтры (не "any")
        const hasSpecificLocation = !searchState.selectedLocations.includes('any');
        const hasSpecificTime = !searchState.selectedTimeSlots.includes('any');
        
        if (hasSpecificLocation || hasSpecificTime) {
          // Пробуем показать все варианты без фильтров
          const allSlots = getSlotsByDate(slotsData, searchState.date);
          const allSlotsWithoutLocationFilter = filterSlotsByLocation(allSlots, ['any'], searchState.sport);
          const allSlotsWithoutFilters = sortSlotsByPriority(
            filterSlotsByTime(allSlotsWithoutLocationFilter, ['any']),
            searchState.sport
          );
          
          if (allSlotsWithoutFilters.length > 0) {
            // Сохраняем альтернативные варианты для последующего показа
            const pageSize = 5;
            const totalPages = Math.ceil(allSlotsWithoutFilters.length / pageSize);
            
            searchState.siteSlots = allSlotsWithoutFilters;
            searchState.lastUpdated = slotsData.lastUpdated;
            searchState.currentPage = 1;
            searchState.totalPages = totalPages;
            searchStates.set(userId, searchState);
            
            // Показываем сообщение NO_COURTS_FOUND с кнопками
            const message = USER_TEXTS.NO_COURTS_FOUND(searchState.dateStr);
            const messageId = query.message?.message_id;
            
            if (messageId) {
              await safeEditMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: getNoCourtsFoundKeyboard(searchState.sport)
                }
              });
            } else {
              await getBot().sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: getNoCourtsFoundKeyboard(searchState.sport)
                }
              });
            }
          } else {
            // Даже без фильтров ничего нет
            const errorMessage = USER_TEXTS.NO_COURTS_ANY_DATE;
            const messageId = query.message?.message_id;
            if (messageId) {
              await safeEditMessageText(errorMessage, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
              });
            } else {
              await getBot().sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
            }
          }
        } else {
          // Фильтры были "any", но ничего не найдено
          const errorMessage = USER_TEXTS.NO_COURTS_ANY_DATE;
          const messageId = query.message?.message_id;
          if (messageId) {
            await safeEditMessageText(errorMessage, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown'
            });
          } else {
            await getBot().sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
          }
        }
        } else {
          // Сохраняем данные для пагинации
          const pageSize = 5; // Количество кортов на странице
          const totalPages = Math.ceil(filteredSlots.length / pageSize);
          
          searchState.siteSlots = filteredSlots;
          searchState.lastUpdated = slotsData.lastUpdated;
          searchState.currentPage = 1;
          searchState.totalPages = totalPages;
          searchStates.set(userId, searchState);
          
          // Форматируем первую страницу
          const message = formatSlotsPage(
            searchState.dateStr,
            filteredSlots,
            searchState.sport,
            1,
            pageSize,
            slotsData.lastUpdated
          );
          
          const messageId = query.message?.message_id;
          
          // Отправляем сообщение с пагинацией
          if (messageId) {
            await safeEditMessageText(message, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: getPaginationKeyboard(1, totalPages, searchState.sport, true)
              }
            });
          } else {
            await getBot().sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: getPaginationKeyboard(1, totalPages, searchState.sport, true)
              }
            });
          }
        }
      
      // Не очищаем состояние поиска, чтобы пагинация работала
      return;
    }
    
    // Логика мультиселекта
    const selected = searchState.selectedLocations;
    
    if (locationId === 'any') {
      // "Не важно" - сбрасываем остальные
      if (selected.includes('any')) {
        searchState.selectedLocations = [];
      } else {
        searchState.selectedLocations = ['any'];
      }
    } else {
      // Обычная локация - убираем "Не важно" если был
      const withoutAny = selected.filter(l => l !== 'any');
      
      if (withoutAny.includes(locationId)) {
        searchState.selectedLocations = withoutAny.filter(l => l !== locationId);
      } else {
        searchState.selectedLocations = [...withoutAny, locationId];
      }
    }
    
    searchStates.set(userId, searchState);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: await getLocationKeyboard(searchState.selectedLocations, searchState) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка выбора времени
  if (data?.startsWith('time_')) {
    const searchState = searchStates.get(userId);
    if (!searchState) {
      await getBot().sendMessage(chatId, USER_TEXTS.ERROR_SESSION_EXPIRED);
      return;
    }
    
    const timeId = data.replace('time_', '');
    
    // Кнопка "Готово"
    if (timeId === 'done') {
      if (searchState.selectedTimeSlots.length === 0) {
        await safeAnswerCallbackQuery(query.id, { text: USER_TEXTS.VALIDATION_TIME_REQUIRED });
        return;
      }
      
      // Показываем выбор локации
      await safeEditMessageText(USER_TEXTS.LOCATION_SELECTION, {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: await getLocationKeyboard([], searchState)
        }
      });
      return;
    }
    
    // Логика мультиселекта
    const selected = searchState.selectedTimeSlots;
    
    if (timeId === 'any') {
      // "Не важно" - сбрасываем остальные
      if (selected.includes('any')) {
        searchState.selectedTimeSlots = [];
      } else {
        searchState.selectedTimeSlots = ['any'];
      }
    } else {
      // Обычное время - убираем "Не важно" если был
      const withoutAny = selected.filter(t => t !== 'any');
      
      if (withoutAny.includes(timeId)) {
        searchState.selectedTimeSlots = withoutAny.filter(t => t !== timeId);
      } else {
        searchState.selectedTimeSlots = [...withoutAny, timeId];
      }
    }
    
    searchStates.set(userId, searchState);
    
    // Получаем доступные временные диапазоны для обновления клавиатуры
    const availableTimeOptions = getAvailableTimeOptions(searchState.date);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getTimeKeyboard(searchState.selectedTimeSlots, availableTimeOptions) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка выбора районов
  if (data?.startsWith('district_')) {
    const profile = users.get(userId) || {};
    const selected = profile.districts || [];
    const districtId = data.replace('district_', '');

    // Кнопка "Готово"
    if (districtId === 'done') {
      if (selected.length === 0) {
        await safeAnswerCallbackQuery(query.id, { text: USER_TEXTS.VALIDATION_DISTRICT_REQUIRED });
        return;
      }

      const selectedLabels = selected.map(id => 
        districtOptions.find(opt => opt.id === id)?.label
      ).filter(Boolean);

      // Первое сообщение - редактируем текущее
      await safeEditMessageText(
        USER_TEXTS.DISTRICT_SELECTED(selectedLabels.join(', ')),
        { chat_id: chatId, message_id: query.message?.message_id }
      );

      // Второе сообщение с кнопками
      await getBot().sendMessage(chatId, USER_TEXTS.PROFILE_SAVED,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎾 Найти корт для тенниса', callback_data: 'action_find_court' }],
              [{ text: '🏠 Вернуться на главную', callback_data: 'action_home' }]
            ]
          }
        }
      );
      return;
    }

    // Логика мультиселекта
    if (districtId === 'any') {
      // "Не важно" - сбрасываем остальные
      if (selected.includes('any')) {
        profile.districts = [];
      } else {
        profile.districts = ['any'];
      }
    } else {
      // Обычный район - убираем "Не важно" если был
      const withoutAny = selected.filter(d => d !== 'any');
      
      if (withoutAny.includes(districtId)) {
        profile.districts = withoutAny.filter(d => d !== districtId);
      } else {
        profile.districts = [...withoutAny, districtId];
      }
    }

    users.set(userId, profile);

    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getDistrictKeyboard(profile.districts || []) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Кнопка "Найти корт" из inline меню (по умолчанию теннис)
  if (data === 'action_find_court') {
    const messageId = query.message?.message_id;
    if (messageId) {
        await safeEditMessageText(USER_TEXTS.DATE_SELECTION, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.TENNIS}` }],
              [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.TENNIS}` }],
              [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.TENNIS}` }]
            ]
          }
        });
      } else {
        // Fallback на sendMessage, если message_id недоступен
        await getBot().sendMessage(chatId, USER_TEXTS.DATE_SELECTION, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.TENNIS}` }],
              [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.TENNIS}` }],
              [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.TENNIS}` }]
            ]
          }
        });
    }
    return;
  }

  // Обработка навигации по неделям
  if (data?.startsWith('week_prev_') || data?.startsWith('week_next_')) {
    const isPrev = data.startsWith('week_prev_');
    const prefix = isPrev ? 'week_prev_' : 'week_next_';
    const rest = data.replace(prefix, '');
    const parts = rest.split('_');
    const currentPageOffset = parseInt(parts[0]) || 0;
    const sport = parts[1] === SportType.PADEL ? SportType.PADEL : SportType.TENNIS;
    
    // Для падела навигация по неделям недоступна - только одна неделя
    if (sport === SportType.PADEL) {
      await safeAnswerCallbackQuery(query.id, { text: 'Для падела доступна только одна неделя' });
      return;
    }
    
    const newPageOffset = isPrev ? currentPageOffset - 1 : currentPageOffset + 1;
    
    const datesToShow = getDatesForWeekRange(newPageOffset);
    
    // Добавляем sport к callback_data для каждой даты
    const dateButtons = datesToShow.map(date => ({
      text: formatDateButton(date),
      callback_data: `date_pick_${date}_${sport}`
    }));
    
    // Распределяем кнопки по рядам (по 3 кнопки в ряд)
    const rows: TelegramBot.InlineKeyboardButton[][] = [];
    const buttonsPerRow = 3;
    
    for (let i = 0; i < dateButtons.length; i += buttonsPerRow) {
      rows.push(dateButtons.slice(i, i + buttonsPerRow));
    }
    
    // Добавляем кнопки навигации (только для тенниса)
    // На странице 0 (первая страница) показываем только кнопку "Следующая неделя"
    // На странице 1 (вторая страница) показываем только кнопку "Предыдущая неделя"
    if (newPageOffset === 0) {
      // Первая страница - только кнопка "Следующая неделя"
      rows.push([{
        text: 'Следующая неделя ▶️',
        callback_data: `week_next_${newPageOffset}_${sport}`
      }]);
    } else if (newPageOffset === 1) {
      // Вторая страница - только кнопка "Предыдущая неделя"
      rows.push([{
        text: '◀️ Предыдущая неделя',
        callback_data: `week_prev_${newPageOffset}_${sport}`
      }]);
    }
    
    // Редактируем сообщение с выбором даты
    const messageId = query.message?.message_id;
    if (messageId) {
        try {
        await safeEditMessageText(USER_TEXTS.DATE_PICKER, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: rows
          }
        });
        await safeAnswerCallbackQuery(query.id);
      } catch (error) {
        console.error('Error editing message:', error);
        await safeAnswerCallbackQuery(query.id, { text: USER_TEXTS.ERROR_UPDATE_MESSAGE });
      }
    } else {
      await safeAnswerCallbackQuery(query.id, { text: USER_TEXTS.ERROR_NO_MESSAGE_ID });
    }
    return;
  }

  // Обработка выбора конкретной даты из date picker
  if (data?.startsWith('date_pick_')) {
    const parts = data.replace('date_pick_', '').split('_');
    const dateKey = parts[0];
    const sport = parts[1] === SportType.PADEL ? SportType.PADEL : SportType.TENNIS;
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    // Сохраняем состояние поиска
    searchStates.set(userId, {
      date: dateKey,
      dateStr: dateStr,
      sport: sport,
      selectedLocations: [],
      selectedTimeSlots: []
    });
    
    // Получаем доступные временные диапазоны
    const availableTimeOptions = getAvailableTimeOptions(dateKey);
    
    // Проверяем, является ли выбранная дата сегодняшней
    const moscowNow = getMoscowTime();
    const today = formatMoscowDateToYYYYMMDD(moscowNow);
    const isToday = dateKey === today;
    
    // Фильтруем опции, исключая "Не важно" для проверки
    const timeOptionsWithoutAny = availableTimeOptions.filter(opt => opt.id !== 'any');
    
    // Если это сегодня и остался только один временной диапазон, автоматически выбираем его
    // Для будущих дат всегда будут все диапазоны, поэтому проверка не нужна
    if (isToday && timeOptionsWithoutAny.length === 1) {
      // Автоматически выбираем единственный доступный временной диапазон
      const searchState = searchStates.get(userId);
      if (searchState) {
        searchState.selectedTimeSlots = [timeOptionsWithoutAny[0].id];
        searchStates.set(userId, searchState);
        
        await getBot().sendMessage(chatId, USER_TEXTS.LOCATION_SELECTION, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: await getLocationKeyboard([], searchState)
          }
        });
      }
    } else {
      // Показываем выбор времени
      await getBot().sendMessage(chatId, USER_TEXTS.TIME_SELECTION, {
        reply_markup: {
          inline_keyboard: getTimeKeyboard([], availableTimeOptions)
        }
      });
    }
    return;
  }

  // Обработка выбора даты для поиска корта (теннис или падел)
  if (data?.startsWith('date_')) {
    const parts = data.replace('date_', '').split('_');
    const dateType = parts[0];
    const sport = parts[1] === SportType.PADEL ? SportType.PADEL : SportType.TENNIS;
    
    if (dateType === 'today') {
      // Используем московское время для правильного определения "сегодня"
      const moscowToday = getMoscowTime();
      moscowToday.setHours(0, 0, 0, 0);
      const dateStr = moscowToday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = formatMoscowDateToYYYYMMDD(moscowToday); // YYYY-MM-DD
      
      // Сохраняем состояние поиска
      const searchState: SearchState = {
        date: dateKey,
        dateStr: dateStr,
        sport: sport,
        selectedLocations: [],
        selectedTimeSlots: []
      };
      
      // Получаем доступные временные диапазоны
      const availableTimeOptions = getAvailableTimeOptions(dateKey);
      
      // Фильтруем опции, исключая "Не важно" для проверки
      const timeOptionsWithoutAny = availableTimeOptions.filter(opt => opt.id !== 'any');
      
      // Если остался только один временной диапазон, автоматически выбираем его
      if (timeOptionsWithoutAny.length === 1) {
        // Автоматически выбираем единственный доступный временной диапазон
        searchState.selectedTimeSlots = [timeOptionsWithoutAny[0].id];
        searchStates.set(userId, searchState);
        
        const messageId = query.message?.message_id;
        if (messageId) {
          await safeEditMessageText(USER_TEXTS.LOCATION_SELECTION, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: await getLocationKeyboard([], searchState)
            }
          });
        } else {
          await getBot().sendMessage(chatId, USER_TEXTS.LOCATION_SELECTION, {
            reply_markup: {
              inline_keyboard: await getLocationKeyboard([], searchState)
            }
          });
        }
      } else {
        // Сохраняем состояние поиска перед показом выбора времени
        searchStates.set(userId, searchState);
        
        // Редактируем сообщение с выбором времени
        const messageId = query.message?.message_id;
        if (messageId) {
          await safeEditMessageText(USER_TEXTS.TIME_SELECTION, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: getTimeKeyboard([], availableTimeOptions)
            }
          });
        } else {
          // Fallback на sendMessage, если message_id недоступен
          await getBot().sendMessage(chatId, USER_TEXTS.TIME_SELECTION, {
            reply_markup: {
              inline_keyboard: getTimeKeyboard([], availableTimeOptions)
            }
          });
        }
      }
      
    } else if (dateType === 'tomorrow') {
      // Используем московское время для правильного определения "завтра"
      const moscowToday = getMoscowTime();
      moscowToday.setHours(0, 0, 0, 0);
      const tomorrow = new Date(moscowToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = formatMoscowDateToYYYYMMDD(tomorrow); // YYYY-MM-DD
      
      // Сохраняем состояние поиска
      const searchState: SearchState = {
        date: dateKey,
        dateStr: dateStr,
        sport: sport,
        selectedLocations: [],
        selectedTimeSlots: []
      };
      
      // Получаем доступные временные диапазоны (для завтра всегда все опции)
      const availableTimeOptions = getAvailableTimeOptions(dateKey);
      
      // Сохраняем состояние поиска перед показом выбора времени
      searchStates.set(userId, searchState);
      
      // Редактируем сообщение с выбором времени
      const messageId = query.message?.message_id;
      if (messageId) {
        await safeEditMessageText(USER_TEXTS.TIME_SELECTION, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: getTimeKeyboard([], availableTimeOptions)
          }
        });
      } else {
        // Fallback на sendMessage, если message_id недоступен
        await getBot().sendMessage(chatId, USER_TEXTS.TIME_SELECTION, {
          reply_markup: {
            inline_keyboard: getTimeKeyboard([], availableTimeOptions)
          }
        });
      }
      
    } else if (dateType === 'custom') {
      // Генерируем список доступных дат (не нужно загружать слоты)
      const availableDates = getAvailableDates();
      if (availableDates.length === 0) {
        const messageId = query.message?.message_id;
        if (messageId) {
          await safeEditMessageText(USER_TEXTS.ERROR_NO_DATES, {
            chat_id: chatId,
            message_id: messageId
          });
        } else {
          await getBot().sendMessage(chatId, USER_TEXTS.ERROR_NO_DATES);
        }
        return;
      }
      
      // Показываем первые 7 дней (pageOffset = 0)
      const pageOffset = 0;
      const datesToShow = getDatesForWeekRange(pageOffset);
      
      // Добавляем sport к callback_data для каждой даты
      const dateButtons = datesToShow.map(date => ({
        text: formatDateButton(date),
        callback_data: `date_pick_${date}_${sport}`
      }));
      
      // Распределяем кнопки по рядам (по 3 кнопки в ряд для лучшей читаемости)
      const rows: TelegramBot.InlineKeyboardButton[][] = [];
      const buttonsPerRow = 3;
      
      for (let i = 0; i < dateButtons.length; i += buttonsPerRow) {
        rows.push(dateButtons.slice(i, i + buttonsPerRow));
      }
      
      // Добавляем кнопки навигации
      // Для падела показываем только одну неделю (7 дней), для тенниса - две недели
      if (sport === SportType.TENNIS) {
        // На первой странице (pageOffset = 0) показываем только кнопку "Следующая неделя"
        const nextWeekDates = getDatesForWeekRange(pageOffset + 1);
        if (nextWeekDates.length > 0) {
          rows.push([{
            text: 'Следующая неделя ▶️',
            callback_data: `week_next_${pageOffset}_${sport}`
          }]);
        }
      }
      // Для падела не показываем кнопку навигации - только одна неделя
      
      // Редактируем сообщение с выбором даты
      const messageId = query.message?.message_id;
      if (messageId) {
        try {
        await safeEditMessageText(USER_TEXTS.DATE_PICKER, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: rows
            }
          });
        } catch (error) {
          // Если не удалось отредактировать сообщение, отправляем новое
          console.error('Error editing message, sending new one:', error);
          await getBot().sendMessage(chatId, USER_TEXTS.DATE_PICKER, {
            reply_markup: {
              inline_keyboard: rows
            }
          });
        }
      } else {
        // Fallback на sendMessage, если message_id недоступен
        await getBot().sendMessage(chatId, '📅 Выбери дату:', {
          reply_markup: {
            inline_keyboard: rows
          }
        });
      }
    }
    return;
  }

  // Обработка пагинации
  if (data?.startsWith('page_')) {
    const searchState = searchStates.get(userId);
    if (!searchState || !searchState.siteSlots) {
      await getBot().sendMessage(chatId, USER_TEXTS.ERROR_SESSION_EXPIRED);
      return;
    }
    
    // Игнорируем клик на кнопку "page_info" (информация о странице)
    if (data === 'page_info') {
      await safeAnswerCallbackQuery(query.id);
      return;
    }
    
    const page = parseInt(data.replace('page_', ''), 10);
    if (isNaN(page) || page < 1 || (searchState.totalPages && page > searchState.totalPages)) {
      await safeAnswerCallbackQuery(query.id);
      return;
    }
    
    // Определяем направление пагинации
    const currentPage = searchState.currentPage || 1;
    const direction = page > currentPage ? 'forward' : page < currentPage ? 'backward' : 'same';
    const buttonLabel = direction === 'forward' ? 'Вперед ▶️' : direction === 'backward' ? '◀️ Назад' : `${page}/${searchState.totalPages}`;
    
    // Отслеживаем клик на кнопку пагинации
    trackButtonClick({
      userId,
      userName: query.from.first_name || query.from.username || undefined,
      chatId,
      buttonType: 'callback',
      buttonId: data,
      buttonLabel,
      messageId: query.message?.message_id,
      sessionId: generateSessionId(userId),
      context: {
        buttonType: 'pagination',
        buttonAction: direction,
        pageFrom: currentPage,
        pageTo: page,
        totalPages: searchState.totalPages || 1,
        sport: searchState.sport,
        date: searchState.date,
        username: query.from.username,
        languageCode: query.from.language_code,
      },
    }).catch(err => {
      console.error('Error tracking pagination click:', err);
    });
    
    // Обновляем текущую страницу
    searchState.currentPage = page;
    searchStates.set(userId, searchState);
    
    // Форматируем страницу
    const pageSize = 5;
    const message = formatSlotsPage(
      searchState.dateStr,
      searchState.siteSlots,
      searchState.sport,
      page,
      pageSize,
      searchState.lastUpdated
    );
    
    // Обновляем сообщение
    const messageId = query.message?.message_id;
    if (messageId) {
      await safeEditMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: getPaginationKeyboard(page, searchState.totalPages || 1, searchState.sport)
        }
      });
    }
    
    return;
  }

  // Обработка кнопки "Показать альтернативы"
  if (data?.startsWith('show_alternatives_')) {
    const searchState = searchStates.get(userId);
    if (!searchState || !searchState.siteSlots || searchState.siteSlots.length === 0) {
      await getBot().sendMessage(chatId, USER_TEXTS.ERROR_SESSION_EXPIRED);
      return;
    }
    
    const pageSize = 5;
    const totalPages = searchState.totalPages || 1;
    const currentPage = 1;
    
    // Форматируем первую страницу альтернатив
    const message = formatSlotsPage(
      searchState.dateStr,
      searchState.siteSlots,
      searchState.sport,
      currentPage,
      pageSize,
      searchState.lastUpdated
    );
    
    const messageId = query.message?.message_id;
    
    if (messageId) {
      await safeEditMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: getPaginationKeyboard(currentPage, totalPages, searchState.sport)
        }
      });
    } else {
      await getBot().sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: getPaginationKeyboard(currentPage, totalPages, searchState.sport)
        }
      });
    }
    
    // Обновляем текущую страницу в состоянии
    searchState.currentPage = currentPage;
    searchStates.set(userId, searchState);
    
    return;
  }

  // Обработка кнопки "Выбрать другую дату"
  if (data?.startsWith('select_another_date_')) {
    const sport = data.replace('select_another_date_', '') === SportType.PADEL ? SportType.PADEL : SportType.TENNIS;
    
    const messageId = query.message?.message_id;
    if (messageId) {
      await safeEditMessageText(USER_TEXTS.DATE_SELECTION, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${sport}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${sport}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${sport}` }]
          ]
        }
      });
    } else {
      // Fallback на sendMessage, если message_id недоступен
      await getBot().sendMessage(chatId, USER_TEXTS.DATE_SELECTION, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${sport}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${sport}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${sport}` }]
          ]
        }
      });
    }
    return;
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    const profile = users.get(userId);
    const userName = profile?.name || query.from.first_name;
    
    await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '🎾 Найти корт (теннис)' }],
          [{ text: '🏓 Найти корт (падел)' }],
          [{ text: '💬 Чат участников' }]
          // [{ text: '👤 Профиль' }]
        ],
        resize_keyboard: true
      }
    });
    return;
  }

  // Обработка обратной связи
  if (data === 'feedback_yes') {
    // Отслеживаем клик на кнопку обратной связи
    const buttonLabel = query.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find(btn => btn.callback_data === data)?.text;
    
    trackButtonClick({
      userId,
      userName: query.from.first_name || query.from.username || undefined,
      chatId,
      buttonType: 'callback',
      buttonId: data,
      buttonLabel,
      messageId: query.message?.message_id,
      sessionId: generateSessionId(userId),
      context: {
        buttonType: 'feedback',
        buttonAction: 'positive',
        username: query.from.username,
        languageCode: query.from.language_code,
      },
    }).catch(err => {
      console.error('Error tracking feedback button click:', err);
    });
    
    await getBot().sendMessage(chatId, USER_TEXTS.FEEDBACK_YES);
    return;
  }

  if (data === 'feedback_no') {
    // Отслеживаем клик на кнопку обратной связи
    const buttonLabel = query.message?.reply_markup?.inline_keyboard
      ?.flat()
      .find(btn => btn.callback_data === data)?.text;
    
    trackButtonClick({
      userId,
      userName: query.from.first_name || query.from.username || undefined,
      chatId,
      buttonType: 'callback',
      buttonId: data,
      buttonLabel,
      messageId: query.message?.message_id,
      sessionId: generateSessionId(userId),
      context: {
        buttonType: 'feedback',
        buttonAction: 'negative',
        username: query.from.username,
        languageCode: query.from.language_code,
      },
    }).catch(err => {
      console.error('Error tracking feedback button click:', err);
    });
    
    await getBot().sendMessage(chatId, USER_TEXTS.FEEDBACK_NO);
    return;
  }

  console.log(`Callback: ${data}`);
}

/**
 * Cloud Function HTTP handler для Telegram Webhook
 */
export const telegramWebhook = async (req: CloudFunctionRequest, res: CloudFunctionResponse) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const update = req.body;

    // Обрабатываем сообщения
    if (update.message) {
      await handleMessage(update.message);
    }

    // Обрабатываем callback query (нажатия на inline кнопки)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing update:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Экспорт для Google Cloud Functions
export { telegramWebhook as playTodayBot };

// === Dev режим: запуск с polling ===
if (isDev) {
  console.log('🤖 Бот запущен в режиме polling (development)...');
  console.log('📝 Для остановки нажми Ctrl+C\n');

  const devBot = getBot();

  // Подключаем обработчики событий
  devBot.on('message', (msg) => {
    handleMessage(msg).catch(console.error);
  });

  devBot.on('callback_query', (query) => {
    handleCallbackQuery(query).catch(console.error);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Останавливаю бота...');
    devBot.stopPolling();
    process.exit(0);
  });
}
