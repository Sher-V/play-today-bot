import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';
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
import { getCourtPrice, getBotToken, isDev } from './utils/config-utils';
import { getRemoteConfigValue } from './utils/remote-config';

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
const COACH_MEDIA_BUCKET = process.env.COACH_MEDIA_BUCKET;
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
// Storage инициализируем всегда (нужен для загрузки медиа тренеров)
const storage = new Storage();

/**
 * Загружает медиа файл в Cloud Storage
 * @param fileId - file_id от Telegram
 * @param userId - ID пользователя
 * @param fileType - тип файла (photo или video)
 * @returns URL файла в Cloud Storage или null в случае ошибки
 */
/**
 * Создает задачу для загрузки видео в GCS в фоне (через Cloud Tasks или HTTP запрос)
 */
/**
 * Создает задачу для фоновой загрузки медиа (фото или видео) в GCS
 */
async function createMediaUploadTask(fileId: string, userId: number, fileType: 'photo' | 'video'): Promise<boolean> {
  try {
    const BOT_TOKEN = getBotToken();

    if (!BOT_TOKEN) {
      console.error('[createMediaUploadTask] Bot token not found');
      return false;
    }

    const payload = {
      fileId,
      userId,
      botToken: BOT_TOKEN,
      fileType
    };

    // В dev-режиме делаем прямой HTTP запрос к локальной функции
    if (isDev) {
      const localFunctionUrl = process.env.MEDIA_UPLOAD_FUNCTION_URL || process.env.VIDEO_UPLOAD_FUNCTION_URL || 'http://localhost:8081';
      
      console.log(`[createMediaUploadTask] Dev mode: sending HTTP request to ${localFunctionUrl} for ${fileType}`);
      
      // Делаем запрос в фоне, не ждем ответа
      fetch(localFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async response => {
          if (response.ok) {
            const result = await response.json().catch(() => ({}));
            console.log(`[createMediaUploadTask] ✅ Local function accepted the request for ${fileType}, response:`, result);
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[createMediaUploadTask] ❌ Local function error: ${response.status}, body: ${errorText}`);
          }
        })
        .catch(error => {
          console.error(`[createMediaUploadTask] ❌ Failed to call local function: ${error.message}`);
          console.error(`[createMediaUploadTask] Make sure the upload function is running at ${localFunctionUrl}`);
        });
      
      return true;
    }

    // В production используем Cloud Tasks
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    const client = new CloudTasksClient();

    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const location = process.env.CLOUD_TASKS_LOCATION || 'europe-west1';
    const queue = process.env.CLOUD_TASKS_QUEUE || 'media-upload-queue';
    const functionUrl = process.env.MEDIA_UPLOAD_FUNCTION_URL || process.env.VIDEO_UPLOAD_FUNCTION_URL;

    if (!projectId || !functionUrl) {
      console.error('[createMediaUploadTask] Missing configuration: projectId or functionUrl');
      return false;
    }

    const parent = client.queuePath(projectId, location, queue);

    // Для gen2 функций (Cloud Run) нужна OIDC аутентификация
    // Используем App Engine default service account, который всегда существует
    // Формат: PROJECT_ID@appspot.gserviceaccount.com
    const serviceAccountEmail = `${projectId}@appspot.gserviceaccount.com`;
    
    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: functionUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: serviceAccountEmail,
          audience: functionUrl,
        },
      },
    };
    
    console.log(`[createMediaUploadTask] Using OIDC service account: ${serviceAccountEmail}`);

    console.log(`[createMediaUploadTask] Creating Cloud Task for user ${userId}, fileId: ${fileId}, type: ${fileType}`);
    console.log(`[createMediaUploadTask] Using service account: ${serviceAccountEmail}`);
    const [response] = await client.createTask({ parent, task });
    console.log(`[createMediaUploadTask] Task created: ${response.name}`);
    
    return true;
  } catch (error) {
    console.error('[createMediaUploadTask] Error creating task:', error);
    return false;
  }
}

/**
 * @deprecated Используйте createMediaUploadTask вместо этого
 */
async function createVideoUploadTask(fileId: string, userId: number): Promise<boolean> {
  return createMediaUploadTask(fileId, userId, 'video');
}

/**
 * Загружает медиа в GCS и возвращает объект с file_id и publicUrl
 * Для видео загрузка происходит в фоне, для фото - синхронно
 */
async function uploadMediaToStorage(fileId: string, userId: number, fileType: 'photo' | 'video'): Promise<CoachMediaItem | null> {
  try {
    console.log(`[uploadMediaToStorage] Starting upload for fileId: ${fileId}, userId: ${userId}, fileType: ${fileType}`);
    
    if (!COACH_MEDIA_BUCKET) {
      console.error('COACH_MEDIA_BUCKET environment variable not set');
      return null;
    }

    // Получаем информацию о файле от Telegram
    const fileInfo = await getBot().getFile(fileId);
    const filePath = fileInfo.file_path;
    
    if (!filePath) {
      console.error('File path not found');
      return null;
    }

    console.log(`[uploadMediaToStorage] File path: ${filePath}, size: ${fileInfo.file_size} bytes`);

    // Проверяем размер файла (макс 50 МБ)
    const maxFileSize = 50 * 1024 * 1024; // 50 MB
    if (fileInfo.file_size && fileInfo.file_size > maxFileSize) {
      console.error(`[uploadMediaToStorage] File too large: ${fileInfo.file_size} bytes (max ${maxFileSize})`);
      return null;
    }

    const uploadedAt = new Date().toISOString();

    // Для всех типов медиа сохраняем file_id и запускаем фоновую загрузку в GCS
    console.log(`[uploadMediaToStorage] ${fileType === 'video' ? 'Video' : 'Photo'} detected, saving file_id and starting background upload to GCS`);
    
    // Создаем задачу для фоновой загрузки в GCS (локально через HTTP или через Cloud Tasks)
    const taskCreated = await createMediaUploadTask(fileId, userId, fileType);
    
    if (!taskCreated) {
      console.error(`[uploadMediaToStorage] ❌ Failed to create upload task for userId: ${userId}, fileId: ${fileId}, fileType: ${fileType}`);
      console.error(`[uploadMediaToStorage] This means publicUrl will NOT be added to the media item!`);
      // Все равно возвращаем объект, но без publicUrl (он будет добавлен позже, если задача будет создана вручную)
      return {
        type: fileType,
        fileId,
        uploadedAt
      };
    }
    
    console.log(`[uploadMediaToStorage] ✅ Upload task created successfully. publicUrl will be added by uploadCoachMedia function`);
    
    // Возвращаем объект с file_id, publicUrl будет добавлен позже функцией uploadCoachMedia
    return {
      type: fileType,
      fileId,
      uploadedAt
    };
  } catch (error) {
    console.error('[uploadMediaToStorage] Error uploading media to storage:', error);
    return null;
  }
}

// Ленивая инициализация бота (создаётся при первом вызове)
let bot: TelegramBot | null = null;

function getBot(): TelegramBot {
  if (!bot) {
    const token = getBotToken();
    if (!token) {
      throw new Error('Bot token не найден в переменных окружения');
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
interface CoachMediaItem {
  type: 'photo' | 'video';
  fileId: string;           // Telegram file_id для использования в боте
  publicUrl?: string;        // URL в GCS для веб/мобильного приложения
  uploadedAt: string;        // ISO дата загрузки
}

interface UserProfile {
  name?: string;
  level?: string;
  districts?: string[];
  favorites?: string[]; // Массив ID избранных кортов
  isCoach?: boolean; // Флаг, что пользователь тренер
  coachName?: string; // ФИО тренера при регистрации
  coachDistricts?: string[]; // Районы, в которых тренер работает
  coachPriceIndividual?: number; // Цена за индивидуальную тренировку
  coachPriceSplit?: number; // Цена за сплит тренировку
  coachPriceGroup?: number; // Цена за групповую тренировку
  coachAvailableDays?: string[]; // Дни недели, когда тренер свободен
  coachMedia?: CoachMediaItem[]; // Массив медиа-файлов (фото/видео)
  coachAbout?: string; // Информация о тренере
  coachContact?: string; // Контакт тренера (никнейм или телефон)
  coachHidden?: boolean; // Флаг скрытого профиля (не показывать в каталоге)
  // Информация о последнем поиске корта
  lastCourtSearch?: {
    date: string; // Дата поиска (YYYY-MM-DD)
    time: string; // Время поиска (HH:MM)
    location: string; // Локация поиска (название района)
    timestamp: number; // Unix timestamp для отслеживания
  };
  updatedAt?: Date;
}

// Инициализация Firestore
const firestore = new Firestore();

// Коллекция пользователей в Firestore
const USERS_COLLECTION = 'users';
const REQUESTS_COLLECTION = 'coachRequests';

/**
 * Формирует клавиатуру главного меню с учетом feature flags
 */
async function getMainMenuKeyboard(): Promise<TelegramBot.KeyboardButton[][]> {
  const keyboard: TelegramBot.KeyboardButton[][] = [
    [{ text: '🎾 Найти корт (теннис)' }]
  ];
  
  // Проверяем флаг для кнопки "Найти тренера"
  const showFindCoach = await getRemoteConfigValue('show_find_coach', false);

  if (showFindCoach) {
    keyboard.push([{ text: '👤 Найти тренера' }]);
  }
  
  keyboard.push([{ text: '⚙️ Еще' }, { text: '💬 Чат участников' }]);
  
  return keyboard;
}

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

// Дни недели для расписания тренера
const CoachDayId = {
  MON: 'mon',
  TUE: 'tue',
  WED: 'wed',
  THU: 'thu',
  FRI: 'fri',
  SAT: 'sat',
  SUN: 'sun',
  WEEKDAYS: 'weekdays',
  ANY: 'any'
} as const;

const coachDayLabels = new Map<string, string>([
  [CoachDayId.MON, 'Пн'],
  [CoachDayId.TUE, 'Вт'],
  [CoachDayId.WED, 'Ср'],
  [CoachDayId.THU, 'Чт'],
  [CoachDayId.FRI, 'Пт'],
  [CoachDayId.SAT, 'Сб'],
  [CoachDayId.SUN, 'Вс'],
  [CoachDayId.WEEKDAYS, 'Только будни'],
  [CoachDayId.ANY, 'Любой день']
]);

const weekdayIds: string[] = [CoachDayId.MON, CoachDayId.TUE, CoachDayId.WED, CoachDayId.THU, CoachDayId.FRI];
const allDayIds: string[] = [CoachDayId.MON, CoachDayId.TUE, CoachDayId.WED, CoachDayId.THU, CoachDayId.FRI, CoachDayId.SAT, CoachDayId.SUN];

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

// Шаги регистрации тренера
enum CoachRegistrationStep {
  NONE = 'none',
  NAME = 'name',
  PRICE_INDIVIDUAL = 'price_individual',
  PRICE_SPLIT = 'price_split',
  PRICE_GROUP = 'price_group',
  ABOUT = 'about',
  MEDIA = 'media',
  CONTACT = 'contact'
}

// Хранилище для отслеживания текущего шага регистрации тренера
const coachRegistrationStates = new Map<number, CoachRegistrationStep>();

// Enum для шагов редактирования профиля тренера
enum CoachEditStep {
  NONE = 'none',
  NAME = 'edit_name',
  DISTRICTS = 'edit_districts',
  PRICE_INDIVIDUAL = 'edit_price_individual',
  PRICE_SPLIT = 'edit_price_split',
  PRICE_GROUP = 'edit_price_group',
  DAYS = 'edit_days',
  ABOUT = 'edit_about',
  MEDIA = 'edit_media',
  CONTACT = 'edit_contact'
}

// Состояние для навигации по тренерам
interface CoachSearchState {
  coachIds: string[];  // Список ID тренеров для показа
  currentIndex: number;  // Текущий индекс в списке
  trainingType: 'individual' | 'group' | 'any';  // Тип тренировки
  fromMainMenu?: boolean;  // Флаг: запрос пришел из главного меню
}

// Информация о заявке для отслеживания
interface CoachRequest {
  userId: number;  // ID клиента
  coachUserId: number;  // ID тренера
  userName: string;  // Имя клиента
  coachName: string;  // Имя тренера
  coachContact: string;  // Контакт тренера
  timestamp: number;  // Время отправки заявки
  reminderSent: boolean;  // Было ли отправлено напоминание
  // Информация о поиске корта клиентом
  courtSearchDate?: string;  // Дата поиска (YYYY-MM-DD)
  courtSearchTime?: string;  // Время поиска (HH:MM)
  courtSearchLocation?: string;  // Локация поиска
}

const coachSearchStates = new Map<number, CoachSearchState>();

// Хранилище для отслеживания текущего шага редактирования профиля
const coachEditStates = new Map<number, CoachEditStep>();

// Хранилище для накопления файлов из media group
interface MediaGroupItem {
  fileId: string;
  fileType: 'photo' | 'video';
  timestamp: number;
}

interface MediaGroupBuffer {
  items: MediaGroupItem[];
  timeoutId: NodeJS.Timeout | null;
  userId: number;
  chatId: number;
  context: 'registration' | 'edit';
}

const mediaGroupBuffers = new Map<string, MediaGroupBuffer>();
const MEDIA_GROUP_TIMEOUT = 2000; // 2 секунды на сбор всех файлов из группы

/**
 * Обрабатывает файл из media group или одиночный файл
 */
async function processMediaFile(
  fileId: string,
  fileType: 'photo' | 'video',
  userId: number,
  chatId: number,
  context: 'registration' | 'edit',
  mediaGroupId?: string
): Promise<void> {
  const profile = await getUserProfile(userId) || {};
  const mediaArray = profile.coachMedia || [];
  
  // Если это media group, накапливаем файлы
  if (mediaGroupId) {
    const buffer = mediaGroupBuffers.get(mediaGroupId);
    
    if (buffer) {
      // Добавляем файл в буфер
      buffer.items.push({ fileId, fileType, timestamp: Date.now() });
      console.log(`[processMediaFile] Added file to media group ${mediaGroupId}, total: ${buffer.items.length}`);
      
      // Сбрасываем таймаут
      if (buffer.timeoutId) {
        clearTimeout(buffer.timeoutId);
      }
      
      // Устанавливаем новый таймаут
      buffer.timeoutId = setTimeout(async () => {
        await processMediaGroup(mediaGroupId, buffer);
        mediaGroupBuffers.delete(mediaGroupId);
      }, MEDIA_GROUP_TIMEOUT);
      
      return;
    } else {
      // Создаем новый буфер
      const newBuffer: MediaGroupBuffer = {
        items: [{ fileId, fileType, timestamp: Date.now() }],
        timeoutId: null,
        userId,
        chatId,
        context
      };
      
      console.log(`[processMediaFile] Created new media group buffer ${mediaGroupId}`);
      
      // Устанавливаем таймаут
      newBuffer.timeoutId = setTimeout(async () => {
        await processMediaGroup(mediaGroupId, newBuffer);
        mediaGroupBuffers.delete(mediaGroupId);
      }, MEDIA_GROUP_TIMEOUT);
      
      mediaGroupBuffers.set(mediaGroupId, newBuffer);
      return;
    }
  }
  
  // Одиночный файл - обрабатываем сразу
  console.log(`[processMediaFile] Processing single ${fileType} file: ${fileId}`);
  
  const processingMsg = await getBot().sendMessage(chatId, '⏳ Обрабатываю файл...');
  
  const mediaItem = await uploadMediaToStorage(fileId, userId, fileType);
  
  try {
    await getBot().deleteMessage(chatId, processingMsg.message_id);
  } catch (e) {
    console.log('Could not delete processing message');
  }
  
  if (mediaItem) {
    mediaArray.push(mediaItem);
    profile.coachMedia = mediaArray;
    await saveUserProfile(userId, profile);
    
    const keyboard = context === 'registration' 
      ? {
          inline_keyboard: [
            [{ text: '📤 Загрузить еще', callback_data: 'coach_media_upload_more' }],
            [{ text: '✔️ Готово', callback_data: 'coach_media_done' }]
          ]
        }
      : {
          inline_keyboard: [
            [{ text: '✔️ Готово', callback_data: 'coach_edit_done' }],
            [{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]
          ]
        };
    
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_MEDIA_UPLOADED, { reply_markup: keyboard });
  } else {
    await getBot().sendMessage(chatId, '❌ Ошибка при обработке файла. Попробуйте другой файл.', {
      reply_markup: {
        inline_keyboard: context === 'registration'
          ? [[{ text: '✔️ Готово', callback_data: 'coach_media_done' }]]
          : [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }
    });
  }
}

/**
 * Обрабатывает все файлы из media group
 */
async function processMediaGroup(mediaGroupId: string, buffer: MediaGroupBuffer): Promise<void> {
  console.log(`[processMediaGroup] Processing media group ${mediaGroupId} with ${buffer.items.length} files`);
  
  const { userId, chatId, context } = buffer;
  const profile = await getUserProfile(userId) || {};
  const mediaArray = profile.coachMedia || [];
  
  const processingMsg = await getBot().sendMessage(chatId, `⏳ Обрабатываю ${buffer.items.length} файл(ов)...`);
  
  let successCount = 0;
  let failCount = 0;
  
  // Обрабатываем все файлы последовательно
  for (const item of buffer.items) {
    const mediaItem = await uploadMediaToStorage(item.fileId, userId, item.fileType);
    if (mediaItem) {
      mediaArray.push(mediaItem);
      successCount++;
    } else {
      failCount++;
    }
  }
  
  // Сохраняем профиль
  profile.coachMedia = mediaArray;
  await saveUserProfile(userId, profile);
  
  // Удаляем сообщение о процессе
  try {
    await getBot().deleteMessage(chatId, processingMsg.message_id);
  } catch (e) {
    console.log('Could not delete processing message');
  }
  
  // Отправляем подтверждение
  const message = successCount > 0
    ? `✅ Обработано файлов: ${successCount}${failCount > 0 ? `\n❌ Ошибок: ${failCount}` : ''}`
    : '❌ Ошибка при обработке файлов. Попробуйте загрузить файлы по одному.';
  
  const keyboard = context === 'registration' 
    ? {
        inline_keyboard: [
          [{ text: '📤 Загрузить еще', callback_data: 'coach_media_upload_more' }],
          [{ text: '✔️ Готово', callback_data: 'coach_media_done' }]
        ]
      }
    : {
        inline_keyboard: [
          [{ text: '✔️ Готово', callback_data: 'coach_edit_done' }],
          [{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]
        ]
      };
  
  await getBot().sendMessage(chatId, message, { reply_markup: keyboard });
}

/**
 * Создает Cloud Task для отправки напоминания через 1 час
 * В dev режиме использует прямой HTTP вызов или setTimeout
 */
async function createReminderTask(requestKey: string) {
  const reminderFunctionUrl = process.env.REMINDER_FUNCTION_URL;
  const projectId = process.env.GCP_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'default';

  // Задержка: 10 секунд в dev, 1 час (3600 секунд) в production
  const delaySeconds = isDev ? 10 : 3600;
  const delayMs = delaySeconds * 1000;

  // В dev режиме: если есть URL функции, используем прямой HTTP вызов через setTimeout
  if (isDev && reminderFunctionUrl) {
    console.log(`[createReminderTask] Scheduling direct HTTP call in ${delaySeconds}s for request ${requestKey}`);
    
    setTimeout(async () => {
      try {
        console.log(`[createReminderTask] Calling reminder function for ${requestKey}`);
        const response = await fetch(reminderFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requestKey })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[createReminderTask] Function returned error: ${response.status} ${errorText}`);
        } else {
          console.log(`[createReminderTask] Reminder sent successfully for ${requestKey}`);
        }
      } catch (error) {
        console.error(`[createReminderTask] Error calling reminder function:`, error);
      }
    }, delayMs);
    
    return;
  }

  // Production или dev с Cloud Tasks: используем Cloud Tasks
  if (!reminderFunctionUrl || !projectId) {
    console.log('[createReminderTask] Missing configuration (REMINDER_FUNCTION_URL or GCP_PROJECT), skipping reminder');
    return;
  }

  try {
    const client = new CloudTasksClient();
    const parent = client.queuePath(projectId, location, queue);

    const scheduleTime = Math.floor(Date.now() / 1000) + delaySeconds;

    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: reminderFunctionUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        body: Buffer.from(JSON.stringify({ requestKey })).toString('base64')
      },
      scheduleTime: {
        seconds: scheduleTime
      }
    };

    const [response] = await client.createTask({ parent, task });
    console.log(`[createReminderTask] Created Cloud Task ${response.name} for request ${requestKey} (delay: ${delaySeconds}s)`);
  } catch (error) {
    console.error('[createReminderTask] Error creating Cloud Task:', error);
    throw error;
  }
}

