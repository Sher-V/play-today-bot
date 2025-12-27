import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';
import { Storage } from '@google-cloud/storage';
import { Firestore, Timestamp } from '@google-cloud/firestore';
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
  TennisSiteId,
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
import { getCourtPrice } from './utils/config-utils';

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

// Интерфейс профиля пользователя
interface UserProfile {
  name?: string;
  level?: string;
  districts?: string[];
  favorites?: string[]; // Массив ID избранных кортов
  updatedAt?: Date;
}

// Инициализация Firestore
const firestore = new Firestore();

// Коллекция пользователей в Firestore
const USERS_COLLECTION = 'users';

// Коллекция переуступок в Firestore
const TRANSFERS_COLLECTION = 'transfers';

/**
 * Получает профиль пользователя из Firestore
 */
async function getUserProfile(userId: number): Promise<UserProfile | null> {
  try {
    const userDoc = await firestore.collection(USERS_COLLECTION).doc(userId.toString()).get();
    if (!userDoc.exists) {
      return null;
    }
    return userDoc.data() as UserProfile;
  } catch (error) {
    console.error(`Ошибка получения профиля пользователя ${userId}:`, error);
    return null;
  }
}

/**
 * Сохраняет профиль пользователя в Firestore
 */
async function saveUserProfile(userId: number, profile: UserProfile): Promise<boolean> {
  try {
    profile.updatedAt = new Date();
    await firestore.collection(USERS_COLLECTION).doc(userId.toString()).set(profile, { merge: true });
    return true;
  } catch (error) {
    console.error(`Ошибка сохранения профиля пользователя ${userId}:`, error);
    return false;
  }
}

/**
 * Обновляет избранные корты пользователя
 */
async function updateUserFavorites(userId: number, favorites: string[]): Promise<boolean> {
  try {
    const profile = await getUserProfile(userId) || {};
    profile.favorites = favorites;
    return await saveUserProfile(userId, profile);
  } catch (error) {
    console.error(`Ошибка обновления избранных кортов для пользователя ${userId}:`, error);
    return false;
  }
}

/**
 * Обрабатывает запрос на просмотр избранных кортов
 */
async function handleFavoritesRequest(chatId: number, userId: number): Promise<void> {
  // Проверяем, есть ли у пользователя избранные корты
  const userProfile = userId ? await getUserProfile(userId) : null;
  const favoriteCourts = userProfile?.favorites || [];
  
  if (favoriteCourts.length === 0) {
    // Нет избранных кортов - показываем предложение добавить
    await getBot().sendMessage(
      chatId,
      'Избранные корты — твой быстрый доступ к любимым площадкам.\n\n' +
      '• в 1 клик будешь видеть ближайшие слоты только по ним\n' +
      '• в общем поиске они будут вверху списка\n\n' +
      'Добавим?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Выбрать избранные', callback_data: 'favorites_select' }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }]
          ]
        }
      }
    );
  } else {
    // Есть избранные корты - сразу показываем ближайшие слоты
    await getBot().sendMessage(
      chatId,
      '🔍 Ищу ближайшие свободные слоты по твоим избранным кортам...'
    );
    
    // Получаем даты на 3 дня вперед
    const moscowToday = getMoscowTime();
    moscowToday.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    const dateStrs: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      const date = new Date(moscowToday);
      date.setDate(date.getDate() + i);
      const dateKey = formatMoscowDateToYYYYMMDD(date);
      const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      dates.push(dateKey);
      dateStrs.push(dateStr);
    }
    
    // Собираем слоты по кортам (группировка по кортам, а не по датам)
    const courtsData: Map<string, Array<{ date: string; dateKey: string; slots: Slot[] }>> = new Map();
    let lastUpdatedTime: string | undefined = undefined;
    
    for (let i = 0; i < dates.length; i++) {
      const dateKey = dates[i];
      const dateStr = dateStrs[i];
      
      const slotsData = await loadSlots(SportType.TENNIS, dateKey);
      if (slotsData) {
        // Сохраняем время обновления (берем самое свежее)
        if (slotsData.lastUpdated && (!lastUpdatedTime || slotsData.lastUpdated > lastUpdatedTime)) {
          lastUpdatedTime = slotsData.lastUpdated;
        }
        
        // Получаем слоты на дату
        let siteSlots = getSlotsByDate(slotsData, dateKey);
        
        // Фильтруем только по избранным кортам
        siteSlots = siteSlots.filter(({ siteName }) => favoriteCourts.includes(siteName));
        
        // Добавляем слоты в структуру по кортам
        for (const { siteName, slots } of siteSlots) {
          if (!courtsData.has(siteName)) {
            courtsData.set(siteName, []);
          }
          courtsData.get(siteName)!.push({
            date: dateStr,
            dateKey: dateKey,
            slots: slots
          });
        }
      }
    }
    
    if (courtsData.size === 0) {
      await getBot().sendMessage(
        chatId,
        '⭐ На ближайшие 3 дня по твоим избранным кортам свободных слотов не найдено.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: `favorites_date_custom` }]
            ]
          }
        }
      );
    } else {
      // Сортируем корты по приоритету
      const sortedCourts = Array.from(courtsData.entries()).sort(([siteNameA], [siteNameB]) => {
        const aHasMetro = !!TENNIS_COURT_METRO[siteNameA];
        const bHasMetro = !!TENNIS_COURT_METRO[siteNameB];
        const aIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameA] || []).includes('moscow-region');
        const bIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameB] || []).includes('moscow-region');
        
        if (aHasMetro && !bHasMetro) return -1;
        if (!aHasMetro && bHasMetro) return 1;
        if (aIsMoscowRegion && !bIsMoscowRegion) return 1;
        if (!aIsMoscowRegion && bIsMoscowRegion) return -1;
        return 0;
      });
      
      const sortedCourtsData = new Map(sortedCourts);
      // Передаем явный диапазон дат для корректного отображения "ближайшие 3 дня"
      const message = formatFavoriteCourtsSlots(
        sortedCourtsData, 
        lastUpdatedTime,
        undefined, // singleDateStr
        dates[0], // dateRangeStart - первая дата диапазона (сегодня)
        dates[dates.length - 1] // dateRangeEnd - последняя дата диапазона (через 2 дня от сегодня)
      );
      
      await getBot().sendMessage(
        chatId,
        message,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: `favorites_date_custom` }]
            ]
          }
        }
      );
    }
  }
}

/**
 * Отображает все активные переуступки с пагинацией
 */