/**
 * Получает список активных тренеров из Firestore с фильтрацией
 */
async function getActiveCoaches(
  trainingType: 'individual' | 'group' | 'any',
  userDistricts?: string[]
): Promise<{ userId: string; profile: UserProfile }[]> {
  try {
    const usersRef = firestore.collection(USERS_COLLECTION);
    
    // Получаем всех пользователей, которые являются тренерами
    const snapshot = await usersRef.where('isCoach', '==', true).get();
    
    if (snapshot.empty) {
      console.log('[getActiveCoaches] No coaches found');
      return [];
    }
    
    const coaches: { userId: string; profile: UserProfile }[] = [];
    
    snapshot.forEach(doc => {
      const profile = doc.data() as UserProfile;
      
      // Пропускаем тренеров на паузе
      if (profile.coachHidden) {
        return;
      }
      
      // Фильтрация по типу тренировки
      if (trainingType === 'individual') {
        // Проверяем, что ведет индивидуальные тренировки (цена > 0)
        if (!profile.coachPriceIndividual || profile.coachPriceIndividual === 0) {
          return;
        }
      } else if (trainingType === 'group') {
        // Проверяем, что ведет групповые или сплит тренировки
        if ((!profile.coachPriceSplit || profile.coachPriceSplit === 0) &&
            (!profile.coachPriceGroup || profile.coachPriceGroup === 0)) {
          return;
        }
      }
      
      // Фильтрация по районам (если указаны)
      if (userDistricts && userDistricts.length > 0) {
        const coachDistricts = profile.coachDistricts || [];
        // Проверяем, есть ли пересечение районов
        const hasCommonDistrict = coachDistricts.some(d => userDistricts.includes(d));
        if (!hasCommonDistrict) {
          return;
        }
      }
      
      coaches.push({ userId: doc.id, profile });
    });
    
    console.log(`[getActiveCoaches] Found ${coaches.length} coaches`);
    
    // Перемешиваем случайным образом
    return coaches.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error('[getActiveCoaches] Error:', error);
    return [];
  }
}

/**
 * Экранирует HTML-символы в тексте для безопасного использования в HTML-разметке Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Форматирует карточку тренера (без контактов)
 */
function formatCoachCard(profile: UserProfile, currentIndex: number, totalCoaches: number): string {
  let text = `👤 <b>${profile.coachName || 'Имя не указано'}</b>\n\n`;
  
  if (profile.coachAbout) {
    // Используем Collapsible Quotes с атрибутом expandable
    // Если описание больше 120 символов, помещаем его в expandable blockquote
    // Экранируем HTML-символы для безопасного парсинга
    if (profile.coachAbout.length > 120) {
      const escapedAbout = escapeHtml(profile.coachAbout);
      text += `📝 <b>О тренере:</b>\n<blockquote expandable>${escapedAbout}</blockquote>\n\n`;
    } else {
      const escapedAbout = escapeHtml(profile.coachAbout);
      text += `📝 <b>О тренере:</b>\n${escapedAbout}\n\n`;
    }
  }
  
  if (profile.coachDistricts && profile.coachDistricts.length > 0) {
    const locationLabels: Record<string, string> = {
      north: 'Север',
      west: 'Запад',
      center: 'Центр',
      east: 'Восток',
      south: 'Юг',
      'moscow-region': 'Подмосковье',
      any: 'Не важно'
    };
    const districts = profile.coachDistricts.map(d => locationLabels[d] || d).join(', ');
    text += `📍 <b>Районы:</b> ${districts}\n\n`;
  }
  
  if (profile.coachAvailableDays && profile.coachAvailableDays.length > 0) {
    const dayLabels: Record<string, string> = {
      mon: 'Пн',
      tue: 'Вт',
      wed: 'Ср',
      thu: 'Чт',
      fri: 'Пт',
      sat: 'Сб',
      sun: 'Вс'
    };
    const days = profile.coachAvailableDays.map(d => dayLabels[d] || d).join(', ');
    text += `📅 <b>Доступен:</b> ${days}\n\n`;
  }
  
  text += `💰 <b>Цены:</b>\n`;
  if (profile.coachPriceIndividual && profile.coachPriceIndividual > 0) {
    text += `   • Индивидуальная: ${profile.coachPriceIndividual} ₽/час\n`;
  }
  if (profile.coachPriceSplit && profile.coachPriceSplit > 0) {
    text += `   • Сплит: ${profile.coachPriceSplit} ₽/час с человека\n`;
  }
  if (profile.coachPriceGroup && profile.coachPriceGroup > 0) {
    text += `   • Групповая: ${profile.coachPriceGroup} ₽/час с человека\n`;
  }
  
  return text;
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
      const bucket = storage.bucket(BUCKET_NAME);
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

/**
 * Объединяет соседние времена в диапазоны
 * Например: [14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00] -> ["14:00 – 22:00"]
 */
function mergeConsecutiveTimes(times: string[]): string[] {
  if (times.length === 0) return [];
  if (times.length === 1) return times;
  
  const result: string[] = [];
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  
  // Преобразуем время в минуты для сравнения
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  for (let i = 0; i < times.length; i++) {
    const currentTime = times[i];
    const currentMinutes = timeToMinutes(currentTime);
    
    if (rangeStart === null) {
      // Начало нового диапазона
      rangeStart = currentTime;
      rangeEnd = currentTime;
    } else {
      const prevMinutes = timeToMinutes(rangeEnd!);
      const diff = currentMinutes - prevMinutes;
      
      // Если разница 60 минут (1 час) - это соседние слоты, продолжаем диапазон
      if (diff === 60) {
        rangeEnd = currentTime;
      } else {
        // Разрыв в диапазоне - сохраняем текущий диапазон и начинаем новый
        if (rangeStart === rangeEnd) {
          result.push(rangeStart);
        } else {
          result.push(`${rangeStart} – ${rangeEnd}`);
        }
        rangeStart = currentTime;
        rangeEnd = currentTime;
      }
    }
  }
  
  // Добавляем последний диапазон
  if (rangeStart !== null) {
    if (rangeStart === rangeEnd) {
      result.push(rangeStart);
    } else {
      result.push(`${rangeStart} – ${rangeEnd}`);
    }
  }
  
  return result;
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
      
      // Форматируем дату в короткий формат (например, "27 дек")
      const dateShort = formatDateShort(dateKey);
      
      // Собираем уникальные времена начала и все цены для этой даты
      const uniqueTimes = new Set<string>();
      const prices: number[] = [];
      
      // Получаем цену для каждого слота
      for (const slot of slots) {
        const [hours, minutes] = slot.time.split(':').map(Number);
        const dateTimeStr = `${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+03:00`;
        const configPrice = getCourtPrice(siteName, dateTimeStr, slot.duration);
        let price = configPrice !== null ? configPrice : (slot.price || null);
        
        // Если слот имеет длительность 30 минут, умножаем цену на 2, чтобы показать цену за 1 час
        if (price !== null && slot.duration === 30) {
          price = price * 2;
        }
        
        // Добавляем время начала слота
        uniqueTimes.add(slot.time);
        
        // Добавляем цену, если она есть
        if (price !== null) {
          prices.push(price);
        }
      }
      
      // Сортируем времена
      const sortedTimes = Array.from(uniqueTimes).sort((a, b) => {
        const [hoursA, minsA] = a.split(':').map(Number);
        const [hoursB, minsB] = b.split(':').map(Number);
        if (hoursA !== hoursB) return hoursA - hoursB;
        return minsA - minsB;
      });
      
      if (sortedTimes.length === 0) continue;
      
      // Объединяем соседние времена в диапазоны
      const mergedTimes = mergeConsecutiveTimes(sortedTimes);
      
      // Формируем строку с датой и временами (дата выделена жирным)
      let dateLine = `*${dateShort}* — ${mergedTimes.join(' · ')}`;
      
      // Добавляем информацию о ценах
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
          // Одна цена
          dateLine += ` — ${minPrice} ₽`;
        } else {
          // Диапазон цен
          dateLine += ` — ${minPrice}–${maxPrice} ₽`;
        }
      }
      
      message += dateLine + '\n';
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