async function handleShowAllTransfers(chatId: number, userId: number, page: number = 1, pageSize: number = 10): Promise<void> {
  // Получаем все активные переуступки из Firestore
  const allTransfers = await getAllActiveTransfers();
  
  if (allTransfers.length === 0) {
    // Нет предложений - показываем кнопку разместить
    await getBot().sendMessage(chatId, 'Пока нет активных предложений. Будь первым!', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Разместить своё предложение', callback_data: 'transfer_create' }]
        ]
      }
    });
    return;
  }
  
  // Вычисляем пагинацию
  const totalPages = Math.ceil(allTransfers.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allTransfers.length);
  const pageTransfers = allTransfers.slice(startIndex, endIndex);
  
  // Формируем текст сообщения
  let message = '🔥 Горячие предложения:\n\n';
  pageTransfers.forEach((transfer, idx) => {
    const num = startIndex + idx + 1;
    message += `${num}. ${transfer.text}\n\n`;
  });
  
  if (totalPages > 1) {
    message += `\nСтраница ${page} из ${totalPages}`;
  }
  
  // Формируем клавиатуру
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Кнопки пагинации
  if (totalPages > 1) {
    const navButtons: TelegramBot.InlineKeyboardButton[] = [];
    if (page > 1) {
      navButtons.push({ text: '◀️', callback_data: `transfer_page_${page - 1}` });
    }
    if (page < totalPages) {
      navButtons.push({ text: '▶️', callback_data: `transfer_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }
  }
  
  // Кнопка разместить предложение
  keyboard.push([{ text: '➕ Разместить своё предложение', callback_data: 'transfer_create' }]);
  
  // Если у пользователя есть активные переуступки, добавляем кнопки управления
  const userTransfers = await getUserTransfers(userId, true);
  if (userTransfers.length > 0) {
    keyboard.push(
      [{ text: '❌ Отменить', callback_data: 'transfer_cancel' }, { text: '✏️ Изменить', callback_data: 'transfer_edit' }],
      [{ text: '📋 Мои предложения', callback_data: 'transfer_my' }]
    );
  }
  
  await getBot().sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

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

// Структура для переуступок кортов
interface CourtTransfer {
  userId: number;
  text: string;
  createdAt: Date | Timestamp;
  isActive: boolean;
  id?: string; // ID документа в Firestore
}

// Состояние ожидания ввода переуступки (временное, в памяти)
const waitingForTransfer = new Set<number>();

/**
 * Сохраняет переуступку в Firestore
 */
async function saveTransfer(userId: number, text: string): Promise<string | null> {
  try {
    const transferData = {
      userId,
      text,
      createdAt: Timestamp.now(), // Используем Timestamp для корректной работы с Firestore
      isActive: true
    };
    
    const docRef = await firestore.collection(TRANSFERS_COLLECTION).add(transferData);
    return docRef.id;
  } catch (error) {
    console.error(`Ошибка сохранения переуступки для пользователя ${userId}:`, error);
    if (error instanceof Error) {
      console.error('Детали ошибки:', error.message, error.stack);
    }
    return null;
  }
}

/**
 * Получает все активные переуступки пользователя из Firestore
 */
async function getUserTransfers(userId: number, activeOnly: boolean = false): Promise<CourtTransfer[]> {
  try {
    let query = firestore.collection(TRANSFERS_COLLECTION)
      .where('userId', '==', userId);
    
    if (activeOnly) {
      query = query.where('isActive', '==', true);
    }
    
    const snapshot = await query.get();
    const transfers: CourtTransfer[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      // Правильно обрабатываем Timestamp из Firestore
      let createdAt: Date | Timestamp;
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAt = data.createdAt.toDate();
      } else if (data.createdAt instanceof Timestamp) {
        createdAt = data.createdAt.toDate();
      } else if (data.createdAt instanceof Date) {
        createdAt = data.createdAt;
      } else {
        createdAt = new Date();
      }
      
      transfers.push({
        userId: data.userId,
        text: data.text,
        isActive: data.isActive === true,
        id: doc.id,
        createdAt
      } as CourtTransfer);
    });
    
    return transfers;
  } catch (error) {
    console.error(`Ошибка получения переуступок пользователя ${userId}:`, error);
    if (error instanceof Error) {
      console.error('Детали ошибки:', error.message, error.stack);
    }
    return [];
  }
}

/**
 * Получает все активные переуступки всех пользователей из Firestore
 */
async function getAllActiveTransfers(): Promise<CourtTransfer[]> {
  try {
    // Сначала получаем все активные переуступки без orderBy (чтобы не требовать индекс)
    const snapshot = await firestore.collection(TRANSFERS_COLLECTION)
      .where('isActive', '==', true)
      .get();
    
    const transfers: CourtTransfer[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      // Правильно обрабатываем Timestamp из Firestore
      let createdAt: Date | Timestamp;
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAt = data.createdAt.toDate();
      } else if (data.createdAt instanceof Timestamp) {
        createdAt = data.createdAt.toDate();
      } else if (data.createdAt instanceof Date) {
        createdAt = data.createdAt;
      } else {
        createdAt = new Date();
      }
      
      transfers.push({
        userId: data.userId,
        text: data.text,
        isActive: data.isActive === true,
        id: doc.id,
        createdAt
      } as CourtTransfer);
    });
    
    // Сортируем в памяти по дате создания (новые первыми)
    transfers.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 
                    (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0);
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 
                    (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0);
      return dateB - dateA; // Сортировка по убыванию (новые первыми)
    });
    
    return transfers;
  } catch (error) {
    console.error('Ошибка получения всех активных переуступок:', error);
    // Логируем детали ошибки для отладки
    if (error instanceof Error) {
      console.error('Детали ошибки:', error.message, error.stack);
    }
    return [];
  }
}

/**
 * Отменяет все активные переуступки пользователя
 */
async function cancelUserTransfers(userId: number): Promise<boolean> {
  try {
    const activeTransfers = await getUserTransfers(userId, true);
    
    if (activeTransfers.length === 0) {
      return false;
    }
    
    const batch = firestore.batch();
    for (const transfer of activeTransfers) {
      if (transfer.id) {
        const ref = firestore.collection(TRANSFERS_COLLECTION).doc(transfer.id);
        batch.update(ref, { isActive: false });
      }
    }
    
    await batch.commit();
    return true;
  } catch (error) {
    console.error(`Ошибка отмены переуступок пользователя ${userId}:`, error);
    return false;
  }
}

/**
 * Отменяет конкретную переуступку по ID
 */
async function cancelTransferById(transferId: string): Promise<boolean> {
  try {
    const ref = firestore.collection(TRANSFERS_COLLECTION).doc(transferId);
    await ref.update({ isActive: false });
    return true;
  } catch (error) {
    console.error(`Ошибка отмены переуступки ${transferId}:`, error);
    return false;
  }
}

/**
 * Парсит текст предложения и извлекает информацию для отображения
 */
function parseTransferText(text: string): { court: string; date: string; time: string } {
  // Формат: "Название корта, покрытие, дата, время, длительность, цена, как связаться"
  // Пример: "Спартак, хард, 23.12, 18:00, 1 час, 1800, @play_today_chat)"
  
  const parts = text.split(',').map(p => p.trim());
  
  const court = parts[0] || 'Корт';
  const date = parts[2] || '';
  const time = parts[3] || '';
  
  return { court, date, time };
}

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
 * 1. Сначала избранные корты (если переданы)
 * 2. Затем корты с метро
 * 3. В конце корты из moscow-region
 */
function sortSlotsByPriority(
  siteSlots: { siteName: string; slots: Slot[] }[],
  sport: Sport,
  favoriteCourts: string[] = []
): { siteName: string; slots: Slot[] }[] {
  const COURT_METRO = sport === SportType.PADEL ? PADEL_COURT_METRO : TENNIS_COURT_METRO;
  const COURT_LOCATIONS = sport === SportType.PADEL ? PADEL_COURT_LOCATIONS : TENNIS_COURT_LOCATIONS;
  
  return [...siteSlots].sort((a, b) => {
    const aIsFavorite = favoriteCourts.includes(a.siteName);
    const bIsFavorite = favoriteCourts.includes(b.siteName);
    
    // Избранные корты идут первыми
    if (aIsFavorite && !bIsFavorite) {
      return -1;
    }
    if (!aIsFavorite && bIsFavorite) {
      return 1;
    }
    
    // Если оба избранные или оба не избранные, применяем обычную сортировку
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
 * Форматирует дату в формат "17 дек"
 */
function formatDateShort(dateKey: string): string {
  const date = new Date(dateKey);
  const day = date.getDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${day} ${months[date.getMonth()]}`;
}

/**
 * Форматирует слоты избранных кортов в новый формат (группировка по кортам)
 */
/**
 * Определяет частоту обновления данных на основе типа спорта и даты
 */
function getUpdateFrequency(sport: Sport, dateKey?: string): string {
  if (sport === SportType.TENNIS) {
    return 'каждые 20 минут';
  }
  
  // Для падела определяем неделю на основе даты
  if (sport === SportType.PADEL && dateKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateKey);
    targetDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 0 && daysDiff < 7) {
      return 'раз в час';
    } else if (daysDiff >= 7 && daysDiff < 14) {
      return 'раз в сутки';
    }
  }
  
  // По умолчанию для падела - раз в час (первая неделя)
  if (sport === SportType.PADEL) {
    return 'раз в час';
  }
  
  return 'каждые 20 минут';
}

function formatFavoriteCourtsSlots(
  courtsData: Map<string, Array<{ date: string; dateKey: string; slots: Slot[] }>>,
  lastUpdated: string | undefined,
  singleDateStr?: string, // Если указана одна дата, показываем её в заголовке
  dateRangeStart?: string, // Дата начала диапазона (YYYY-MM-DD) для корректного отображения "ближайшие 3 дня"
  dateRangeEnd?: string, // Дата конца диапазона (YYYY-MM-DD)
  sport: Sport = SportType.TENNIS // Тип спорта для определения частоты обновления
): string {
  let message = '';
  
  const emoji = sport === SportType.PADEL ? '🏓' : '🎾';
  
  // Если указана одна дата, показываем её в заголовке
  if (singleDateStr) {
    message = `${emoji} *Ниже показаны слоты на ${singleDateStr}*`;
  } else {
    // Формируем заголовок с диапазоном дат
    let dateRangeText = '';
    
    // Если передан явный диапазон дат, используем его
    if (dateRangeStart && dateRangeEnd) {
      const firstDate = new Date(dateRangeStart);
      const lastDate = new Date(dateRangeEnd);
      
      const firstDay = firstDate.getDate();
      const firstMonth = firstDate.getMonth();
      const lastDay = lastDate.getDate();
      const lastMonth = lastDate.getMonth();
      
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      
      if (firstMonth === lastMonth) {
        // Один месяц: "18-20 декабря"
        dateRangeText = `${firstDay}-${lastDay} ${months[firstMonth]}`;
      } else {
        // Разные месяцы: "18 декабря - 2 января"
        dateRangeText = `${firstDay} ${months[firstMonth]} - ${lastDay} ${months[lastMonth]}`;
      }
    } else {
      // Иначе формируем диапазон из фактических дат в данных
      const allDateKeys = new Set<string>();
      for (const datesData of courtsData.values()) {
        for (const { dateKey } of datesData) {
          allDateKeys.add(dateKey);
        }
      }
      
      // Сортируем даты
      const sortedDates = Array.from(allDateKeys).sort();
      
      if (sortedDates.length > 0) {
        const firstDate = new Date(sortedDates[0]);
        const lastDate = new Date(sortedDates[sortedDates.length - 1]);
        
        const firstDay = firstDate.getDate();
        const firstMonth = firstDate.getMonth();
        const lastDay = lastDate.getDate();
        const lastMonth = lastDate.getMonth();
        
        const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        
        if (firstMonth === lastMonth) {
          // Один месяц: "18-20 декабря"
          dateRangeText = `${firstDay}-${lastDay} ${months[firstMonth]}`;
        } else {
          // Разные месяцы: "18 декабря - 2 января"
          dateRangeText = `${firstDay} ${months[firstMonth]} - ${lastDay} ${months[lastMonth]}`;
        }
      }
    }
    
    message = `${emoji} *Ниже показаны слоты на ближайшие 3 дня (${dateRangeText})*`;
  }
  
  message += '\n\n';
  
  // Итерируемся по кортам
  const COURT_NAMES = sport === SportType.PADEL ? PADEL_COURT_NAMES : TENNIS_COURT_NAMES;
  const COURT_LINKS = sport === SportType.PADEL ? PADEL_COURT_LINKS : TENNIS_COURT_LINKS;
  const COURT_MAPS = sport === SportType.PADEL ? PADEL_COURT_MAPS : TENNIS_COURT_MAPS;
  
  for (const [siteName, datesData] of courtsData.entries()) {
    const displayName = COURT_NAMES[siteName] || siteName;
    const bookingLink = COURT_LINKS[siteName];
    const mapLink = COURT_MAPS[siteName];
    
    // Формируем строку со ссылками
    const links: string[] = [];
    if (mapLink) {
      links.push(`[Карта](${mapLink})`);
    }
    if (bookingLink) {
      // Специальный формат для tennis-ru
      if (siteName === TennisSiteId.TENNIS_RU) {
        links.push(`[Забронировать в приложении](http://Link.tennis.ru) или [по телефону](tel:+74951505599) +7 495 150-55-99`);
      } else {
        links.push(`[Забронировать](${bookingLink})`);
      }
    }
    
    // Формируем название корта со ссылками
    if (links.length > 0) {
      message += `📍 *${displayName}* — ${links.join(' | ')}\n`;
    } else {
      message += `📍 *${displayName}*\n`;
    }
    
    // Для каждой даты группируем слоты по цене
    for (const { date, dateKey, slots } of datesData) {
      if (slots.length === 0) continue;
      
      // Группируем слоты по цене и длительности (дубли по времени уже обрабатываются внутри функции)
      const groupedSlots = groupSlotsByPrice(slots, siteName, dateKey);
      
      // Форматируем сгруппированные слоты
      for (const group of groupedSlots) {
        // Всегда вычисляем время окончания и показываем диапазон
        const endTime = getEndTime(group.endTime, group.duration);
        const timeRange = `${group.startTime}–${endTime}`;
        
        // Формируем строку с информацией о слоте
        let slotInfo = `🕒 ${timeRange}`;
        if (group.price !== null) {
          slotInfo += ` — ${group.price}₽`;
        }
        slotInfo += '\n';
        
        message += slotInfo;
      }
    }
    
    message += '\n';
  }
  
  // Добавляем информацию об обновлении в конец сообщения
  if (lastUpdated) {
    const formattedTime = formatLastUpdatedTime(lastUpdated);
    if (formattedTime) {
      // Определяем частоту обновления на основе типа спорта и первой даты
      const firstDateKey = Array.from(courtsData.values())[0]?.[0]?.dateKey;
      const updateFreq = getUpdateFrequency(sport, firstDateKey);
      message += `\n💰 Все цены указаны за 1 час.\nℹ️ Данные актуальны на ${formattedTime} (МСК) и обновляются ${updateFreq}.`;
    }
  }
  
  return message.trimEnd();
}

/**
 * Группирует соседние слоты с одинаковой ценой и длительностью в временные диапазоны
 */
interface GroupedSlot {
  startTime: string;
  endTime: string;
  duration: number | undefined;
  price: number | null;
}

function groupSlotsByPrice(
  slots: Slot[],
  siteName: string,
  dateKey: string
): GroupedSlot[] {
  if (slots.length === 0) return [];

  // Получаем цену для каждого слота из конфигурации
  const slotsWithPrice = slots.map(slot => {
    const [hours, minutes] = slot.time.split(':').map(Number);
    const dateTimeStr = `${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+03:00`;
    const configPrice = getCourtPrice(siteName, dateTimeStr, slot.duration);
    let price = configPrice !== null ? configPrice : (slot.price || null);
    
    // Если слот имеет длительность 30 минут, умножаем цену на 2, чтобы показать цену за 1 час
    if (price !== null && slot.duration === 30) {
      price = price * 2;
    }
    
    return { ...slot, calculatedPrice: price };
  });

  // Сначала группируем слоты по времени начала и длительности, выбирая минимальную цену
  const timeGroups = new Map<string, { time: string; duration: number | undefined; price: number | null }>();
  
  for (const slot of slotsWithPrice) {
    // Ключ только по времени и длительности (без цены)
    const key = `${slot.time}_${slot.duration}`;
    
    if (!timeGroups.has(key)) {
      // Первый слот с этим временем и длительностью
      timeGroups.set(key, {
        time: slot.time,
        duration: slot.duration,
        price: slot.calculatedPrice
      });
    } else {
      // Если уже есть слот с этим временем, выбираем минимальную цену
      const existing = timeGroups.get(key)!;
      if (slot.calculatedPrice !== null && existing.price !== null) {
        // Оба имеют цену - выбираем минимальную
        if (slot.calculatedPrice < existing.price) {
          existing.price = slot.calculatedPrice;
        }
      } else if (slot.calculatedPrice !== null && existing.price === null) {
        // Если у существующего нет цены, а у нового есть - используем новую
        existing.price = slot.calculatedPrice;
      }
      // Если у нового нет цены, а у существующего есть - оставляем существующую (ничего не делаем)
    }
  }

  // Преобразуем в массив и сортируем по времени
  const uniqueTimeSlots = Array.from(timeGroups.values()).sort((a, b) => {
    const [hoursA, minsA] = a.time.split(':').map(Number);
    const [hoursB, minsB] = b.time.split(':').map(Number);
    if (hoursA !== hoursB) return hoursA - hoursB;
    return minsA - minsB;
  });

  // Теперь схлопываем соседние слоты с одинаковой ценой и длительностью
  const groups: GroupedSlot[] = [];
  let currentGroup: { startTime: string; endTime: string; duration: number | undefined; price: number | null } | null = null;

  for (const timeSlot of uniqueTimeSlots) {
    // Преобразуем время в минуты для сравнения
    const [slotStartHours, slotStartMins] = timeSlot.time.split(':').map(Number);
    const slotStartMinutes = slotStartHours * 60 + slotStartMins;
    
    // Проверяем, можем ли мы добавить слот в текущую группу
    if (currentGroup && 
        currentGroup.price === timeSlot.price && 
        currentGroup.duration === timeSlot.duration) {
      // Вычисляем время окончания последнего слота в группе
      const prevSlotEndTime = getEndTime(currentGroup.endTime, currentGroup.duration);
      const [prevEndHours, prevEndMins] = prevSlotEndTime.split(':').map(Number);
      const prevEndMinutes = prevEndHours * 60 + prevEndMins;
      
      // Если слот перекрывается или идет сразу после предыдущего, схлопываем
      // (время начала текущего слота <= время окончания предыдущего)
      if (slotStartMinutes <= prevEndMinutes) {
        // Обновляем endTime до времени начала нового слота, если он позже
        const [currentEndHours, currentEndMins] = currentGroup.endTime.split(':').map(Number);
        const currentEndMinutes = currentEndHours * 60 + currentEndMins;
        if (slotStartMinutes > currentEndMinutes) {
          currentGroup.endTime = timeSlot.time;
        }
        continue;
      }
    }

    // Сохраняем предыдущую группу, если она есть
    if (currentGroup) {
      groups.push(currentGroup);
    }
    // Начинаем новую группу
    currentGroup = {
      startTime: timeSlot.time,
      endTime: timeSlot.time,
      duration: timeSlot.duration,
      price: timeSlot.price
    };
  }

  // Добавляем последнюю группу
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Вычисляет время окончания слота на основе времени начала и длительности
 */
function getEndTime(startTime: string, duration: number | undefined): string {
  if (!duration) return startTime;
  
  const [hours, minutes] = startTime.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + duration;
  const endHours = Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
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
  lastUpdated: string | undefined,
  dateKey: string, // Дата в формате YYYY-MM-DD для расчета цен
  favoriteCourts: string[] = [] // Массив ID избранных кортов
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
  
  let message = `${emoji} *Свободные корты на ${date}*\n\n`;
  
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
    const isFavorite = favoriteCourts.includes(siteName);
    
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
    
    // Добавляем звездочку к избранным кортам
    if (isFavorite) {
      nameWithMetro = `⭐ ${nameWithMetro}`;
    }
    
    // Формируем строку со ссылками
    const links: string[] = [];
    if (mapLink) {
      links.push(`[Карта](${mapLink})`);
    }
    if (bookingLink) {
      // Специальный формат для tennis-ru
      if (siteName === TennisSiteId.TENNIS_RU) {
        links.push(`[Забронировать в приложении](http://Link.tennis.ru) или [по телефону](tel:+74951505599) +7 495 150-55-99`);
      } else {
        links.push(`[Забронировать](${bookingLink})`);
      }
    }
    
    if (links.length > 0) {
      message += `📍 *${nameWithMetro}* — ${links.join(' | ')}\n`;
    } else {
      message += `📍 *${nameWithMetro}*\n`;
    }
    
    // Группируем слоты по цене и длительности (дубли по времени уже обрабатываются внутри функции)
    const groupedSlots = groupSlotsByPrice(slots, siteName, dateKey);
    
    // Форматируем сгруппированные слоты
    for (const group of groupedSlots) {
      // Всегда вычисляем время окончания и показываем диапазон
      const endTime = getEndTime(group.endTime, group.duration);
      const timeRange = `${group.startTime}–${endTime}`;
      
      // Формируем строку с информацией о слоте
      let slotInfo = `🕒 ${timeRange}`;
      if (group.price !== null) {
        slotInfo += ` — ${group.price}₽`;
      }
      slotInfo += '\n';
      
      message += slotInfo;
    }
    
    message += '\n';
  }
  
  // Добавляем информацию о странице, если есть несколько страниц
  const totalPages = Math.ceil(siteSlots.length / pageSize);
  if (totalPages > 1) {
    message += `\n📄 _Страница ${page} из ${totalPages}_`;
  }
  
  // Добавляем информацию об актуальности данных
  if (lastUpdated) {
    const formattedTime = formatLastUpdatedTime(lastUpdated);
    if (formattedTime) {
      // Определяем частоту обновления на основе типа спорта и даты
      const updateFreq = getUpdateFrequency(sport, dateKey);
      message += `\n💰 Все цены указаны за 1 час.\nℹ️ _Данные актуальны на ${formattedTime} (МСК) и обновляются ${updateFreq}._`;
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
 * Получает список всех кортов (только теннис) с их ID, названиями и типом спорта
 */
function getAllCourts(): Array<{ id: string; name: string; sport: Sport }> {
  const tennisCourts = Object.entries(TENNIS_COURT_NAMES).map(([id, name]) => ({
    id,
    name,
    sport: SportType.TENNIS as Sport
  }));
  
  return tennisCourts.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Генерация клавиатуры для выбора избранных кортов
 */
function getFavoriteCourtsKeyboard(selectedCourtIds: string[]): TelegramBot.InlineKeyboardButton[][] {
  const allCourts = getAllCourts();
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Разбиваем корты на строки (по 1 корту в строке для читаемости)
  for (const court of allCourts) {
    const emoji = court.sport === SportType.PADEL ? '🏓' : '🎾';
    const isSelected = selectedCourtIds.includes(court.id);
    buttons.push([{
      text: isSelected ? `✅ ${emoji} ${court.name}` : `${emoji} ${court.name}`,
      callback_data: `favorite_court_${court.id}`
    }]);
  }
  
  // Добавляем кнопки "Очистить" и "Готово"
  // Кнопка "Очистить" показывается только если есть выбранные корты
  // Кнопка "Готово" показывается всегда, чтобы можно было сохранить пустой список
  if (selectedCourtIds.length > 0) {
    buttons.push([
      { text: '🗑 Очистить', callback_data: 'favorite_courts_clear' },
      { text: '✔️ Готово', callback_data: 'favorite_courts_done' }
    ]);
  } else {
    buttons.push([
      { text: '✔️ Готово', callback_data: 'favorite_courts_done' }
    ]);
  }
  
  return buttons;
}

/**
 * Генерация клавиатуры с пагинацией и кнопкой "Выбрать другую дату"
 */
function getPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  sport: Sport
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
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        [{ text: '🎾 Найти корт (теннис)' }, { text: '🏓 Найти корт (падел)' }],
        [{ text: '🔥 Горячие предложения' }],
        [{ text: '👤 Профиль' }, { text: '💬 Чат участников' }],
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
    const profile = await getUserProfile(userId) || {};
    profile.name = text;
    await saveUserProfile(userId, profile);

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
    case '⭐ Избранные корты':
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
            command: 'favorites',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      await handleFavoritesRequest(chatId, userId || 0);
      break;
    case '👤 Профиль':
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
            command: 'profile',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      // Показываем меню профиля с кнопкой избранных кортов
      await getBot().sendMessage(chatId, '👤 Профиль', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Избранные корты', callback_data: 'profile_favorites' }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }]
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
    case '🔥 Горячие предложения':
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
            command: 'hot_offers',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      // Проверяем, есть ли у пользователя активные переуступки
      const userTransfers = userId ? await getUserTransfers(userId, true) : [];
      
      if (userTransfers.length > 0) {
        // Есть активные переуступки - показываем 3 кнопки
        await getBot().sendMessage(chatId, 'У тебя есть активное предложение!', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Отменить', callback_data: 'transfer_cancel' }, { text: '✏️ Изменить', callback_data: 'transfer_edit' }],
              [{ text: '👀 Посмотреть все предложения', callback_data: 'transfer_view_all' }]
            ]
          }
        });
      } else {
        // Нет активных переуступок - показываем список всех предложений
        await handleShowAllTransfers(chatId, userId || 0);
      }
      break;
    // case '👤 Профиль':
    //   await getBot().sendMessage(chatId, '👤 Как к тебе обращаться?', {
    //     reply_markup: {
    //       force_reply: true
    //     }
    //   });
    //   break;
  }
  
  // Проверяем, ожидает ли пользователь ввода переуступки
  // ВАЖНО: проверяем это ПОСЛЕ обработки всех системных команд в switch выше
  if (userId && waitingForTransfer.has(userId) && text) {
    // Проверяем, что это не системная команда/кнопка (на случай, если что-то пропустили)
    const systemCommands = [
      '🎾 Найти корт (теннис)',
      '🏓 Найти корт (падел)',
      '🔥 Горячие предложения',
      '👤 Профиль',
      '💬 Чат участников',
      '⭐ Избранные корты',
      '/start',
      '/help'
    ];
    
    if (systemCommands.includes(text)) {
      // Это системная команда, не сохраняем как переуступку
      waitingForTransfer.delete(userId);
      // Команда уже должна была обработаться в switch выше, просто выходим
      return;
    }
    
    // Сохраняем переуступку в Firestore
    const transferId = await saveTransfer(userId, text);
    waitingForTransfer.delete(userId);
    
    if (transferId) {
      await getBot().sendMessage(chatId, '✅ Предложение размещено! Пожалуйста, если корт заберут, не забудьте отменить его здесь.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отменить', callback_data: 'transfer_cancel' }, { text: '✏️ Изменить', callback_data: 'transfer_edit' }],
            [{ text: '👀 Посмотреть все предложения', callback_data: 'transfer_view_all' }]
          ]
        }
      });
    } else {
      await getBot().sendMessage(chatId, '❌ Произошла ошибка при сохранении предложения. Попробуйте позже.');
    }
    return;
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

    const profile = await getUserProfile(userId) || {};
    profile.level = data;
    profile.districts = []; // Инициализируем пустой выбор районов
    await saveUserProfile(userId, profile);

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
      
      // Получаем избранные корты пользователя
      const userProfile = await getUserProfile(userId);
      const favoriteCourts = userProfile?.favorites || [];
      
      // Получаем слоты на выбранную дату
      const siteSlots = getSlotsByDate(slotsData, searchState.date);
      
      // Фильтруем по локациям
      const filteredByLocation = filterSlotsByLocation(siteSlots, searchState.selectedLocations, searchState.sport);
      
      // Фильтруем по времени
      const filteredByTime = filterSlotsByTime(filteredByLocation, searchState.selectedTimeSlots);
      
      // Сортируем по приоритету (избранные корты первыми)
      const filteredSlots = sortSlotsByPriority(filteredByTime, searchState.sport, favoriteCourts);
      
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
          // Получаем избранные корты пользователя
          const userProfile = await getUserProfile(userId);
          const favoriteCourts = userProfile?.favorites || [];
          
          // Пробуем показать все варианты без фильтров
          const allSlots = getSlotsByDate(slotsData, searchState.date);
          const allSlotsWithoutLocationFilter = filterSlotsByLocation(allSlots, ['any'], searchState.sport);
          const allSlotsWithoutFilters = sortSlotsByPriority(
            filterSlotsByTime(allSlotsWithoutLocationFilter, ['any']),
            searchState.sport,
            favoriteCourts
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
            slotsData.lastUpdated,
            searchState.date,
            favoriteCourts
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
                inline_keyboard: getPaginationKeyboard(1, totalPages, searchState.sport)
              }
            });
          } else {
            await getBot().sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: getPaginationKeyboard(1, totalPages, searchState.sport)
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
    const profile = await getUserProfile(userId) || {};
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

    await saveUserProfile(userId, profile);

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

  // Обработка выбора даты для избранных кортов (custom - показать календарь)
  if (data === 'favorites_date_custom') {
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
    
    // Добавляем callback_data для избранных кортов
    const dateButtons = datesToShow.map(date => ({
      text: formatDateButton(date),
      callback_data: `favorites_date_pick_${date}`
    }));
    
    // Распределяем кнопки по рядам (по 3 кнопки в ряд)
    const rows: TelegramBot.InlineKeyboardButton[][] = [];
    const buttonsPerRow = 3;
    
    for (let i = 0; i < dateButtons.length; i += buttonsPerRow) {
      rows.push(dateButtons.slice(i, i + buttonsPerRow));
    }
    
    // Добавляем кнопки навигации для следующей недели
    const nextWeekDates = getDatesForWeekRange(pageOffset + 1);
    if (nextWeekDates.length > 0) {
      rows.push([{
        text: 'Следующая неделя ▶️',
        callback_data: `favorites_week_next_${pageOffset}`
      }]);
    }
    
    // Редактируем сообщение с выбором даты
    const messageId = query.message?.message_id;
    if (messageId) {
      try {
        await safeEditMessageText('📅 Выберите дату для просмотра слотов по избранным кортам:', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: rows
          }
        });
      } catch (error) {
        console.error('Error editing message, sending new one:', error);
        await getBot().sendMessage(chatId, '📅 Выберите дату для просмотра слотов по избранным кортам:', {
          reply_markup: {
            inline_keyboard: rows
          }
        });
      }
    } else {
      await getBot().sendMessage(chatId, '📅 Выберите дату для просмотра слотов по избранным кортам:', {
        reply_markup: {
          inline_keyboard: rows
        }
      });
    }
    return;
  }

  // Обработка навигации по неделям для избранных кортов
  if (data?.startsWith('favorites_week_prev_') || data?.startsWith('favorites_week_next_')) {
    const isPrev = data.startsWith('favorites_week_prev_');
    const prefix = isPrev ? 'favorites_week_prev_' : 'favorites_week_next_';
    const rest = data.replace(prefix, '');
    const currentPageOffset = parseInt(rest) || 0;
    
    const newPageOffset = isPrev ? currentPageOffset - 1 : currentPageOffset + 1;
    
    const datesToShow = getDatesForWeekRange(newPageOffset);
    
    // Добавляем callback_data для избранных кортов
    const dateButtons = datesToShow.map(date => ({
      text: formatDateButton(date),
      callback_data: `favorites_date_pick_${date}`
    }));
    
    // Распределяем кнопки по рядам (по 3 кнопки в ряд)
    const rows: TelegramBot.InlineKeyboardButton[][] = [];
    const buttonsPerRow = 3;
    
    for (let i = 0; i < dateButtons.length; i += buttonsPerRow) {
      rows.push(dateButtons.slice(i, i + buttonsPerRow));
    }
    
    // Добавляем кнопки навигации
    if (newPageOffset === 0) {
      // Первая страница - только кнопка "Следующая неделя"
      rows.push([{
        text: 'Следующая неделя ▶️',
        callback_data: `favorites_week_next_${newPageOffset}`
      }]);
    } else if (newPageOffset === 1) {
      // Вторая страница - только кнопка "Предыдущая неделя"
      rows.push([{
        text: '◀️ Предыдущая неделя',
        callback_data: `favorites_week_prev_${newPageOffset}`
      }]);
    }
    
    // Редактируем сообщение с выбором даты
    const messageId = query.message?.message_id;
    if (messageId) {
      try {
        await safeEditMessageText('📅 Выберите дату для просмотра слотов по избранным кортам:', {
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

  // Обработка выбора конкретной даты для избранных кортов
  if (data?.startsWith('favorites_date_pick_')) {
    const dateKey = data.replace('favorites_date_pick_', '');
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    // Получаем избранные корты пользователя
    const userProfile = await getUserProfile(userId) || {};
    const favoriteCourts = userProfile.favorites || [];
    
    if (favoriteCourts.length === 0) {
      await safeAnswerCallbackQuery(query.id, { text: 'У вас нет избранных кортов' });
      return;
    }
    
    // Показываем сообщение о загрузке
    await safeEditMessageText(
      `🔍 Ищу свободные слоты по твоим избранным кортам на ${dateStr}...`,
      {
        chat_id: chatId,
        message_id: query.message?.message_id
      }
    );
    
    // Загружаем слоты для выбранной даты
    const slotsData = await loadSlots(SportType.TENNIS, dateKey);
    
    if (!slotsData) {
      await safeEditMessageText(
        `❌ Не удалось загрузить слоты на ${dateStr}.`,
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
      return;
    }
    
    // Получаем слоты на дату
    let siteSlots = getSlotsByDate(slotsData, dateKey);
    
    // Фильтруем только по избранным кортам
    siteSlots = siteSlots.filter(({ siteName }) => favoriteCourts.includes(siteName));
    
    // Сортируем по приоритету (избранные корты уже отфильтрованы, но сортировка все равно нужна для метро/региона)
    siteSlots = sortSlotsByPriority(siteSlots, SportType.TENNIS, favoriteCourts);
    
    if (siteSlots.length === 0) {
      await safeEditMessageText(
        `⭐ На ${dateStr} по твоим избранным кортам свободных слотов не найдено.`,
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
      return;
    }
    
    // Группируем слоты по кортам для форматирования
    const courtsData: Map<string, Array<{ date: string; dateKey: string; slots: Slot[] }>> = new Map();
    for (const { siteName, slots } of siteSlots) {
      courtsData.set(siteName, [{
        date: dateStr,
        dateKey: dateKey,
        slots: slots
      }]);
    }
    
    // Форматируем сообщение для одной даты
    const message = formatFavoriteCourtsSlots(courtsData, slotsData.lastUpdated, dateStr);
    
    await safeEditMessageText(
      message,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
            [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
            [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
          ]
        }
      }
    );
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
      // На первой странице (pageOffset = 0) показываем только кнопку "Следующая неделя"
      // На второй странице (pageOffset = 1) показываем только кнопку "Предыдущая неделя"
      if (pageOffset === 0) {
        // Первая страница - только кнопка "Следующая неделя"
        const nextWeekDates = getDatesForWeekRange(pageOffset + 1);
        if (nextWeekDates.length > 0) {
          rows.push([{
            text: 'Следующая неделя ▶️',
            callback_data: `week_next_${pageOffset}_${sport}`
          }]);
        }
      } else if (pageOffset === 1) {
        // Вторая страница - только кнопка "Предыдущая неделя"
        rows.push([{
          text: '◀️ Предыдущая неделя',
          callback_data: `week_prev_${pageOffset}_${sport}`
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
    
    // Получаем избранные корты пользователя
    const userProfile = await getUserProfile(userId);
    const favoriteCourts = userProfile?.favorites || [];
    
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
      searchState.lastUpdated,
      searchState.date,
      favoriteCourts
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
    
    // Получаем избранные корты пользователя
    const userProfile = await getUserProfile(userId);
    const favoriteCourts = userProfile?.favorites || [];
    
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
      searchState.lastUpdated,
      searchState.date,
      favoriteCourts
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

  // Обработка переуступок
  if (data?.startsWith('transfer_')) {
    if (data === 'transfer_create') {
      // Разместить своё предложение
      const rulesText = `Правила переуступки корта:

1) Напишите, какой корт хотите переуступить в формате:

"Название корта, покрытие, дата, время, длительность, цена, как связаться (тг/номер)"

пример: "Спартак, хард, 23.12, 18:00, 1 час, 1800, @play_today_chat)"

2) <b>Если корт забрали - пожалуйста, не забывайте его отменить!</b> После размещения предложения появится кнопочка "отменить предложение"

3) рекомендуем снижать цену по сравнению с той, по которой купили

Напишите, какой корт хотите переуступить в формате выше👇`;

      waitingForTransfer.add(userId);
      await getBot().sendMessage(chatId, rulesText, {
        parse_mode: 'HTML'
      });
      return;
    }
    
    if (data === 'transfer_cancel') {
      // Отменить предложение
      const cancelled = await cancelUserTransfers(userId);
      
      if (!cancelled) {
        await getBot().sendMessage(chatId, 'У тебя нет активных предложений для отмены.');
        return;
      }
      
      await getBot().sendMessage(chatId, '✅ Предложение отменено.');
      return;
    }
    
    if (data === 'transfer_edit') {
      // Изменить предложение
      const userTransfers = await getUserTransfers(userId, true);
      
      if (userTransfers.length === 0) {
        await getBot().sendMessage(chatId, 'У тебя нет активных предложений для изменения.');
        return;
      }
      
      // Если больше одного предложения - показываем выбор
      if (userTransfers.length > 1) {
        let message = 'Выбери предложение для изменения:\n\n';
        const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
        
        userTransfers.forEach((transfer, idx) => {
          const parsed = parseTransferText(transfer.text);
          // Формат: "1. 23.12 18:00 - Спартак"
          const buttonText = `${idx + 1}. ${parsed.date} ${parsed.time} - ${parsed.court}`;
          keyboard.push([{ text: buttonText, callback_data: `transfer_edit_id_${transfer.id}` }]);
        });
        
        keyboard.push([{ text: '◀️ Назад', callback_data: 'transfer_view_all' }]);
        
        await getBot().sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
        return;
      }
      
      // Если одно предложение - сразу редактируем его
      const transfer = userTransfers[0];
      if (transfer.id) {
        await cancelTransferById(transfer.id);
      }
      
      waitingForTransfer.add(userId);
      const rulesText = `Правила переуступки корта:

1) Напишите, какой корт хотите переуступить в формате:

"Название корта, покрытие, дата, время, длительность, цена, как связаться (тг/номер)"

пример: "Спартак, хард, 23.12, 18:00, 1 час, 1800, @play_today_chat)"

2) <b>Если корт забрали - пожалуйста, не забывайте его отменить!</b> После размещения предложения появится кнопочка "отменить предложение"

3) рекомендуем снижать цену по сравнению с той, по которой купили

Напишите, какой корт хотите переуступить в формате выше👇`;

      await getBot().sendMessage(chatId, rulesText, {
        parse_mode: 'HTML'
      });
      return;
    }
    
    if (data?.startsWith('transfer_edit_id_')) {
      // Редактирование конкретного предложения по ID
      const transferId = data.replace('transfer_edit_id_', '');
      
      // Отменяем выбранное предложение
      await cancelTransferById(transferId);
      
      waitingForTransfer.add(userId);
      const rulesText = `Правила переуступки корта:

1) Напишите, какой корт хотите переуступить в формате:

"Название корта, покрытие, дата, время, длительность, цена, как связаться (тг/номер)"

пример: "Спартак, хард, 23.12, 18:00, 1 час, 1800, @play_today_chat)"

2) <b>Если корт забрали - пожалуйста, не забывайте его отменить!</b> После размещения предложения появится кнопочка "отменить предложение"

3) рекомендуем снижать цену по сравнению с той, по которой купили

Напишите, какой корт хотите переуступить в формате выше👇`;

      await getBot().sendMessage(chatId, rulesText, {
        parse_mode: 'HTML'
      });
      return;
    }
    
    if (data === 'transfer_view_all') {
      // Посмотреть все предложения
      await handleShowAllTransfers(chatId, userId);
      return;
    }
    
    if (data === 'transfer_my') {
      // Мои предложения
      const userTransfers = await getUserTransfers(userId, true);
      
      if (userTransfers.length === 0) {
        await getBot().sendMessage(chatId, 'У тебя нет активных предложений.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Разместить своё предложение', callback_data: 'transfer_create' }]
            ]
          }
        });
        return;
      }
      
      let message = '📋 Твои активные предложения:\n\n';
      userTransfers.forEach((transfer, idx) => {
        message += `${idx + 1}. ${transfer.text}\n\n`;
      });
      
      await getBot().sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отменить', callback_data: 'transfer_cancel' }, { text: '✏️ Изменить', callback_data: 'transfer_edit' }],
            [{ text: '👀 Посмотреть все предложения', callback_data: 'transfer_view_all' }]
          ]
        }
      });
      return;
    }
    
    if (data?.startsWith('transfer_page_')) {
      // Пагинация списка предложений
      const page = parseInt(data.replace('transfer_page_', ''), 10);
      if (page > 0) {
        await handleShowAllTransfers(chatId, userId, page);
        // Обновляем сообщение, если возможно
        const messageId = query.message?.message_id;
        if (messageId) {
          // Удаляем старое сообщение и отправляем новое
          try {
            await getBot().deleteMessage(chatId, messageId);
          } catch (e) {
            // Игнорируем ошибку удаления
          }
        }
      }
      return;
    }
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    const profile = await getUserProfile(userId);
    const userName = profile?.name || query.from.first_name;
    
    await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [
          [{ text: '🎾 Найти корт (теннис)' }, { text: '🏓 Найти корт (падел)' }],
          [{ text: '🔥 Горячие предложения' }],
          [{ text: '👤 Профиль' }, { text: '💬 Чат участников' }]
        ],
        resize_keyboard: true
      }
    });
    return;
  }

  // Обработка избранных кортов из профиля
  if (data === 'profile_favorites') {
    await handleFavoritesRequest(chatId, userId);
    return;
  }

  // Обработка выбора избранных кортов
  if (data === 'favorites_select') {
    const userProfile = await getUserProfile(userId) || {};
    const selectedCourts = userProfile.favorites || [];
    
    await safeEditMessageText(
      'Отметьте избранные корты',
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: getFavoriteCourtsKeyboard(selectedCourts)
        }
      }
    );
    return;
  }

  // Обработка очистки всех выбранных кортов
  if (data === 'favorite_courts_clear') {
    // Очищаем все избранные корты
    await updateUserFavorites(userId, []);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getFavoriteCourtsKeyboard([]) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка переключения выбора корта в избранное
  if (data?.startsWith('favorite_court_')) {
    const courtId = data.replace('favorite_court_', '');
    const userProfile = await getUserProfile(userId) || {};
    const selectedCourts = userProfile.favorites || [];
    
    // Переключаем выбор корта
    let newFavorites: string[];
    if (selectedCourts.includes(courtId)) {
      // Убираем из избранных
      newFavorites = selectedCourts.filter(id => id !== courtId);
    } else {
      // Добавляем в избранные
      newFavorites = [...selectedCourts, courtId];
    }
    
    // Сохраняем в Firestore
    await updateUserFavorites(userId, newFavorites);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getFavoriteCourtsKeyboard(newFavorites) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка завершения выбора избранных кортов
  if (data === 'favorite_courts_done') {
    const userProfile = await getUserProfile(userId) || {};
    const selectedCourts = userProfile.favorites || [];
    
    // Если не выбрано ни одного корта
    if (selectedCourts.length === 0) {
      await safeAnswerCallbackQuery(query.id);
      await safeEditMessageText(
        'У вас нет избранных кортов, если хотите - выберите, пожалуйста',
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Выбрать избранные', callback_data: 'favorites_select' }],
              [{ text: '◀️ Назад', callback_data: 'action_home' }]
            ]
          }
        }
      );
      return;
    }
    
    
    // Сохраняем выбор в Firestore
    const saved = await updateUserFavorites(userId, selectedCourts);
    if (!saved) {
      await safeAnswerCallbackQuery(query.id, { text: 'Ошибка сохранения. Попробуйте еще раз.' });
      return;
    }
    
    // Отвечаем на callback query перед редактированием
    await safeAnswerCallbackQuery(query.id);
    
    // Показываем сообщение о загрузке
    await safeEditMessageText(
      '🔍 Ищу ближайшие свободные слоты по твоим избранным кортам...',
      {
        chat_id: chatId,
        message_id: query.message?.message_id
      }
    );
    
    // Получаем даты на 3 дня вперед
    const moscowToday = getMoscowTime();
    moscowToday.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    const dateStrs: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      const date = new Date(moscowToday);
      date.setDate(date.getDate() + i);
      const dateKey = formatMoscowDateToYYYYMMDD(date);
      const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      dates.push(dateKey);
      dateStrs.push(dateStr);
    }
    
    // Собираем слоты по кортам (группировка по кортам, а не по датам)
    const courtsData: Map<string, Array<{ date: string; dateKey: string; slots: Slot[] }>> = new Map();
    let lastUpdatedTime: string | undefined = undefined;
    
    for (let i = 0; i < dates.length; i++) {
      const dateKey = dates[i];
      const dateStr = dateStrs[i];
      
      const slotsData = await loadSlots(SportType.TENNIS, dateKey);
      if (slotsData) {
        // Сохраняем время обновления (берем самое свежее)
        if (slotsData.lastUpdated && (!lastUpdatedTime || slotsData.lastUpdated > lastUpdatedTime)) {
          lastUpdatedTime = slotsData.lastUpdated;
        }
        
        // Получаем слоты на дату
        let siteSlots = getSlotsByDate(slotsData, dateKey);
        
        // Фильтруем только по избранным кортам
        siteSlots = siteSlots.filter(({ siteName }) => selectedCourts.includes(siteName));
        
        // Добавляем слоты в структуру по кортам
        for (const { siteName, slots } of siteSlots) {
          if (!courtsData.has(siteName)) {
            courtsData.set(siteName, []);
          }
          courtsData.get(siteName)!.push({
            date: dateStr,
            dateKey: dateKey,
            slots: slots
          });
        }
      }
    }
    
    if (courtsData.size === 0) {
      await safeEditMessageText(
        '⭐ На ближайшие 3 дня по твоим избранным кортам свободных слотов не найдено.',
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
    } else {
      // Сортируем корты по приоритету
      const sortedCourts = Array.from(courtsData.entries()).sort(([siteNameA], [siteNameB]) => {
        const aHasMetro = !!TENNIS_COURT_METRO[siteNameA];
        const bHasMetro = !!TENNIS_COURT_METRO[siteNameB];
        const aIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameA] || []).includes('moscow-region');
        const bIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameB] || []).includes('moscow-region');
        
        if (aHasMetro && !bHasMetro) return -1;
        if (!aHasMetro && bHasMetro) return 1;
        if (aIsMoscowRegion && !bIsMoscowRegion) return 1;
        if (!aIsMoscowRegion && bIsMoscowRegion) return -1;
        return 0;
      });
      
      const sortedCourtsData = new Map(sortedCourts);
      // Передаем явный диапазон дат для корректного отображения "ближайшие 3 дня"
      const message = formatFavoriteCourtsSlots(
        sortedCourtsData, 
        lastUpdatedTime,
        undefined, // singleDateStr
        dates[0], // dateRangeStart - первая дата диапазона (сегодня)
        dates[dates.length - 1] // dateRangeEnd - последняя дата диапазона (через 2 дня от сегодня)
      );
      
      await safeEditMessageText(
        message,
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
    }
    return;
  }

  // Обработка просмотра ближайших слотов по избранным кортам
  if (data === 'favorites_show_slots') {
    const userProfile = await getUserProfile(userId) || {};
    const favoriteCourts = userProfile?.favorites || [];
    
    if (favoriteCourts.length === 0) {
      await safeAnswerCallbackQuery(query.id, { text: 'У вас нет избранных кортов' });
      return;
    }
    
    // Показываем сообщение о загрузке
    await safeEditMessageText(
      '🔍 Ищу ближайшие свободные слоты по твоим избранным кортам...',
      {
        chat_id: chatId,
        message_id: query.message?.message_id
      }
    );
    
    // Получаем даты на 3 дня вперед
    const moscowToday = getMoscowTime();
    moscowToday.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    const dateStrs: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      const date = new Date(moscowToday);
      date.setDate(date.getDate() + i);
      const dateKey = formatMoscowDateToYYYYMMDD(date);
      const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      dates.push(dateKey);
      dateStrs.push(dateStr);
    }
    
    // Собираем слоты по кортам (группировка по кортам, а не по датам)
    const courtsData: Map<string, Array<{ date: string; dateKey: string; slots: Slot[] }>> = new Map();
    let lastUpdatedTime: string | undefined = undefined;
    
    for (let i = 0; i < dates.length; i++) {
      const dateKey = dates[i];
      const dateStr = dateStrs[i];
      
      const slotsData = await loadSlots(SportType.TENNIS, dateKey);
      if (slotsData) {
        // Сохраняем время обновления (берем самое свежее)
        if (slotsData.lastUpdated && (!lastUpdatedTime || slotsData.lastUpdated > lastUpdatedTime)) {
          lastUpdatedTime = slotsData.lastUpdated;
        }
        
        // Получаем слоты на дату
        let siteSlots = getSlotsByDate(slotsData, dateKey);
        
        // Фильтруем только по избранным кортам
        siteSlots = siteSlots.filter(({ siteName }) => favoriteCourts.includes(siteName));
        
        // Добавляем слоты в структуру по кортам
        for (const { siteName, slots } of siteSlots) {
          if (!courtsData.has(siteName)) {
            courtsData.set(siteName, []);
          }
          courtsData.get(siteName)!.push({
            date: dateStr,
            dateKey: dateKey,
            slots: slots
          });
        }
      }
    }
    
    if (courtsData.size === 0) {
      await safeEditMessageText(
        '⭐ На ближайшие 3 дня по твоим избранным кортам свободных слотов не найдено.',
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
      return;
    }
    
    // Сортируем корты по приоритету (используем порядок из TENNIS_COURT_NAMES и сортировку по приоритету)
    // Сначала создаем массив кортов с их приоритетом
    const sortedCourts = Array.from(courtsData.entries()).sort(([siteNameA], [siteNameB]) => {
      // Используем функцию сортировки по приоритету
      const aHasMetro = !!TENNIS_COURT_METRO[siteNameA];
      const bHasMetro = !!TENNIS_COURT_METRO[siteNameB];
      const aIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameA] || []).includes('moscow-region');
      const bIsMoscowRegion = (TENNIS_COURT_LOCATIONS[siteNameB] || []).includes('moscow-region');
      
      // Если у корта A есть метро, а у B нет - A идет первым
      if (aHasMetro && !bHasMetro) return -1;
      if (!aHasMetro && bHasMetro) return 1;
      
      // Если у обоих кортов одинаковое наличие метро, проверяем moscow-region
      if (aIsMoscowRegion && !bIsMoscowRegion) return 1;
      if (!aIsMoscowRegion && bIsMoscowRegion) return -1;
      
      // В остальных случаях сохраняем исходный порядок
      return 0;
    });
    
    // Создаем отсортированную Map
    const sortedCourtsData = new Map(sortedCourts);
    
    // Форматируем сообщение с явным указанием диапазона дат (даже если на первую дату нет слотов)
    const message = formatFavoriteCourtsSlots(
      sortedCourtsData, 
      lastUpdatedTime,
      undefined, // singleDateStr
      dates[0], // dateRangeStart - первая дата диапазона (сегодня)
      dates[dates.length - 1] // dateRangeEnd - последняя дата диапазона (через 2 дня от сегодня)
    );
    
      await safeEditMessageText(
        message,
        {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить список избранных', callback_data: 'favorites_edit' }],
              [{ text: '🎾 Искать по всем кортам', callback_data: 'favorites_main_search' }],
              [{ text: '📅 Выбрать другую дату', callback_data: 'favorites_date_custom' }]
            ]
          }
        }
      );
    return;
  }

  // Обработка перехода в основной поиск из избранных
  if (data === 'favorites_main_search') {
    await safeEditMessageText(
      USER_TEXTS.DATE_SELECTION,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.TENNIS}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.TENNIS}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.TENNIS}` }]
          ]
        }
      }
    );
    return;
  }

  // Обработка изменения списка избранных кортов
  if (data === 'favorites_edit') {
    const userProfile = await getUserProfile(userId) || {};
    const selectedCourts = userProfile.favorites || [];
    
    await safeEditMessageText(
      'Отметьте избранные корты',
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: getFavoriteCourtsKeyboard(selectedCourts)
        }
      }
    );
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