// Генерация клавиатуры для выбора районов тренера (географическое расположение)
function getCoachDistrictKeyboard(selectedDistricts: string[]): TelegramBot.InlineKeyboardButton[][] {
  const getButtonText = (id: string) => {
    const label = locationLabels.get(id) || id;
    return selectedDistricts.includes(id) ? `✅ ${label}` : label;
  };

  return [
    // Север - отдельная строка
    [{
      text: getButtonText(LocationId.NORTH),
      callback_data: `coach_district_${LocationId.NORTH}`
    }],
    // Запад, Центр, Восток - в одной строке
    [
      {
        text: getButtonText(LocationId.WEST),
        callback_data: `coach_district_${LocationId.WEST}`
      },
      {
        text: getButtonText(LocationId.CENTER),
        callback_data: `coach_district_${LocationId.CENTER}`
      },
      {
        text: getButtonText(LocationId.EAST),
        callback_data: `coach_district_${LocationId.EAST}`
      }
    ],
    // Юг - отдельная строка
    [{
      text: getButtonText(LocationId.SOUTH),
      callback_data: `coach_district_${LocationId.SOUTH}`
    }],
    // Подмосковье - отдельная строка
    [{
      text: getButtonText(LocationId.MOSCOW_REGION),
      callback_data: `coach_district_${LocationId.MOSCOW_REGION}`
    }],
    // Не важно - отдельная строка
    [{
      text: getButtonText(LocationId.ANY),
      callback_data: `coach_district_${LocationId.ANY}`
    }],
    // Готово - отдельная строка
    [{ text: '✔️ Готово', callback_data: 'coach_district_done' }]
  ];
}

// Генерация клавиатуры для выбора дней недели тренера
function getCoachDaysKeyboard(selectedDays: string[]): TelegramBot.InlineKeyboardButton[][] {
  const getButtonText = (id: string) => {
    const label = coachDayLabels.get(id) || id;
    return selectedDays.includes(id) ? `✅ ${label}` : label;
  };
  
  // Проверяем, выбраны ли все будни или все дни
  const hasAllWeekdays = weekdayIds.every(d => selectedDays.includes(d));
  const hasAllDays = allDayIds.every(d => selectedDays.includes(d));
  
  const getSpecialButtonText = (id: string, isActive: boolean) => {
    const label = coachDayLabels.get(id) || id;
    return isActive ? `✅ ${label}` : label;
  };

  return [
    // Пн-Чт
    [
      { text: getButtonText(CoachDayId.MON), callback_data: `coach_day_${CoachDayId.MON}` },
      { text: getButtonText(CoachDayId.TUE), callback_data: `coach_day_${CoachDayId.TUE}` },
      { text: getButtonText(CoachDayId.WED), callback_data: `coach_day_${CoachDayId.WED}` },
      { text: getButtonText(CoachDayId.THU), callback_data: `coach_day_${CoachDayId.THU}` }
    ],
    // Пт-Вс
    [
      { text: getButtonText(CoachDayId.FRI), callback_data: `coach_day_${CoachDayId.FRI}` },
      { text: getButtonText(CoachDayId.SAT), callback_data: `coach_day_${CoachDayId.SAT}` },
      { text: getButtonText(CoachDayId.SUN), callback_data: `coach_day_${CoachDayId.SUN}` }
    ],
    // Только будни и Любой день
    [
      {
        text: coachDayLabels.get(CoachDayId.WEEKDAYS) || 'Только будни',
        callback_data: `coach_day_${CoachDayId.WEEKDAYS}`
      },
      {
        text: coachDayLabels.get(CoachDayId.ANY) || 'Любой день',
        callback_data: `coach_day_${CoachDayId.ANY}`
      }
    ],
    // Готово
    [{ text: '✔️ Готово', callback_data: 'coach_day_done' }]
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
async function getPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  sport: Sport
): Promise<TelegramBot.InlineKeyboardButton[][]> {
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
  
  // Проверяем флаг для кнопки "Подобрать тренера"
  const showFindCoach = await getRemoteConfigValue('show_find_coach', false);

  if (showFindCoach) {
    buttons.push([{ text: '👤 Подобрать тренера', callback_data: 'find_coach_start' }]);
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
  
  const mainMenuKeyboard = await getMainMenuKeyboard();
  await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: mainMenuKeyboard,
      resize_keyboard: true
    }
  });
}

// Обработка команды /help
async function handleHelp(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  
  await getBot().sendMessage(chatId, USER_TEXTS.HELP, { parse_mode: 'Markdown' });
}

/**
 * Обработка поиска тренеров
 */
async function handleCoachSearch(
  chatId: number,
  userId: number,
  trainingType: 'individual' | 'group' | 'any',
  query: TelegramBot.CallbackQuery,
  messageId?: number,
  fromMainMenu: boolean = false
) {
  // Получаем районы пользователя для фильтрации
  const userProfile = await getUserProfile(userId);
  const userDistricts = userProfile?.districts || [];
  
  // Получаем список активных тренеров
  const coaches = await getActiveCoaches(trainingType, userDistricts);
  
  if (coaches.length === 0) {
    const errorMessage = '😔 К сожалению, сейчас нет доступных тренеров с такими параметрами.\n\n' +
      'Попробуйте изменить фильтры или вернитесь позже.';
    const errorKeyboard = {
      inline_keyboard: [
        [{ text: '🔄 Попробовать снова', callback_data: 'find_coach_start' }],
        [{ text: '🏠 На главную', callback_data: 'action_home' }]
      ]
    };
    
    if (messageId) {
      await safeEditMessageText(errorMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: errorKeyboard
      });
    } else {
      await getBot().sendMessage(chatId, errorMessage, {
        reply_markup: errorKeyboard
      });
    }
    await safeAnswerCallbackQuery(query.id);
    return;
  }
  
  // Сохраняем состояние поиска
  const searchState: CoachSearchState = {
    coachIds: coaches.map(c => c.userId),
    currentIndex: 0,
    trainingType,
    fromMainMenu
  };
  coachSearchStates.set(userId, searchState);
  
  // Показываем первую карточку
  await showCoachCard(chatId, userId, searchState, messageId);
  await safeAnswerCallbackQuery(query.id);
}

/**
 * Проверяет, является ли fileId валидным для использования в Telegram API
 * fileId должен быть непустой строкой и не должен быть URL
 */
function isValidFileId(fileId: string | undefined): boolean {
  if (!fileId || fileId.trim().length === 0) {
    return false;
  }
  // Проверяем, что это не URL (не начинается с http:// или https://)
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
    return false;
  }
  return true;
}

/**
 * Проверяет доступность файла через Telegram API
 * Возвращает true, если файл доступен, false в противном случае
 */
async function isFileAvailable(fileId: string): Promise<boolean> {
  try {
    await getBot().getFile(fileId);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.log(`[isFileAvailable] File ${fileId} is not available: ${errorMessage}`);
    return false;
  }
}

/**
 * Показывает карточку тренера
 */
async function showCoachCard(
  chatId: number,
  userId: number,
  searchState: CoachSearchState,
  messageId?: number
) {
  console.log(`[showCoachCard] Showing coach card for user ${userId}, index ${searchState.currentIndex}/${searchState.coachIds.length - 1}, messageId: ${messageId || 'none'}`);
  
  const coachUserId = searchState.coachIds[searchState.currentIndex];
  const coachProfile = await getUserProfile(parseInt(coachUserId));
  
  if (!coachProfile) {
    console.error(`[showCoachCard] Coach profile not found: ${coachUserId}`);
    return;
  }
  
  const text = formatCoachCard(coachProfile, searchState.currentIndex, searchState.coachIds.length);
  
  // Формируем кнопки навигации
  const buttons: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Кнопка связи с тренером
  buttons.push([{ text: '📩 Связаться с тренером', callback_data: `coach_request_${coachUserId}` }]);
  
  // Кнопка "Показать все медиа" если медиа больше 1
  if (coachProfile.coachMedia && coachProfile.coachMedia.length > 1) {
    buttons.push([{ text: '📸 Показать другие фото/видео', callback_data: `coach_show_media_${coachUserId}` }]);
  }
  
  // Кнопка "Показать всех тренеров" (показываем только если тренеров больше 5)
  if (searchState.coachIds.length > 5) {
    buttons.push([{ text: '👥 Показать всех тренеров', callback_data: 'coach_show_all' }]);
  }
  
  // Кнопки навигации внизу (если больше одного тренера)
  if (searchState.coachIds.length > 1) {
    const navRow: TelegramBot.InlineKeyboardButton[] = [];
    
    if (searchState.currentIndex > 0) {
      navRow.push({ text: '◀️ Назад', callback_data: 'coach_prev' });
    }
    
    // Кнопка с номером тренера в центре
    const currentNumber = searchState.currentIndex + 1;
    const totalNumber = searchState.coachIds.length;
    navRow.push({ text: `${currentNumber}/${totalNumber}`, callback_data: 'coach_noop' }); // noop - не делает ничего
    
    if (searchState.currentIndex < searchState.coachIds.length - 1) {
      navRow.push({ text: 'Вперед ▶️', callback_data: 'coach_next' });
    }
    
    if (navRow.length > 0) {
      buttons.push(navRow);
    }
  }
  
  const keyboard = { inline_keyboard: buttons };
  
  // Проверяем длину текста (Telegram ограничивает caption до 1024 символов)
  const maxCaptionLength = 1024;
  let caption = text;
  
  if (caption.length > maxCaptionLength) {
    console.log(`[showCoachCard] Caption too long (${caption.length}), truncating`);
    // Обрезаем текст, но проверяем, что не ломаем HTML-теги
    let truncated = caption.substring(0, maxCaptionLength - 50); // Оставляем больше места для закрывающих тегов
    
    // Проверяем, есть ли незакрытый blockquote
    const blockquoteOpenCount = (truncated.match(/<blockquote[^>]*>/g) || []).length;
    const blockquoteCloseCount = (truncated.match(/<\/blockquote>/g) || []).length;
    
    // Если есть незакрытый blockquote, закрываем его
    if (blockquoteOpenCount > blockquoteCloseCount) {
      truncated += '</blockquote>';
    }
    
    caption = truncated;
  }
  
  // Если есть медиа, отправляем первое медиа с описанием
  if (coachProfile.coachMedia && coachProfile.coachMedia.length > 0) {
    // Ищем первую попавшуюся фотографию, если нет - берем первый элемент
    const firstMedia = coachProfile.coachMedia.find(media => media.type === 'photo') || coachProfile.coachMedia[0];
    
    console.log(`[showCoachCard] Found media: type=${firstMedia.type}, fileId=${firstMedia.fileId}, publicUrl=${firstMedia.publicUrl || 'none'}`);
    
    // Проверяем валидность fileId
    if (!isValidFileId(firstMedia.fileId)) {
      console.error(`[showCoachCard] Invalid fileId format for media: ${firstMedia.fileId}`);
      // Отправляем только текст, если fileId невалиден
      // Если есть старое сообщение с медиа, удаляем его и отправляем новое текстовое
      if (messageId) {
        try {
          await getBot().deleteMessage(chatId, messageId);
          console.log(`[showCoachCard] Deleted old message ${messageId} with invalid media`);
        } catch (error) {
          console.error('[showCoachCard] Error deleting old message:', error);
          // Продолжаем даже если не удалось удалить
        }
      }
      // Отправляем новое текстовое сообщение
      try {
        console.log(`[showCoachCard] Sending text message without media (invalid fileId)`);
        await getBot().sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        console.log(`[showCoachCard] Successfully sent text message without media`);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error(`[showCoachCard] Error sending text message: ${errorMessage}`);
        // Пытаемся отправить без форматирования, если HTML не работает
        try {
          await getBot().sendMessage(chatId, text.replace(/<[^>]*>/g, ''), {
            reply_markup: keyboard
          });
        } catch (fallbackError) {
          console.error(`[showCoachCard] Error sending fallback message: ${getErrorMessage(fallbackError)}`);
        }
      }
      return;
    }
    
    // Проверяем доступность файла через Telegram API
    const fileAvailable = await isFileAvailable(firstMedia.fileId!);
    console.log(`[showCoachCard] File available check: ${fileAvailable}, publicUrl: ${firstMedia.publicUrl || 'none'}`);
    
    if (!fileAvailable) {
      console.error(`[showCoachCard] File ${firstMedia.fileId} is not available (expired or invalid)`);
      
      // Пытаемся использовать publicUrl из GCS, если он есть
      if (firstMedia.publicUrl && (firstMedia.publicUrl.startsWith('http://') || firstMedia.publicUrl.startsWith('https://'))) {
        console.log(`[showCoachCard] Using publicUrl from GCS: ${firstMedia.publicUrl}`);
        
        // При редактировании сообщения с медиа - удаляем старое и отправляем новое
        if (messageId) {
          try {
            await getBot().deleteMessage(chatId, messageId);
            console.log(`[showCoachCard] Deleted old message ${messageId}`);
          } catch (error) {
            console.error('[showCoachCard] Error deleting old message:', error);
          }
        }
        
        try {
          // Отправляем медиа через publicUrl
          if (firstMedia.type === 'photo') {
            console.log(`[showCoachCard] Sending photo via publicUrl: ${firstMedia.publicUrl}`);
            await getBot().sendPhoto(chatId, firstMedia.publicUrl, {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
            console.log(`[showCoachCard] Successfully sent photo via publicUrl`);
          } else if (firstMedia.type === 'video') {
            console.log(`[showCoachCard] Sending video via publicUrl: ${firstMedia.publicUrl}`);
            await getBot().sendVideo(chatId, firstMedia.publicUrl, {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
            console.log(`[showCoachCard] Successfully sent video via publicUrl`);
          }
          return;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          console.error(`[showCoachCard] Error sending media via publicUrl: ${errorMessage}`);
          // Fallback: продолжаем отправку текста
        }
      } else {
        console.log(`[showCoachCard] No publicUrl available or invalid format. publicUrl: ${firstMedia.publicUrl || 'undefined'}`);
      }
      
      // Если publicUrl нет или не сработал, отправляем только текст
      // Если есть старое сообщение с медиа, удаляем его и отправляем новое текстовое
      if (messageId) {
        try {
          await getBot().deleteMessage(chatId, messageId);
          console.log(`[showCoachCard] Deleted old message ${messageId} with unavailable media`);
        } catch (error) {
          console.error('[showCoachCard] Error deleting old message:', error);
          // Продолжаем даже если не удалось удалить
        }
      }
      // Отправляем новое текстовое сообщение
      try {
        console.log(`[showCoachCard] Sending text message without media (file unavailable, no publicUrl)`);
        await getBot().sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        console.log(`[showCoachCard] Successfully sent text message without media`);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error(`[showCoachCard] Error sending text message: ${errorMessage}`);
        // Пытаемся отправить без форматирования, если HTML не работает
        try {
          await getBot().sendMessage(chatId, text.replace(/<[^>]*>/g, ''), {
            reply_markup: keyboard
          });
        } catch (fallbackError) {
          console.error(`[showCoachCard] Error sending fallback message: ${getErrorMessage(fallbackError)}`);
        }
      }
      return;
    }
    
    // При редактировании сообщения с медиа - удаляем старое и отправляем новое
    if (messageId) {
      console.log(`[showCoachCard] Deleting old message ${messageId} with media`);
      try {
        await getBot().deleteMessage(chatId, messageId);
        console.log(`[showCoachCard] Successfully deleted message ${messageId}`);
      } catch (error) {
        console.error('[showCoachCard] Error deleting message:', error);
        // Продолжаем даже если не удалось удалить
      }
    } else {
      console.log('[showCoachCard] No messageId provided, sending new message');
    }
    
    try {
      if (firstMedia.type === 'photo') {
        console.log(`[showCoachCard] Sending photo with fileId: ${firstMedia.fileId}`);
        await getBot().sendPhoto(chatId, firstMedia.fileId!, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        console.log(`[showCoachCard] Successfully sent photo with fileId`);
      } else if (firstMedia.type === 'video') {
        console.log(`[showCoachCard] Sending video with fileId: ${firstMedia.fileId}`);
        await getBot().sendVideo(chatId, firstMedia.fileId!, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        console.log(`[showCoachCard] Successfully sent video with fileId`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(`[showCoachCard] Error sending media with fileId: ${errorMessage}`);
      
      // Fallback: пытаемся использовать publicUrl, если он есть
      if (firstMedia.publicUrl && (firstMedia.publicUrl.startsWith('http://') || firstMedia.publicUrl.startsWith('https://'))) {
        console.log(`[showCoachCard] Trying fallback with publicUrl: ${firstMedia.publicUrl}`);
        try {
          if (firstMedia.type === 'photo') {
            await getBot().sendPhoto(chatId, firstMedia.publicUrl, {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
            console.log(`[showCoachCard] Successfully sent photo via publicUrl (fallback)`);
            return;
          } else if (firstMedia.type === 'video') {
            await getBot().sendVideo(chatId, firstMedia.publicUrl, {
              caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
            console.log(`[showCoachCard] Successfully sent video via publicUrl (fallback)`);
            return;
          }
        } catch (fallbackError) {
          const fallbackErrorMessage = getErrorMessage(fallbackError);
          console.error(`[showCoachCard] Error sending media via publicUrl (fallback): ${fallbackErrorMessage}`);
        }
      }
      
      // Если все попытки не удались, отправляем текст отдельно
      console.log(`[showCoachCard] All media sending attempts failed, sending text only`);
      await getBot().sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
  } else {
    // Без медиа - просто текст с кнопками
    if (messageId) {
      await safeEditMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      await getBot().sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
  }
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

  // Проверяем, это ответ на вопрос "Как вас зовут?" при регистрации тренера
  if (userId && text) {
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    const currentStep = coachRegistrationStates.get(userId);
    
    if (isNotCommand && currentStep === CoachRegistrationStep.NAME) {
      // Сохраняем имя тренера
      const profile = await getUserProfile(userId) || {};
      profile.coachName = text;
      profile.coachDistricts = []; // Инициализируем пустой выбор районов
      await saveUserProfile(userId, profile);

      // Шаг 2: Спрашиваем районы (это callback, не текстовый ответ)
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_DISTRICTS, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: getCoachDistrictKeyboard([])
        }
      });
      return;
    }
  }

  // Проверяем, это ответ на вопрос о цене индивидуальной тренировки
  if (userId && text) {
    const currentStep = coachRegistrationStates.get(userId);
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    
    if (isNotCommand && currentStep === CoachRegistrationStep.PRICE_INDIVIDUAL) {
      // Проверяем, что введено только целое число
      const cleanText = text.trim();
      if (!/^\d+$/.test(cleanText)) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите только целое число (без пробелов, букв и дробных частей)');
        return;
      }
      
      const price = parseInt(cleanText, 10);
      if (isNaN(price) || price < 0) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите корректную цену (число в рублях или 0, если не ведёте такую тренировку)');
        return;
      }
      if (price > 50000) {
        await getBot().sendMessage(chatId, 'Цена не может превышать 50 000 рублей. Пожалуйста, введите корректную цену.');
        return;
      }
      
      const profile = await getUserProfile(userId) || {};
      profile.coachPriceIndividual = price;
      await saveUserProfile(userId, profile);

      // Шаг 4: Спрашиваем цену сплит тренировки
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_PRICE_SPLIT, {
        parse_mode: 'HTML',
        reply_markup: {
          remove_keyboard: true
        }
      });
      // Устанавливаем следующий шаг
      coachRegistrationStates.set(userId, CoachRegistrationStep.PRICE_SPLIT);
      return;
    }
  }

  // Проверяем, это ответ на вопрос о цене сплит тренировки
  if (userId && text) {
    const currentStep = coachRegistrationStates.get(userId);
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    
    if (isNotCommand && currentStep === CoachRegistrationStep.PRICE_SPLIT) {
      // Проверяем, что введено только целое число
      const cleanText = text.trim();
      if (!/^\d+$/.test(cleanText)) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите только целое число (без пробелов, букв и дробных частей)');
        return;
      }
      
      const price = parseInt(cleanText, 10);
      if (isNaN(price) || price < 0) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите корректную цену (число в рублях или 0, если не ведёте такую тренировку)');
        return;
      }
      if (price > 50000) {
        await getBot().sendMessage(chatId, 'Цена не может превышать 50 000 рублей. Пожалуйста, введите корректную цену.');
        return;
      }
      
      const profile = await getUserProfile(userId) || {};
      profile.coachPriceSplit = price;
      await saveUserProfile(userId, profile);

      // Шаг 5: Спрашиваем цену групповой тренировки
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_PRICE_GROUP, {
        parse_mode: 'HTML',
        reply_markup: {
          remove_keyboard: true
        }
      });
      // Устанавливаем следующий шаг
      coachRegistrationStates.set(userId, CoachRegistrationStep.PRICE_GROUP);
      return;
    }
  }

  // Проверяем, это ответ на вопрос о цене групповой тренировки
  if (userId && text) {
    const currentStep = coachRegistrationStates.get(userId);
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    
    if (isNotCommand && currentStep === CoachRegistrationStep.PRICE_GROUP) {
      // Проверяем, что введено только целое число
      const cleanText = text.trim();
      if (!/^\d+$/.test(cleanText)) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите только целое число (без пробелов, букв и дробных частей)');
        return;
      }
      
      const price = parseInt(cleanText, 10);
      if (isNaN(price) || price < 0) {
        await getBot().sendMessage(chatId, 'Пожалуйста, введите корректную цену (число в рублях или 0, если не ведёте такую тренировку)');
        return;
      }
      if (price > 50000) {
        await getBot().sendMessage(chatId, 'Цена не может превышать 50 000 рублей. Пожалуйста, введите корректную цену.');
        return;
      }
      
      const profile = await getUserProfile(userId) || {};
      profile.coachPriceGroup = price;
      profile.coachAvailableDays = []; // Инициализируем пустой выбор дней
      await saveUserProfile(userId, profile);

      // Шаг 6: Спрашиваем дни недели (это callback, не текстовый ответ, поэтому не меняем шаг)
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_DAYS, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: getCoachDaysKeyboard([])
        }
      });
      return;
    }
  }

  // Проверяем, это ответ на вопрос о тренере
  if (userId && text) {
    const currentStep = coachRegistrationStates.get(userId);
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    
    if (isNotCommand && currentStep === CoachRegistrationStep.ABOUT) {
      // Проверяем длину текста
      if (text.length > 800) {
        await getBot().sendMessage(chatId, USER_TEXTS.COACH_ABOUT_TOO_LONG(text.length), {
          parse_mode: 'HTML'
        });
        return;
      }

      const profile = await getUserProfile(userId) || {};
      profile.coachAbout = text;
      await saveUserProfile(userId, profile);

      // Шаг 8: Загрузка медиа
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_MEDIA, {
        parse_mode: 'HTML'
      });
      // Устанавливаем шаг - ждем медиа
      coachRegistrationStates.set(userId, CoachRegistrationStep.MEDIA);
      // Инициализируем массив медиа
      profile.coachMedia = [];
      await saveUserProfile(userId, profile);
      return;
    }

    // Обработка ввода контакта (шаг 9)
    if (isNotCommand && currentStep === CoachRegistrationStep.CONTACT) {
      const profile = await getUserProfile(userId) || {};
      profile.coachContact = text;
      profile.isCoach = true; // Помечаем пользователя как тренера
      await saveUserProfile(userId, profile);
      
      // Удаляем из хранилища регистрации - регистрация завершена
      coachRegistrationStates.delete(userId);

      // Регистрация завершена
      await getBot().sendMessage(chatId, USER_TEXTS.COACH_REGISTRATION_COMPLETE, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👀 Посмотреть профиль', callback_data: 'coach_view_profile' }],
            [{ text: '✏️ Редактировать профиль', callback_data: 'coach_edit_profile' }],
            [{ text: '⏸ Не показывать временно', callback_data: 'coach_hide_profile' }]
          ]
        }
      });
      return;
    }
  }

  // Обработка редактирования профиля тренера
  if (userId && text) {
    const editStep = coachEditStates.get(userId);
    const isNotCommand = !text.startsWith('/') && !text.match(/^(🎾|🏓|👤|💬)/);
    
    // Редактирование имени
    if (isNotCommand && editStep === CoachEditStep.NAME) {
      const profile = await getUserProfile(userId) || {};
      profile.coachName = text;
      await saveUserProfile(userId, profile);
      
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, `✅ Имя обновлено: <b>${text}</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      return;
    }
    
    // Редактирование цен
    if (isNotCommand && (
      editStep === CoachEditStep.PRICE_INDIVIDUAL ||
      editStep === CoachEditStep.PRICE_SPLIT ||
      editStep === CoachEditStep.PRICE_GROUP
    )) {
      const cleanText = text.trim();
      
      // Валидация
      if (!/^\d+$/.test(cleanText)) {
        await getBot().sendMessage(chatId, USER_TEXTS.COACH_PRICE_INVALID_FORMAT);
        return;
      }
      
      const price = parseInt(cleanText);
      if (price < 0 || price > 50000) {
        await getBot().sendMessage(chatId, USER_TEXTS.COACH_PRICE_INVALID_RANGE);
        return;
      }
      
      const profile = await getUserProfile(userId) || {};
      
      if (editStep === CoachEditStep.PRICE_INDIVIDUAL) {
        profile.coachPriceIndividual = price;
      } else if (editStep === CoachEditStep.PRICE_SPLIT) {
        profile.coachPriceSplit = price;
      } else if (editStep === CoachEditStep.PRICE_GROUP) {
        profile.coachPriceGroup = price;
      }
      
      await saveUserProfile(userId, profile);
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, `✅ Цена обновлена: <b>${price} ₽</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      return;
    }
    
    // Редактирование описания
    if (isNotCommand && editStep === CoachEditStep.ABOUT) {
      if (text.length > 800) {
        await getBot().sendMessage(chatId, USER_TEXTS.COACH_ABOUT_TOO_LONG(text.length), {
          parse_mode: 'HTML'
        });
        return;
      }
      
      const profile = await getUserProfile(userId) || {};
      profile.coachAbout = text;
      await saveUserProfile(userId, profile);
      
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, '✅ Информация о себе обновлена', {
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      return;
    }
    
    // Редактирование контакта
    if (isNotCommand && editStep === CoachEditStep.CONTACT) {
      const profile = await getUserProfile(userId) || {};
      profile.coachContact = text;
      await saveUserProfile(userId, profile);
      
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, `✅ Контакт обновлен: <b>${text}</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      return;
    }
  }
  
  /**
   * Определяет, является ли документ видео по MIME type или расширению
   */
  function isVideoDocument(document: TelegramBot.Document): boolean {
    if (document.mime_type) {
      return document.mime_type.startsWith('video/');
    }
    
    // Проверяем по расширению файла, если MIME type не указан
    if (document.file_name) {
      const ext = document.file_name.split('.').pop()?.toLowerCase();
      const videoExtensions = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv', 'm4v', '3gp'];
      return videoExtensions.includes(ext || '');
    }
    
    return false;
  }

  // Обработка медиа при редактировании
  if (userId) {
    const editStep = coachEditStates.get(userId);
    
    if (editStep === CoachEditStep.MEDIA && (msg.photo || msg.video || msg.document)) {
      let fileId: string | undefined;
      let fileType: 'photo' | 'video' | undefined;
      
      if (msg.photo && msg.photo.length > 0) {
        fileId = msg.photo[msg.photo.length - 1].file_id;
        fileType = 'photo';
      } else if (msg.video) {
        fileId = msg.video.file_id;
        fileType = 'video';
      } else if (msg.document && isVideoDocument(msg.document)) {
        // Обрабатываем документ как видео, если это видео-файл (например, MOV)
        fileId = msg.document.file_id;
        fileType = 'video';
        console.log(`[handleMessage] Detected video document: ${msg.document.file_name || 'unknown'}, mime_type: ${msg.document.mime_type || 'unknown'}`);
      }
      
      if (fileId && fileType) {
        const mediaGroupId = msg.media_group_id;
        await processMediaFile(fileId, fileType, userId, chatId, 'edit', mediaGroupId);
      }
      return;
    }
  }

  // Проверяем, это загрузка фото/видео при регистрации тренера
  if (userId) {
    const currentStep = coachRegistrationStates.get(userId);
    
    if (currentStep === CoachRegistrationStep.MEDIA && (msg.photo || msg.video || msg.document)) {
      // Получаем file_id и тип файла
      let fileId: string | undefined;
      let fileType: 'photo' | 'video' | undefined;
      
      if (msg.photo && msg.photo.length > 0) {
        // Берем фото наибольшего размера
        fileId = msg.photo[msg.photo.length - 1].file_id;
        fileType = 'photo';
      } else if (msg.video) {
        fileId = msg.video.file_id;
        fileType = 'video';
      } else if (msg.document && isVideoDocument(msg.document)) {
        // Обрабатываем документ как видео, если это видео-файл (например, MOV)
        fileId = msg.document.file_id;
        fileType = 'video';
        console.log(`[handleMessage] Detected video document: ${msg.document.file_name || 'unknown'}, mime_type: ${msg.document.mime_type || 'unknown'}`);
      }
      
      if (fileId && fileType) {
        console.log(`[handleMessage] Processing ${fileType} with fileId: ${fileId}`);
        const mediaGroupId = msg.media_group_id;
        await processMediaFile(fileId, fileType, userId, chatId, 'registration', mediaGroupId);
      }
      return;
    }
  }

  switch (text) {
    case '🎾 Найти корт (теннис)':
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
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
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
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
      break;
    case '⚙️ Еще':
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
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
            command: 'more',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      // Получаем профиль для определения статуса тренера
      const userProfileForMenu = userId ? await getUserProfile(userId) : null;
      const isCoachForMenu = userProfileForMenu?.isCoach || false;
      const moreMenuCoachButtonText = isCoachForMenu ? '🏆 Мой профиль тренера' : '✅ Зарегистрироваться как тренер';
      const moreMenuCoachButtonData = isCoachForMenu ? 'coach_view_profile' : 'profile_toggle_coach';
      
      // Показываем подменю "Еще" с inline-кнопками
      await getBot().sendMessage(chatId, 'Выберите действие:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: moreMenuCoachButtonText, callback_data: moreMenuCoachButtonData }],
            [{ text: '🏓 Найти корт (падел)', callback_data: 'find_padel_court' }],
            [{ text: '⭐ Избранные корты', callback_data: 'profile_favorites' }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }],
          ]
        }
      });
      break;
    case '◀️ Назад':
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
      // Возвращаемся на главное меню
      const profile = userId ? await getUserProfile(userId) : null;
      const userName = profile?.name || msg.from?.first_name || 'друг';
      
      const mainMenuKeyboard = await getMainMenuKeyboard();
      await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: mainMenuKeyboard,
          resize_keyboard: true
        }
      });
      break;
    case '💬 Чат участников':
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
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
    case '👤 Найти тренера':
      // Сбрасываем состояние заполнения анкеты тренера
      if (userId) {
        coachRegistrationStates.delete(userId);
      }
      
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
            command: 'find_coach',
            username: msg.from?.username,
            languageCode: msg.from?.language_code,
          },
        }).catch(err => {
          console.error('Error tracking button click:', err);
        });
      }
      
      // Показываем вопрос о типе тренировки
      // Используем специальные callback_data с суффиксом _main для запросов из главного меню
      await getBot().sendMessage(chatId, 
        'Ответьте на один вопрос — и я покажу подходящих тренеров.\n\n' +
        '<b>Как хотите тренироваться?</b>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎾 1 на 1 (тренер + я)', callback_data: 'find_coach_type_individual_main' }],
              [{ text: '👥 Будем вдвоём / втроём (приведу друзей)', callback_data: 'find_coach_type_group_main' }],
              [{ text: '⏭ Не важно', callback_data: 'find_coach_type_any_main' }]
            ]
          }
        }
      );
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
      
      // Получаем профиль пользователя
      const profileData = userId ? await getUserProfile(userId) : null;
      const profileName = profileData?.name || msg.from?.first_name || 'друг';
      const favoriteCourtsCount = profileData?.favorites?.length || 0;
      const isCoach = profileData?.isCoach || false;
      
      // Формируем сообщение профиля
      let profileMessage = `👤 *Профиль*\n\n`;
      profileMessage += `Имя: ${profileName}\n`;
      profileMessage += `Избранных кортов: ${favoriteCourtsCount}\n`;
      profileMessage += `Статус: ${isCoach ? '🏆 Тренер' : 'Игрок'}\n\n`;
      profileMessage += `Что хочешь сделать?`;
      
      const coachButtonText = isCoach ? '🏆 Мой профиль тренера' : '✅ Зарегистрироваться как тренер';
      const coachButtonData = isCoach ? 'coach_view_profile' : 'profile_toggle_coach';
      
      await getBot().sendMessage(chatId, profileMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Избранные корты', callback_data: 'profile_favorites' }],
            [{ text: coachButtonText, callback_data: coachButtonData }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }]
          ]
        }
      });
      break;
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
      
      // Сохраняем информацию о последнем поиске корта в профиль пользователя
      try {
        const locationLabels: Record<string, string> = {
          north: 'Север',
          west: 'Запад',
          center: 'Центр',
          east: 'Восток',
          south: 'Юг',
          'moscow-region': 'Подмосковье',
          any: 'Не важно'
        };
        
        const timeLabels: Record<string, string> = {
          morning: 'Утро (до 12:00)',
          afternoon: 'День (12:00-18:00)',
          evening: 'Вечер (после 18:00)',
          any: 'Любое время'
        };
        
        // Форматируем локации
        const locationStr = searchState.selectedLocations
          .map(loc => locationLabels[loc] || loc)
          .join(', ');
        
        // Форматируем время
        const timeStr = searchState.selectedTimeSlots
          .map(time => timeLabels[time] || time)
          .join(', ');
        
        // Обновляем профиль с информацией о поиске
        const currentProfile = await getUserProfile(userId);
        if (currentProfile) {
          currentProfile.lastCourtSearch = {
            date: searchState.dateStr,
            time: timeStr,
            location: locationStr,
            timestamp: Date.now()
          };
          await saveUserProfile(userId, currentProfile);
          console.log(`[location_done] Saved court search info for user ${userId}`);
        }
      
      } catch (error) {
        console.error('[location_done] Error saving court search info:', error);
        // Продолжаем даже если не удалось сохранить
      }
      
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
                inline_keyboard: await getPaginationKeyboard(1, totalPages, searchState.sport)
              }
            });
          } else {
            await getBot().sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: await getPaginationKeyboard(1, totalPages, searchState.sport)
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
          inline_keyboard: await getPaginationKeyboard(page, searchState.totalPages || 1, searchState.sport)
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
          inline_keyboard: await getPaginationKeyboard(currentPage, totalPages, searchState.sport)
        }
      });
    } else {
      await getBot().sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: await getPaginationKeyboard(currentPage, totalPages, searchState.sport)
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

  // Обработка кнопки "Найти корт (падел)" из меню "Еще"
  if (data === 'find_padel_court') {
    // Сбрасываем состояние заполнения анкеты тренера
    coachRegistrationStates.delete(userId);
    
    await safeEditMessageText(
      USER_TEXTS.DATE_SELECTION,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: `date_today_${SportType.PADEL}` }],
            [{ text: '📆 Завтра', callback_data: `date_tomorrow_${SportType.PADEL}` }],
            [{ text: '🗓 Указать дату', callback_data: `date_custom_${SportType.PADEL}` }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Обработка кнопки "Профиль" из меню "Еще"
  if (data === 'profile_show') {
    // Сбрасываем состояние заполнения анкеты тренера
    coachRegistrationStates.delete(userId);
    
    // Получаем профиль пользователя
    const profileData = await getUserProfile(userId) || {};
    const profileName = profileData?.name || query.from.first_name || 'друг';
    const favoriteCourtsCount = profileData?.favorites?.length || 0;
    const isCoach = profileData?.isCoach || false;
    
    // Формируем сообщение профиля
    let profileMessage = `👤 *Профиль*\n\n`;
    profileMessage += `Имя: ${profileName}\n`;
    profileMessage += `Избранных кортов: ${favoriteCourtsCount}\n`;
    profileMessage += `Статус: ${isCoach ? '🏆 Тренер' : 'Игрок'}\n\n`;
    profileMessage += `Что хочешь сделать?`;
    
    const coachButtonText = isCoach ? '🏆 Мой профиль тренера' : '🏆 Я тренер';
    const coachButtonData = isCoach ? 'coach_view_profile' : 'profile_toggle_coach';
    
    await safeEditMessageText(
      profileMessage,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Избранные корты', callback_data: 'profile_favorites' }],
            [{ text: coachButtonText, callback_data: coachButtonData }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Обработка кнопки "Избранные корты" из профиля
  if (data === 'profile_favorites') {
    // Сбрасываем состояние заполнения анкеты тренера
    coachRegistrationStates.delete(userId);
    
    // Проверяем, есть ли у пользователя избранные корты
    const userProfile = await getUserProfile(userId) || {};
    const favoriteCourts = userProfile.favorites || [];
    
    if (favoriteCourts.length === 0) {
      // Нет избранных кортов - показываем предложение добавить
      await safeEditMessageText(
        'Избранные корты — твой быстрый доступ к любимым площадкам.\n\n' +
        '• в 1 клик будешь видеть ближайшие слоты только по ним\n' +
        '• в общем поиске они будут вверху списка\n\n' +
        'Добавим?',
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
    } else {
      // Есть избранные корты - сразу показываем ближайшие слоты
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
                [{ text: '📅 Выбрать другую дату', callback_data: `favorites_date_custom` }]
              ]
            }
          }
        );
      }
    }
    return;
  }

  // Обработка кнопки "Я тренер"
  if (data === 'profile_toggle_coach') {
    // Сбрасываем состояние заполнения анкеты тренера (если было начато ранее)
    coachRegistrationStates.delete(userId);
    
    const coachMessage = `<b>Зарегистрируйтесь в Play Today — сейчас это бесплатно.</b>\n\n` +
      `Мы показываем профили тренеров игрокам, которые ищут занятия в <b>ваших районах</b> — так вы получаете <b>новые заявки</b> на тренировки.\n\n` +
      `Вы сможете принимать запросы на: <b>индивидуальные / сплит / групповые занятия.</b>\n\n` +
      `✅ Заполните короткую анкету (≈2 минуты), и мы добавим вас в каталог тренеров.\n\n` +
      `Нажмите "Заполнить анкету", чтобы начать регистрацию.`;
    
    await safeEditMessageText(
      coachMessage,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Заполнить анкету', callback_data: 'coach_register' }],
            [{ text: '⬅️ Назад', callback_data: 'profile_back' }]
          ]
        }
      }
    );
    return;
  }

  // Обработка кнопки "Назад" из профиля тренера
  if (data === 'profile_back') {
    const userProfile = await getUserProfile(userId) || {};
    const profileName = userProfile.name || query.from.first_name || 'друг';
    const favoriteCourtsCount = userProfile.favorites?.length || 0;
    const isCoach = userProfile.isCoach || false;
    
    let profileMessage = `👤 *Профиль*\n\n`;
    profileMessage += `Имя: ${profileName}\n`;
    profileMessage += `Избранных кортов: ${favoriteCourtsCount}\n`;
    profileMessage += `Статус: ${isCoach ? '🏆 Тренер' : 'Игрок'}\n\n`;
    profileMessage += `Что хочешь сделать?`;
    
    const coachButtonText = isCoach ? '🏆 Мой профиль тренера' : '🏆 Я тренер';
    const coachButtonData = isCoach ? 'coach_view_profile' : 'profile_toggle_coach';
    
    await safeEditMessageText(
      profileMessage,
      {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Избранные корты', callback_data: 'profile_favorites' }],
            [{ text: coachButtonText, callback_data: coachButtonData }],
            [{ text: '◀️ Назад', callback_data: 'action_home' }]
          ]
        }
      }
    );
    return;
  }

  // Обработка регистрации тренера
  if (data === 'coach_register') {
    // Спрашиваем имя тренера
    const mainMenuKeyboard3 = await getMainMenuKeyboard();
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_NAME, {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: mainMenuKeyboard3,
        resize_keyboard: true
      }
    });
    // Устанавливаем шаг регистрации - ждем имя
    coachRegistrationStates.set(userId, CoachRegistrationStep.NAME);
    return;
  }

  // Обработка выбора района тренера
  if (data?.startsWith('coach_district_') && !data.includes('done')) {
    const districtId = data.replace('coach_district_', '');
    const profile = await getUserProfile(userId) || {};
    const selectedDistricts = profile.coachDistricts || [];
    
    let newDistricts: string[];
    
    if (districtId === LocationId.ANY) {
      // Если выбирается "Не важно" — сбрасываем остальные районы
      if (selectedDistricts.includes(LocationId.ANY)) {
        newDistricts = [];
      } else {
        newDistricts = [LocationId.ANY];
      }
    } else {
      // Если выбирается конкретный район — убираем "Не важно"
      const withoutAny = selectedDistricts.filter(d => d !== LocationId.ANY);
      if (withoutAny.includes(districtId)) {
        newDistricts = withoutAny.filter(d => d !== districtId);
      } else {
        newDistricts = [...withoutAny, districtId];
      }
    }
    
    profile.coachDistricts = newDistricts;
    await saveUserProfile(userId, profile);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getCoachDistrictKeyboard(newDistricts) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка завершения выбора районов тренера
  if (data === 'coach_district_done') {
    const profile = await getUserProfile(userId) || {};
    const selectedDistricts = profile.coachDistricts || [];
    
    if (selectedDistricts.length === 0) {
    await safeAnswerCallbackQuery(query.id, { 
        text: 'Выберите хотя бы один район!',
        show_alert: true
      });
      return;
    }
    
    // Проверяем, находимся ли мы в режиме редактирования
    const editStep = coachEditStates.get(userId);
    if (editStep === CoachEditStep.DISTRICTS) {
      // Завершаем редактирование районов
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, '✅ Районы обновлены', {
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      
      await safeAnswerCallbackQuery(query.id);
      return;
    }
    
    // Если не в режиме редактирования, продолжаем регистрацию
    // Шаг 3: Спрашиваем цену индивидуальной тренировки
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_PRICE_INDIVIDUAL, {
      parse_mode: 'HTML',
      reply_markup: {
        remove_keyboard: true
      }
    });
    // Устанавливаем шаг - ждем цену индивидуальной тренировки
    coachRegistrationStates.set(userId, CoachRegistrationStep.PRICE_INDIVIDUAL);
    return;
  }

  // Обработка выбора дня недели тренера
  if (data?.startsWith('coach_day_') && !data.includes('done')) {
    const dayId = data.replace('coach_day_', '');
    const profile = await getUserProfile(userId) || {};
    const selectedDays = profile.coachAvailableDays || [];
    
    let newDays: string[];
    
    if (dayId === CoachDayId.ANY) {
      // Если выбирается "Любой день" — выбираем все дни
      const hasAllDays = allDayIds.every(d => selectedDays.includes(d));
      if (hasAllDays) {
        newDays = [];
      } else {
        newDays = [...allDayIds];
      }
    } else if (dayId === CoachDayId.WEEKDAYS) {
      // Если выбирается "Только будни" — устанавливаем ТОЛЬКО Пн-Пт
      const hasAllWeekdays = weekdayIds.every(d => selectedDays.includes(d)) && 
                             !selectedDays.includes(CoachDayId.SAT) && 
                             !selectedDays.includes(CoachDayId.SUN);
      if (hasAllWeekdays) {
        // Если уже выбраны только будни - сбрасываем
        newDays = [];
      } else {
        // Устанавливаем только будни (Пн-Пт), убирая все остальное
        newDays = [...weekdayIds];
      }
    } else {
      // Если выбирается конкретный день — убираем "Любой день"
      const withoutSpecial = selectedDays.filter(d => d !== CoachDayId.ANY && d !== CoachDayId.WEEKDAYS);
      if (withoutSpecial.includes(dayId)) {
        newDays = withoutSpecial.filter(d => d !== dayId);
      } else {
        newDays = [...withoutSpecial, dayId];
      }
    }
    
    profile.coachAvailableDays = newDays;
    await saveUserProfile(userId, profile);
    
    // Обновляем клавиатуру
    await safeEditMessageReplyMarkup(
      { inline_keyboard: getCoachDaysKeyboard(newDays) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка завершения выбора дней тренера
  if (data === 'coach_day_done') {
    console.log('coach_day_done handler triggered');
    const profile = await getUserProfile(userId) || {};
    const selectedDays = profile.coachAvailableDays || [];
    console.log('Selected days:', selectedDays);
    
    if (selectedDays.length === 0) {
      console.log('No days selected, showing error');
      await safeAnswerCallbackQuery(query.id, {
        text: 'Выберите хотя бы один день!',
        show_alert: true
      });
      return;
    }
    
    // Проверяем, находимся ли мы в режиме редактирования
    const editStep = coachEditStates.get(userId);
    if (editStep === CoachEditStep.DAYS) {
      // Завершаем редактирование дней
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, '✅ Дни недели обновлены', {
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
      
      await safeAnswerCallbackQuery(query.id);
      return;
    }
    
    // Если не в режиме редактирования, продолжаем регистрацию
    console.log('Proceeding to about step');
    
    // Шаг 7: Спрашиваем информацию о тренере
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_ABOUT, {
      parse_mode: 'HTML',
      reply_markup: {
        remove_keyboard: true
      }
    });
    // Устанавливаем шаг - ждем информацию о тренере
    coachRegistrationStates.set(userId, CoachRegistrationStep.ABOUT);
    return;
  }

  // Обработка кнопки "Загрузить еще"
  if (data === 'coach_media_upload_more') {
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_UPLOAD_MORE_PROMPT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✔️ Готово', callback_data: 'coach_media_done' }]
        ]
      }
    });
    return;
  }

  // Обработка завершения загрузки медиа - переход к шагу контакта
  if (data === 'coach_media_done') {
    const username = query.from?.username || 'unknown';
    
    // Переходим к шагу контакта
    coachRegistrationStates.set(userId, CoachRegistrationStep.CONTACT);
    
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_ASK_CONTACT(username), {
      reply_markup: {
        inline_keyboard: [
          [{ text: `✅ Да, использовать @${username}`, callback_data: 'coach_contact_skip' }]
        ]
      }
    });
    return;
  }

  // Обработка пропуска контакта (использование текущего никнейма)
  if (data === 'coach_contact_skip') {
    const profile = await getUserProfile(userId) || {};
    const username = query.from?.username || 'unknown';
    profile.coachContact = `@${username}`;
    profile.isCoach = true; // Помечаем пользователя как тренера
    await saveUserProfile(userId, profile);
    
    // Удаляем из хранилища регистрации - регистрация завершена
    coachRegistrationStates.delete(userId);

    // Регистрация завершена
    await getBot().sendMessage(chatId, USER_TEXTS.COACH_REGISTRATION_COMPLETE, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👀 Посмотреть профиль', callback_data: 'coach_view_profile' }],
          [{ text: '✏️ Редактировать профиль', callback_data: 'coach_edit_profile' }],
          [{ text: '💤 Поставить на паузу', callback_data: 'coach_hide_profile' }]
        ]
      }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Просмотр профиля тренера
  if (data === 'coach_view_profile') {
    // Сбрасываем состояние заполнения анкеты тренера
    coachRegistrationStates.delete(userId);
    
    const profile = await getUserProfile(userId);
    
    if (!profile || !profile.isCoach) {
      await safeAnswerCallbackQuery(query.id, { text: 'Профиль не найден' });
      return;
    }
    
    // Формируем текст профиля
    let profileText = `👤 <b>${profile.coachName || 'Имя не указано'}</b>\n\n`;
    
    if (profile.coachAbout) {
      // Используем Collapsible Quotes с атрибутом expandable
      // Если описание больше 120 символов, помещаем его в expandable blockquote
      // Экранируем HTML-символы для безопасного парсинга
      if (profile.coachAbout.length > 120) {
        const escapedAbout = escapeHtml(profile.coachAbout);
        profileText += `📝 <b>О тренере:</b>\n<blockquote expandable>${escapedAbout}</blockquote>\n\n`;
      } else {
        const escapedAbout = escapeHtml(profile.coachAbout);
        profileText += `📝 <b>О тренере:</b>\n${escapedAbout}\n\n`;
      }
    }
    
    if (profile.coachDistricts && profile.coachDistricts.length > 0) {
      const locationLabels: Record<string, string> = {
        north: 'Север',
        west: 'Запад',
        center: 'Центр',
        east: 'Восток',
        south: 'Юг',
        'moscow-region': 'Подмосковье',
        any: 'Не важно'
      };
      const districts = profile.coachDistricts.map(d => locationLabels[d] || d).join(', ');
      profileText += `📍 <b>Районы:</b> ${districts}\n\n`;
    }
    
    if (profile.coachAvailableDays && profile.coachAvailableDays.length > 0) {
      const dayLabels: Record<string, string> = {
        mon: 'Пн',
        tue: 'Вт',
        wed: 'Ср',
        thu: 'Чт',
        fri: 'Пт',
        sat: 'Сб',
        sun: 'Вс'
      };
      const days = profile.coachAvailableDays.map(d => dayLabels[d] || d).join(', ');
      profileText += `📅 <b>Свободен:</b> ${days}\n\n`;
    }
    
    profileText += `💰 <b>Цены:</b>\n`;
    if (profile.coachPriceIndividual && profile.coachPriceIndividual > 0) {
      profileText += `   • Индивидуальная: ${profile.coachPriceIndividual} ₽/час\n`;
    }
    if (profile.coachPriceSplit && profile.coachPriceSplit > 0) {
      profileText += `   • Сплит: ${profile.coachPriceSplit} ₽/час с человека\n`;
    }
    if (profile.coachPriceGroup && profile.coachPriceGroup > 0) {
      profileText += `   • Групповая: ${profile.coachPriceGroup} ₽/час с человека\n`;
    }
    profileText += `\n`;
    
    if (profile.coachContact) {
      profileText += `📱 <b>Контакт:</b> ${profile.coachContact}`;
    }
    
    // Определяем текст кнопки видимости в зависимости от статуса профиля
    const isHidden = profile.coachHidden || false;
    const visibilityButtonText = isHidden ? '✅ Включить показы' : '💤 Поставить на паузу';
    const visibilityStatus = isHidden ? '🔴 <b>Профиль на паузе</b>' : '🟢 <b>Профиль активен</b>';
    
    // Формируем клавиатуру с кнопками
    const keyboardButtons: TelegramBot.InlineKeyboardButton[][] = [
      [{ text: '✏️ Редактировать', callback_data: 'coach_edit_profile' }],
      [{ text: visibilityButtonText, callback_data: 'coach_hide_profile' }]
    ];
    
    // Добавляем кнопку "Показать другие фото/видео" если медиа больше 1
    if (profile.coachMedia && profile.coachMedia.length > 1) {
      keyboardButtons.push([{ text: '📸 Показать другие фото/видео', callback_data: `coach_show_media_${userId}` }]);
    }
    
    keyboardButtons.push([{ text: '« Назад', callback_data: 'action_home' }]);
    
    const keyboard = {
      inline_keyboard: keyboardButtons
    };
    
    // Если есть медиа-файлы, отправляем только первое с текстом профиля
    if (profile.coachMedia && profile.coachMedia.length > 0) {
      const firstMedia = profile.coachMedia[0];
      
      // Добавляем статус видимости к тексту профиля
      let fullProfileText = profileText + `\n\n${visibilityStatus}`;
      
      // Проверяем длину текста (Telegram ограничивает caption до 1024 символов)
      const maxCaptionLength = 1024;
      let caption = fullProfileText;
      
      if (caption.length > maxCaptionLength) {
        console.log(`[coach_view_profile] Caption too long (${caption.length}), truncating`);
        caption = caption.substring(0, maxCaptionLength - 30);
      }
      
      // Проверяем валидность fileId
      if (!isValidFileId(firstMedia.fileId)) {
        console.error(`[coach_view_profile] Invalid fileId format for media: ${firstMedia.fileId}`);
        
        // Пытаемся использовать publicUrl из GCS, если он есть
        if (firstMedia.publicUrl && (firstMedia.publicUrl.startsWith('http://') || firstMedia.publicUrl.startsWith('https://'))) {
          console.log(`[coach_view_profile] Using publicUrl from GCS: ${firstMedia.publicUrl}`);
          try {
            if (firstMedia.type === 'photo') {
              await getBot().sendPhoto(chatId, firstMedia.publicUrl, {
                caption,
                parse_mode: 'HTML',
                reply_markup: keyboard
              });
            } else if (firstMedia.type === 'video') {
              await getBot().sendVideo(chatId, firstMedia.publicUrl, {
                caption,
                parse_mode: 'HTML',
                reply_markup: keyboard
              });
            }
            return;
          } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error(`[coach_view_profile] Error sending media via publicUrl: ${errorMessage}`);
            // Fallback: продолжаем отправку текста
          }
        }
        
        // Отправляем только текст, если fileId невалиден и publicUrl не сработал
        await getBot().sendMessage(chatId, fullProfileText, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        // Проверяем доступность файла через Telegram API
        const fileAvailable = await isFileAvailable(firstMedia.fileId!);
        if (!fileAvailable) {
          console.error(`[coach_view_profile] File ${firstMedia.fileId} is not available (expired or invalid)`);
          
          // Пытаемся использовать publicUrl из GCS, если он есть
          if (firstMedia.publicUrl && (firstMedia.publicUrl.startsWith('http://') || firstMedia.publicUrl.startsWith('https://'))) {
            console.log(`[coach_view_profile] Using publicUrl from GCS: ${firstMedia.publicUrl}`);
            try {
              if (firstMedia.type === 'photo') {
                await getBot().sendPhoto(chatId, firstMedia.publicUrl, {
                  caption,
                  parse_mode: 'HTML',
                  reply_markup: keyboard
                });
              } else if (firstMedia.type === 'video') {
                await getBot().sendVideo(chatId, firstMedia.publicUrl, {
                  caption,
                  parse_mode: 'HTML',
                  reply_markup: keyboard
                });
              }
              return;
            } catch (error) {
              const errorMessage = getErrorMessage(error);
              console.error(`[coach_view_profile] Error sending media via publicUrl: ${errorMessage}`);
              // Fallback: продолжаем отправку текста
            }
          }
          
          // Отправляем только текст, если файл недоступен и publicUrl не сработал
          await getBot().sendMessage(chatId, fullProfileText, {
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
        } else {
          try {
            // Отправляем первое медиа с текстом профиля и кнопками
            if (firstMedia.type === 'photo') {
              console.log(`[coach_view_profile] Sending photo with fileId: ${firstMedia.fileId}`);
              await getBot().sendPhoto(chatId, firstMedia.fileId!, {
                caption,
                parse_mode: 'HTML',
                reply_markup: keyboard
              });
            } else if (firstMedia.type === 'video') {
              console.log(`[coach_view_profile] Sending video with fileId: ${firstMedia.fileId}`);
              await getBot().sendVideo(chatId, firstMedia.fileId!, {
                caption,
                parse_mode: 'HTML',
                reply_markup: keyboard
              });
            }
          } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error(`[coach_view_profile] Error sending media: ${errorMessage}`);
            // Fallback: отправляем текст отдельно
            await getBot().sendMessage(chatId, fullProfileText, {
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
          }
        }
      }
    } else {
      // Если медиа нет, отправляем просто текст с кнопками
      const fullProfileText = profileText + `\n\n${visibilityStatus}`;
      await getBot().sendMessage(chatId, fullProfileText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование профиля тренера
  if (data === 'coach_edit_profile') {
    await getBot().sendMessage(chatId, '✏️ <b>Редактирование профиля</b>\n\nВыберите, что хотите изменить:', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 Имя', callback_data: 'coach_edit_name' }],
          [{ text: '📍 Районы', callback_data: 'coach_edit_districts' }],
          [{ text: '💰 Цены', callback_data: 'coach_edit_prices' }],
          [{ text: '📅 Дни доступности', callback_data: 'coach_edit_days' }],
          [{ text: '📝 О себе', callback_data: 'coach_edit_about' }],
          [{ text: '📸 Медиа', callback_data: 'coach_edit_media' }],
          [{ text: '📱 Контакт', callback_data: 'coach_edit_contact' }],
          [{ text: '« Назад', callback_data: 'coach_view_profile' }]
        ]
      }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование имени тренера
  if (data === 'coach_edit_name') {
    const profile = await getUserProfile(userId);
    const currentName = profile?.coachName || 'не указано';
    
    coachEditStates.set(userId, CoachEditStep.NAME);
    
    await getBot().sendMessage(chatId, 
      `✏️ <b>Изменение имени</b>\n\n` +
      `Текущее имя: <b>${currentName}</b>\n\n` +
      `Введите новое имя (Имя + Фамилия):`,
      { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }}
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование районов
  if (data === 'coach_edit_districts') {
    const profile = await getUserProfile(userId);
    coachEditStates.set(userId, CoachEditStep.DISTRICTS);
    
    await getBot().sendMessage(chatId, 
      `✏️ <b>Изменение районов</b>\n\n` +
      `Выберите районы, в которых вы тренируете:`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: getCoachDistrictKeyboard(profile?.coachDistricts || [])
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование цен
  if (data === 'coach_edit_prices') {
    const profile = await getUserProfile(userId);
    
    await getBot().sendMessage(chatId,
      `💰 <b>Текущие цены:</b>\n\n` +
      `Индивидуальная: ${profile?.coachPriceIndividual || 0} ₽/час\n` +
      `Сплит: ${profile?.coachPriceSplit || 0} ₽/час с человека\n` +
      `Групповая: ${profile?.coachPriceGroup || 0} ₽/час с человека\n\n` +
      `Что хотите изменить?`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Индивидуальная', callback_data: 'coach_edit_price_individual' }],
            [{ text: 'Сплит', callback_data: 'coach_edit_price_split' }],
            [{ text: 'Групповая', callback_data: 'coach_edit_price_group' }],
            [{ text: '« Назад', callback_data: 'coach_edit_profile' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование цены индивидуальной тренировки
  if (data === 'coach_edit_price_individual') {
    const profile = await getUserProfile(userId);
    const currentPrice = profile?.coachPriceIndividual || 0;
    
    coachEditStates.set(userId, CoachEditStep.PRICE_INDIVIDUAL);
    
    await getBot().sendMessage(chatId,
      `💰 <b>Цена индивидуальной тренировки</b>\n\n` +
      `Текущая цена: <b>${currentPrice} ₽/час</b>\n\n` +
      `Введите новую цену (только число, 0 если не ведете):`,
      { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }}
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование цены сплит тренировки
  if (data === 'coach_edit_price_split') {
    const profile = await getUserProfile(userId);
    const currentPrice = profile?.coachPriceSplit || 0;
    
    coachEditStates.set(userId, CoachEditStep.PRICE_SPLIT);
    
    await getBot().sendMessage(chatId,
      `💰 <b>Цена сплит тренировки</b>\n\n` +
      `Текущая цена: <b>${currentPrice} ₽/час с человека</b>\n\n` +
      `Введите новую цену (только число, 0 если не ведете):`,
      { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }}
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование цены групповой тренировки
  if (data === 'coach_edit_price_group') {
    const profile = await getUserProfile(userId);
    const currentPrice = profile?.coachPriceGroup || 0;
    
    coachEditStates.set(userId, CoachEditStep.PRICE_GROUP);
    
    await getBot().sendMessage(chatId,
      `💰 <b>Цена групповой тренировки</b>\n\n` +
      `Текущая цена: <b>${currentPrice} ₽/час с человека</b>\n\n` +
      `Введите новую цену (только число, 0 если не ведете):`,
      { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }}
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование дней доступности
  if (data === 'coach_edit_days') {
    const profile = await getUserProfile(userId);
    coachEditStates.set(userId, CoachEditStep.DAYS);
    
    await getBot().sendMessage(chatId,
      `📅 <b>Изменение дней доступности</b>\n\n` +
      `Выберите дни, когда вы свободны:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: getCoachDaysKeyboard(profile?.coachAvailableDays || [])
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование информации о себе
  if (data === 'coach_edit_about') {
    const profile = await getUserProfile(userId);
    const currentAbout = profile?.coachAbout || 'не указано';
    
    coachEditStates.set(userId, CoachEditStep.ABOUT);
    
    await getBot().sendMessage(chatId,
      `📝 <b>Изменение информации о себе</b>\n\n` +
      `Текущий текст:\n${currentAbout}\n\n` +
      `Введите новый текст (максимум 800 символов):`,
      { parse_mode: 'HTML', reply_markup: {
        inline_keyboard: [[{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]]
      }}
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование медиа
  if (data === 'coach_edit_media') {
    const profile = await getUserProfile(userId);
    const mediaCount = profile?.coachMedia?.length || 0;
    
    coachEditStates.set(userId, CoachEditStep.MEDIA);
    
    await getBot().sendMessage(chatId,
      `📸 <b>Изменение медиа-файлов</b>\n\n` +
      `Текущее количество: <b>${mediaCount}</b>\n\n` +
      `Отправьте фото или видео, чтобы добавить.\n` +
      `Нажмите "Готово" чтобы завершить.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑 Удалить все медиа', callback_data: 'coach_edit_media_clear' }],
            [{ text: '✔️ Готово', callback_data: 'coach_edit_done' }],
            [{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Очистка всех медиа
  if (data === 'coach_edit_media_clear') {
    const profile = await getUserProfile(userId);
    if (profile) {
      profile.coachMedia = [];
      await saveUserProfile(userId, profile);
      
      await getBot().sendMessage(chatId, '✅ Все медиа-файлы удалены', {
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад', callback_data: 'coach_edit_profile' }]]
        }
      });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Редактирование контакта
  if (data === 'coach_edit_contact') {
    const profile = await getUserProfile(userId);
    const currentContact = profile?.coachContact || 'не указан';
    const username = query.from?.username;
    
    coachEditStates.set(userId, CoachEditStep.CONTACT);
    
    let message = `📱 <b>Изменение контакта</b>\n\n` +
      `Текущий контакт: <b>${currentContact}</b>\n\n`;
    
    const keyboard: any[] = [];
    
    if (username) {
      message += `Введите новый контакт или используйте текущий @${username}:`;
      keyboard.push([{ text: `✅ Использовать @${username}`, callback_data: 'coach_edit_contact_use_username' }]);
    } else {
      message += `Введите новый контакт:`;
    }
    
    keyboard.push([{ text: '« Отмена', callback_data: 'coach_edit_cancel' }]);
    
    await getBot().sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Использовать текущий username как контакт
  if (data === 'coach_edit_contact_use_username') {
    const profile = await getUserProfile(userId);
    const username = query.from?.username;
    
    if (profile && username) {
      profile.coachContact = `@${username}`;
      await saveUserProfile(userId, profile);
      
      coachEditStates.delete(userId);
      
      await getBot().sendMessage(chatId, `✅ Контакт обновлен: @${username}`, {
        reply_markup: {
          inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
        }
      });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Завершение редактирования
  if (data === 'coach_edit_done') {
    coachEditStates.delete(userId);
    
    await getBot().sendMessage(chatId, '✅ Изменения сохранены!', {
      reply_markup: {
        inline_keyboard: [[{ text: '👀 Посмотреть профиль', callback_data: 'coach_view_profile' }]]
      }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Отмена редактирования
  if (data === 'coach_edit_cancel') {
    coachEditStates.delete(userId);
    
    await getBot().sendMessage(chatId, 'Редактирование отменено', {
      reply_markup: {
        inline_keyboard: [[{ text: '« Назад к профилю', callback_data: 'coach_view_profile' }]]
      }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Скрыть/показать профиль
  if (data === 'coach_hide_profile') {
    const profile = await getUserProfile(userId);
    
    if (!profile) {
      await safeAnswerCallbackQuery(query.id, { text: 'Профиль не найден' });
      return;
    }
    
    // Переключаем флаг видимости профиля
    profile.coachHidden = !profile.coachHidden;
    await saveUserProfile(userId, profile);
    
    let message: string;
    if (profile.coachHidden) {
      message = '💤 <b>Профиль на паузе</b> — мы не будем показывать вас пользователям и присылать заявки.';
    } else {
      message = '✅ <b>Профиль снова активен</b> — мы снова будем показывать вас пользователям.';
    }
    
    await getBot().sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👀 Посмотреть профиль', callback_data: 'coach_view_profile' }],
          [{ text: '« На главную', callback_data: 'action_home' }]
        ]
      }
    });
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Подбор тренера - начало
  if (data === 'find_coach_start') {
    await getBot().sendMessage(chatId, 
      'Ответьте на один вопрос — и я покажу подходящих тренеров.\n\n' +
      '<b>Как хотите тренироваться?</b>',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎾 1 на 1 (тренер + я)', callback_data: 'find_coach_type_individual' }],
            [{ text: '👥 Будем вдвоём / втроём (приведу друзей)', callback_data: 'find_coach_type_group' }],
            [{ text: '⏭ Не важно', callback_data: 'find_coach_type_any' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Подбор тренера - индивидуальная тренировка (из главного меню)
  if (data === 'find_coach_type_individual_main') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'individual', query, messageId, true);
    return;
  }

  // Подбор тренера - групповая тренировка (из главного меню)
  if (data === 'find_coach_type_group_main') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'group', query, messageId, true);
    return;
  }

  // Подбор тренера - любой тип (из главного меню)
  if (data === 'find_coach_type_any_main') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'any', query, messageId, true);
    return;
  }

  // Подбор тренера - индивидуальная тренировка
  if (data === 'find_coach_type_individual') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'individual', query, messageId, false);
    return;
  }

  // Подбор тренера - групповая тренировка
  if (data === 'find_coach_type_group') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'group', query, messageId, false);
    return;
  }

  // Подбор тренера - любой тип
  if (data === 'find_coach_type_any') {
    const messageId = query.message?.message_id;
    await handleCoachSearch(chatId, userId, 'any', query, messageId, false);
    return;
  }

  // Обработка клика на кнопку с номером тренера (noop - ничего не делает)
  if (data === 'coach_noop') {
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Навигация по тренерам - следующий
  if (data === 'coach_next') {
    console.log(`[coach_next] User ${userId} clicked next button`);
    const searchState = coachSearchStates.get(userId);
    
    if (!searchState) {
      console.error(`[coach_next] No search state found for user ${userId}`);
      await safeAnswerCallbackQuery(query.id, { text: 'Состояние не найдено. Начните поиск заново.' });
      return;
    }
    
    console.log(`[coach_next] Current index: ${searchState.currentIndex}, Total: ${searchState.coachIds.length}`);
    
    if (searchState.currentIndex < searchState.coachIds.length - 1) {
      searchState.currentIndex++;
      coachSearchStates.set(userId, searchState); // Сохраняем обновленное состояние
      console.log(`[coach_next] New index: ${searchState.currentIndex}`);
      await showCoachCard(chatId, userId, searchState, query.message?.message_id);
    } else {
      console.log(`[coach_next] Already at last coach, index: ${searchState.currentIndex}`);
      await safeAnswerCallbackQuery(query.id, { text: 'Это последний тренер в списке' });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Навигация по тренерам - предыдущий
  if (data === 'coach_prev') {
    console.log(`[coach_prev] User ${userId} clicked previous button`);
    const searchState = coachSearchStates.get(userId);
    
    if (!searchState) {
      console.error(`[coach_prev] No search state found for user ${userId}`);
      await safeAnswerCallbackQuery(query.id, { text: 'Состояние не найдено. Начните поиск заново.' });
      return;
    }
    
    console.log(`[coach_prev] Current index: ${searchState.currentIndex}, Total: ${searchState.coachIds.length}`);
    
    if (searchState.currentIndex > 0) {
      searchState.currentIndex--;
      coachSearchStates.set(userId, searchState); // Сохраняем обновленное состояние
      console.log(`[coach_prev] New index: ${searchState.currentIndex}`);
      await showCoachCard(chatId, userId, searchState, query.message?.message_id);
    } else {
      console.log(`[coach_prev] Already at first coach, index: ${searchState.currentIndex}`);
      await safeAnswerCallbackQuery(query.id, { text: 'Это первый тренер в списке' });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Показать все медиа тренера
  if (data && data.startsWith('coach_show_media_')) {
    const coachUserId = data.replace('coach_show_media_', '');
    const coachProfile = await getUserProfile(parseInt(coachUserId));
    
    if (coachProfile && coachProfile.coachMedia && coachProfile.coachMedia.length > 1) {
      // Отправляем все медиа (кроме первого, который уже показан)
      const remainingMedia = coachProfile.coachMedia.slice(1).filter(media => isValidFileId(media.fileId) || (media.publicUrl && (media.publicUrl.startsWith('http://') || media.publicUrl.startsWith('https://'))));
      
      if (remainingMedia.length === 0) {
        await safeAnswerCallbackQuery(query.id, { text: '❌ Медиа недоступны (недействительные идентификаторы файлов)' });
        return;
      }
      
      // Проверяем доступность каждого файла и выбираем file_id или publicUrl
      const availableMedia: Array<{ type: 'photo' | 'video'; media: string }> = [];
      for (const media of remainingMedia) {
        let mediaSource: string | null = null;
        
        // Сначала пытаемся использовать file_id, если он валиден
        if (isValidFileId(media.fileId)) {
          const fileAvailable = await isFileAvailable(media.fileId!);
          if (fileAvailable) {
            mediaSource = media.fileId!;
            console.log(`[coach_show_media] Using fileId for ${media.type}: ${media.fileId}`);
          }
        }
        
        // Если file_id недоступен, используем publicUrl
        if (!mediaSource && media.publicUrl && (media.publicUrl.startsWith('http://') || media.publicUrl.startsWith('https://'))) {
          mediaSource = media.publicUrl;
          console.log(`[coach_show_media] Using publicUrl for ${media.type}: ${media.publicUrl}`);
        }
        
        if (mediaSource) {
          availableMedia.push({
            type: media.type as 'photo' | 'video',
            media: mediaSource
          });
        } else {
          console.log(`[coach_show_media] Skipping unavailable file (no valid fileId or publicUrl): ${media.fileId}`);
        }
      }
      
      if (availableMedia.length === 0) {
        await safeAnswerCallbackQuery(query.id, { text: '❌ Медиа недоступны (файлы истекли или недействительны)' });
        return;
      }
      
      try {
        if (availableMedia.length <= 10) {
          await getBot().sendMediaGroup(chatId, availableMedia);
          console.log(`[coach_show_media] Successfully sent ${availableMedia.length} media items`);
        } else {
          // Если больше 10, отправляем группами по 10
          for (let i = 0; i < availableMedia.length; i += 10) {
            const batch = availableMedia.slice(i, i + 10);
            await getBot().sendMediaGroup(chatId, batch);
            console.log(`[coach_show_media] Successfully sent batch ${Math.floor(i / 10) + 1} with ${batch.length} media items`);
          }
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error(`[coach_show_media] Error sending media: ${errorMessage}`);
        await getBot().sendMessage(chatId, '❌ Ошибка при загрузке медиа');
      }
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Показать всех тренеров (с пагинацией)
  if (data === 'coach_show_all' || (data && data.startsWith('coach_show_all_page_'))) {
    const searchState = coachSearchStates.get(userId);
    
    if (!searchState || searchState.coachIds.length === 0) {
      await safeAnswerCallbackQuery(query.id, { text: 'Тренеры не найдены' });
      return;
    }
    
    // Определяем номер страницы
    let page = 0;
    if (data && data.startsWith('coach_show_all_page_')) {
      const pageStr = data.replace('coach_show_all_page_', '');
      page = parseInt(pageStr) || 0;
    }
    
    const pageSize = 5; // Количество тренеров на странице
    const totalCoaches = searchState.coachIds.length;
    const totalPages = Math.ceil(totalCoaches / pageSize);
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalCoaches);
    
    // Формируем кнопки с именами и ценами тренеров для текущей страницы
    const buttons: TelegramBot.InlineKeyboardButton[][] = [];
    
    for (let i = startIndex; i < endIndex; i++) {
      const coachUserId = searchState.coachIds[i];
      const coachProfile = await getUserProfile(parseInt(coachUserId));
      
      if (coachProfile) {
        const coachName = coachProfile.coachName || 'Тренер';
        const price = coachProfile.coachPriceIndividual || 0;
        
        // Формируем текст кнопки: "Имя - Цена ₽"
        // Ограничение Telegram: максимум 64 символа на кнопку
        let buttonText = '';
        if (price > 0) {
          buttonText = `${coachName} - ${price} ₽`;
        } else {
          buttonText = coachName;
        }
        
        // Обрезаем текст если слишком длинный
        const maxButtonLength = 60; // Оставляем запас
        if (buttonText.length > maxButtonLength) {
          buttonText = buttonText.substring(0, maxButtonLength - 3) + '...';
        }
        
        buttons.push([{ 
          text: buttonText, 
          callback_data: `coach_select_${i}` 
        }]);
      }
    }
    
    // Добавляем кнопки навигации, если страниц больше одной
    if (totalPages > 1) {
      const navButtons: TelegramBot.InlineKeyboardButton[] = [];
      
      // Кнопка "Предыдущая страница"
      if (page > 0) {
        navButtons.push({ 
          text: '◀️ Предыдущая', 
          callback_data: `coach_show_all_page_${page - 1}` 
        });
      }
      
      // Кнопка "Следующая страница"
      if (page < totalPages - 1) {
        navButtons.push({ 
          text: 'Следующая ▶️', 
          callback_data: `coach_show_all_page_${page + 1}` 
        });
      }
      
      if (navButtons.length > 0) {
        buttons.push(navButtons);
      }
    }
    
    buttons.push([{ text: '🏠 На главную', callback_data: 'action_home' }]);
    
    // Формируем сообщение с информацией о странице
    let message = `👥 <b>Список тренеров (всего ${totalCoaches})</b>`;
    if (totalPages > 1) {
      message += `\n📄 Страница ${page + 1} из ${totalPages}`;
    }
    const messageId = query.message?.message_id;
    
    // Редактируем существующее сообщение или отправляем новое
    if (messageId) {
      try {
        // Пытаемся отредактировать существующее сообщение
        await safeEditMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons }
        });
      } catch (error) {
        // Если не удалось отредактировать (например, сообщение с медиа),
        // удаляем старое и отправляем новое
        console.log('[coach_show_all] Cannot edit message, deleting and sending new');
        try {
          await getBot().deleteMessage(chatId, messageId);
        } catch (deleteError) {
          console.error('[coach_show_all] Error deleting message:', deleteError);
        }
        await getBot().sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons }
        });
      }
    } else {
      // Если нет messageId, просто отправляем новое сообщение
      await getBot().sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      });
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Выбор тренера по номеру из списка
  if (data && data.startsWith('coach_select_')) {
    const indexStr = data.replace('coach_select_', '');
    const index = parseInt(indexStr);
    
    const searchState = coachSearchStates.get(userId);
    if (searchState && index >= 0 && index < searchState.coachIds.length) {
      searchState.currentIndex = index;
      coachSearchStates.set(userId, searchState);
      // Передаем messageId для редактирования существующего сообщения со списком
      await showCoachCard(chatId, userId, searchState, query.message?.message_id);
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Отправить заявку тренеру
  if (data && data.startsWith('coach_request_')) {
    const coachUserId = data.replace('coach_request_', '');
    
    try {
      // Получаем состояние поиска для определения типа тренировки
      const searchState = coachSearchStates.get(userId);
      const trainingType = searchState?.trainingType || 'any';
      
      // Получаем профиль пользователя
      const userProfile = await getUserProfile(userId);
      const userName = userProfile?.name || query.from.first_name || 'Пользователь';
      const userUsername = query.from.username;
      const userLevel = userProfile?.level;
      const userDistricts = userProfile?.districts;
      
      // Получаем профиль тренера
      const coachProfile = await getUserProfile(parseInt(coachUserId));
      const coachName = coachProfile?.coachName || 'Тренер';
      
      // Определяем текст типа тренировки
      const trainingTypeLabels: Record<string, string> = {
        individual: '🎾 Индивидуальная тренировка (1 на 1)',
        group: '👥 Групповая тренировка (сплит или группа)',
        any: '🎾 Любой формат тренировки'
      };
      const trainingTypeText = trainingTypeLabels[trainingType] || trainingTypeLabels.any;
      
      // Формируем сообщение для тренера
      let coachMessage = '<b>Новая заявка на тренировку!</b>\n\n';
      coachMessage += `👤 <b>Игрок:</b> ${userName}\n`;
      coachMessage += `🏋️ <b>Формат:</b> ${trainingTypeText}\n`;
      
      // Если запрос из главного меню, не добавляем уровень и районы
      if (!searchState?.fromMainMenu) {
        if (userLevel) {
          const levelLabels: Record<string, string> = {
            beginner: '🎾 Новичок',
            intermediate: '🙂 Играл(а) немного',
            advanced: '🔥 Уверенный любитель',
            pro: '🏆 Сильный любитель'
          };
          coachMessage += `🎯 <b>Уровень:</b> ${levelLabels[userLevel] || userLevel}\n`;
        }
        
        if (userDistricts && userDistricts.length > 0) {
          const locationLabels: Record<string, string> = {
            north: 'Север',
            west: 'Запад',
            center: 'Центр',
            east: 'Восток',
            south: 'Юг',
            'moscow-region': 'Подмосковье',
            any: 'Не важно'
          };
          const districts = userDistricts.map(d => locationLabels[d] || d).join(', ');
          coachMessage += `📍 <b>Районы:</b> ${districts}\n`;
        }
        
        // Добавляем информацию о последнем поиске корта только если запрос НЕ из главного меню
        if (userProfile?.lastCourtSearch) {
          const { date, time, location } = userProfile.lastCourtSearch;
          coachMessage += `\n🗓 Игрок искал корт на <b>${date}</b> (${time})\n`;
          coachMessage += `📍 в районе: ${location}\n`;
        }
      }
      
      // Добавляем текст о договоренности для запросов из главного меню
      if (searchState?.fromMainMenu) {
        coachMessage += `\nДоговоритесь с игроком о времени и корте для тренировки в личных сообщениях.\n`;
      }
      
      // Добавляем напоминание об ответе
      coachMessage += `\n⏰ Пожалуйста, ответьте на заявку в течение часа.`;
      
      // Отправляем уведомление тренеру
      await getBot().sendMessage(parseInt(coachUserId), coachMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Написать игроку', url: userUsername ? `https://t.me/${userUsername}` : `tg://user?id=${userId}` }],
            [{ text: '❌ Не смогу', callback_data: `coach_decline_${userId}` }]
          ]
        }
      });
      
      console.log(`[coach_request] Request sent from user ${userId} to coach ${coachUserId}`);
      
      // Получаем контакт тренера
      const coachContact = coachProfile?.coachContact || '';
      const predefinedText = 'Добрый день, я из бота Play Today, хочу с вами потренироваться.';
      
      // Формируем URL для контакта с предзаполненным текстом
      let contactUrl = '';
      if (coachContact.startsWith('@')) {
        // Если это username
        const username = coachContact.substring(1);
        contactUrl = `https://t.me/${username}?text=${encodeURIComponent(predefinedText)}`;
      } else if (coachContact.startsWith('+')) {
        // Если это номер телефона
        contactUrl = `https://t.me/${coachContact.replace(/\D/g, '')}?text=${encodeURIComponent(predefinedText)}`;
      } else {
        // Иначе считаем что это username без @
        contactUrl = `https://t.me/${coachContact}?text=${encodeURIComponent(predefinedText)}`;
      }
      
      // Подтверждение пользователю с контактом тренера
      await getBot().sendMessage(chatId, 
        `✅ <b>Тренер ${coachName} получил вашу заявку!</b>\n\n` +
        'Тренер с вами скоро свяжется, или вы можете написать ему самостоятельно.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Написать тренеру', url: contactUrl }],
              [{ text: '👤 Смотреть других тренеров', callback_data: 'find_coach_start' }],
              [{ text: '🏠 На главную', callback_data: 'action_home' }]
            ]
          }
        }
      );
      
      // Сохраняем заявку в Firestore для отслеживания
      const requestKey = `${userId}_${coachUserId}`;
      const requestInfo: CoachRequest = {
        userId,
        coachUserId: parseInt(coachUserId),
        userName,
        coachName,
        coachContact,
        timestamp: Date.now(),
        reminderSent: false,
        // Сохраняем информацию о последнем поиске корта (только если есть)
        ...(userProfile?.lastCourtSearch?.date && { courtSearchDate: userProfile.lastCourtSearch.date }),
        ...(userProfile?.lastCourtSearch?.time && { courtSearchTime: userProfile.lastCourtSearch.time }),
        ...(userProfile?.lastCourtSearch?.location && { courtSearchLocation: userProfile.lastCourtSearch.location })
      };
      
      await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).set(requestInfo);
      console.log(`[coach_request] Request saved to Firestore: ${requestKey}`);
      
      // Создаем Cloud Task для отправки напоминания через 1 час
      try {
        await createReminderTask(requestKey);
        console.log(`[coach_request] Scheduled reminder task for request ${requestKey}`);
      } catch (error) {
        console.error('[coach_request] Error creating reminder task:', error);
        // Продолжаем даже если не удалось создать задачу напоминания
      }
    } catch (error) {
      console.error('[coach_request] Error sending request:', error);
      
      await getBot().sendMessage(chatId, 
        '❌ Произошла ошибка при отправке заявки. Попробуйте позже.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Попробовать снова', callback_data: `coach_request_${coachUserId}` }],
              [{ text: '🏠 На главную', callback_data: 'action_home' }]
            ]
          }
        }
      );
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Тренер отклоняет заявку
  if (data && data.startsWith('coach_decline_')) {
    const requestUserId = data.replace('coach_decline_', '');
    
    // Обновляем сообщение тренера
    await getBot().sendMessage(chatId, 
      '✅ Заявка отклонена.\n\n' +
      'Игрок будет уведомлен.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 На главную', callback_data: 'action_home' }]
          ]
        }
      }
    );
    
    // Уведомляем игрока
    try {
      const coachProfile = await getUserProfile(userId);
      const coachName = coachProfile?.coachName || 'Тренер';
      
      await getBot().sendMessage(parseInt(requestUserId), 
        `К сожалению, <b>${coachName}</b> не сможет провести тренировку.\n\n` +
        'Попробуйте связаться с другими тренерами.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Смотреть других тренеров', callback_data: 'find_coach_start' }],
              [{ text: '🏠 На главную', callback_data: 'action_home' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('[coach_decline] Error notifying user:', error);
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Обработка ответов на напоминания
  
  // Тренер подтвердил, что связался с клиентом
  if (data && data.startsWith('request_coach_yes_')) {
    const requestKey = data.replace('request_coach_yes_', '');
    
    // Удаляем заявку из Firestore
    await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).delete();
    
    await getBot().sendMessage(chatId, 
      '✅ Отлично! Желаем успешной тренировки!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 На главную', callback_data: 'action_home' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }
  
  // Тренер не смог связаться с клиентом
  if (data && data.startsWith('request_coach_no_')) {
    const requestKey = data.replace('request_coach_no_', '');
    
    // Получаем данные заявки из Firestore
    const requestDoc = await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).get();
    
    if (requestDoc.exists) {
      const requestInfo = requestDoc.data() as CoachRequest;
      
      // Уведомляем клиента
      try {
        await getBot().sendMessage(requestInfo.userId, 
          `К сожалению, <b>${requestInfo.coachName}</b> не сможет провести тренировку.\n\n` +
          'Попробуйте связаться с другими тренерами.',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👤 Смотреть других тренеров', callback_data: 'find_coach_start' }],
                [{ text: '🏠 На главную', callback_data: 'action_home' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('[request_coach_no] Error notifying user:', error);
      }
      
      // Удаляем заявку из Firestore
      await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).delete();
    }
    
    await getBot().sendMessage(chatId, 
      '✅ Заявка отклонена. Игрок будет уведомлен.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 На главную', callback_data: 'action_home' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }
  
  // Клиент подтвердил, что тренер связался
  if (data && data.startsWith('request_client_yes_')) {
    const requestKey = data.replace('request_client_yes_', '');
    
    // Удаляем заявку из Firestore
    await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).delete();
    
    await getBot().sendMessage(chatId, 
      '✅ Отлично! Желаем успешной тренировки!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 На главную', callback_data: 'action_home' }]
          ]
        }
      }
    );
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }
  
  // Клиент сказал, что тренер не связался
  if (data && data.startsWith('request_client_no_')) {
    const requestKey = data.replace('request_client_no_', '');
    
    // Получаем данные заявки из Firestore
    const requestDoc = await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).get();
    
    if (requestDoc.exists) {
      const requestInfo = requestDoc.data() as CoachRequest;
      
      // Уведомляем тренера
      try {
        await getBot().sendMessage(requestInfo.coachUserId, 
          `⚠️ <b>Напоминание</b>\n\n` +
          `Клиент <b>${requestInfo.userName}</b> ждет вашего ответа. Пожалуйста, свяжитесь с ним.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💬 Написать клиенту', url: `tg://user?id=${requestInfo.userId}` }],
                [{ text: '🏠 На главную', callback_data: 'action_home' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('[request_client_no] Error notifying coach:', error);
      }
      
      // Формируем URL для контакта с предзаполненным текстом
      const predefinedText = 'Добрый день, я из бота Play Today, хочу с вами потренироваться.';
      let contactUrl = '';
      if (requestInfo.coachContact.startsWith('@')) {
        const username = requestInfo.coachContact.substring(1);
        contactUrl = `https://t.me/${username}?text=${encodeURIComponent(predefinedText)}`;
      } else if (requestInfo.coachContact.startsWith('+')) {
        contactUrl = `https://t.me/${requestInfo.coachContact.replace(/\D/g, '')}?text=${encodeURIComponent(predefinedText)}`;
      } else {
        contactUrl = `https://t.me/${requestInfo.coachContact}?text=${encodeURIComponent(predefinedText)}`;
      }
      
      // Отправляем клиенту сообщение с контактом
      await getBot().sendMessage(chatId, 
        `Мы напомнили тренеру <b>${requestInfo.coachName}</b>, что нужно с вами связаться.\n\n` +
        'Если хотите, можете написать ему самостоятельно:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Написать тренеру', url: contactUrl }],
              [{ text: '👤 Смотреть других тренеров', callback_data: 'find_coach_start' }]
            ]
          }
        }
      );
    }
    
    await safeAnswerCallbackQuery(query.id);
    return;
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    // Сбрасываем состояние заполнения анкеты тренера
    coachRegistrationStates.delete(userId);
    
    const profile = await getUserProfile(userId);
    const userName = profile?.name || query.from.first_name;
    
    const mainMenuKeyboard6 = await getMainMenuKeyboard();
    await getBot().sendMessage(chatId, USER_TEXTS.WELCOME(userName), {
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: mainMenuKeyboard6,
        resize_keyboard: true
      }
    });
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
