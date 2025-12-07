import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

// Типы для Cloud Functions
interface CloudFunctionRequest extends IncomingMessage {
  body: unknown;
  method: string;
}

interface CloudFunctionResponse extends ServerResponse {
  status(code: number): CloudFunctionResponse;
  send(body: string): CloudFunctionResponse;
  json(body: unknown): CloudFunctionResponse;
}

// Cloud Storage настройки
const BUCKET_NAME = process.env.GCS_BUCKET;  // Если не задан — используем локальный файл
const TENNIS_SLOTS_FILE = 'actual-tennis-slots.json';
const PADEL_SLOTS_FILE = 'actual-padel-slots.json';
const TENNIS_LOCAL_SLOTS_PATH = path.join(process.cwd(), TENNIS_SLOTS_FILE);
const PADEL_LOCAL_SLOTS_PATH = path.join(process.cwd(), PADEL_SLOTS_FILE);

// Режим работы: Cloud Storage или локальный файл
const USE_LOCAL_STORAGE = !BUCKET_NAME;

// Инициализация Cloud Storage (только если задан bucket)
const storage = BUCKET_NAME ? new Storage() : null;

// Конфигурация для запросов к reservi.ru (Импульс, Спартак, ITC)
interface SiteConfig {
  name: string;           // Название площадки для идентификации
  clubId: string;         // ID клуба
  clubTitle: string;      // Название клуба
  apiKey: string;         // API ключ площадки
  serviceId?: string;     // ID услуги (для Импульс)
  useSalonId?: boolean;   // Использовать salonId вместо service_id (для Спартак)
  daysAhead?: number;     // На сколько дней вперёд запрашивать (по умолчанию 7)
}

// Конфигурация для YClients API
interface YClientsConfig {
  name: string;           // Название площадки
  locationId: number;     // ID локации в YClients
  authToken: string;      // Bearer токен для авторизации
  origin: string;         // Origin для CORS (например: https://b1044864.yclients.com)
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  slotDuration?: number;  // Длительность слота в минутах (по умолчанию 60)
  roomName?: string | null; // Название зала/корта (опционально)
  staffId?: number | null;  // staff_id для запроса (по умолчанию null)
  staffIds?: { [staffId: number]: string }; // Маппинг staff_id -> название корта (для нескольких кортов)
}

// Конфигурация для VivaCRM API (api.vivacrm.ru)
interface VivaCrmConfig {
  name: string;           // Название площадки
  tenantId: string;       // ID тенанта в URL (например: ajV1T2)
  serviceId: string;      // ID услуги (master-service)
  origin: string;         // Origin для CORS
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
}

// Конфигурация для MoyKlass API (app.moyklass.com)
interface MoyKlassConfig {
  name: string;           // Название площадки
  widgetId: string;       // ID виджета из URL
  origin: string;         // Origin для CORS (например: https://cooltennis.ru)
  weeksAhead?: number;    // На сколько недель вперёд (по умолчанию 2)
}

// Конфигурация для FindSport API (findsport.ru)
interface FindSportConfig {
  name: string;           // Название площадки
  playgroundId: string;   // ID площадки в URL (например: 5154)
  courts: Record<string, string>;  // Маппинг ID корта -> название (например: { "9702": "Корт 2" })
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  cookie?: string;        // Cookie для авторизации (опционально)
}

// ⬇️ КОНФИГУРАЦИИ ПЛОЩАДОК ⬇️
const SITE_CONFIGS: SiteConfig[] = [
  {
    name: "impuls",
    clubId: "944b2756-15b3-11ea-80c2-0025902e02c1",
    clubTitle: "ИМПУЛЬС",
    serviceId: "411cd3d2-1754-11ea-80c2-0025902e02c1",
    apiKey: "84aacea4-922c-4c13-b779-42b10b961d0f",
    daysAhead: 14
  },
  {
    name: "spartak-grunt",
    clubId: "5a810c4f-9f36-11ea-bbca-0050568bac88",
    clubTitle: "КРЫТЫЕ КОРТЫ ГРУНТ",
    apiKey: "81059286-b4a9-4069-9fe8-1420f6773265",
    useSalonId: true,
    daysAhead: 14
  },
  {
    name: "spartak-hard",
    clubId: "53f148cf-9f36-11ea-bbca-0050568bac88",
    clubTitle: "КРЫТЫЕ КОРТЫ ХАРД",
    apiKey: "81059286-b4a9-4069-9fe8-1420f6773265",
    useSalonId: true,
    daysAhead: 14
  },
  {
    name: "itc-tsaritsyno",
    clubId: "575773d6-2845-11ed-168d-0050568369e4",
    clubTitle: "ITC by WeGym Теннисный Центр Царицыно",
    serviceId: "4c590be8-284a-11ed-e888-0050568369e4",
    apiKey: "1362fca0-3747-46fb-894d-e6dc16b52608",
    daysAhead: 14
  },
  {
    name: "itc-mytischy",
    clubId: "da3c3c8b-b4b0-11eb-bbf6-0050568342b3",
    clubTitle: "ITC by WeGym Теннисный Центр Мытищи",
    serviceId: "6732c6ae-b971-11eb-bbf6-0050568342b3",
    apiKey: "14d225bc-2d69-40c9-92be-f949252fd250",
    daysAhead: 14
  },
  {
    name: "vidnyysport",
    clubId: "b52ec86b-b7b5-11eb-80ed-ee78ef712c1b",
    clubTitle: 'Теннисный клуб "I Love Tennis"',
    apiKey: "f1177549-d4aa-4480-8f6e-3543a6c41005",
    useSalonId: true,  // Нет service_id, используем salonId формат
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ YCLIENTS (platform.yclients.com) - ТЕННИС ⬇️
const YCLIENTS_CONFIGS: YClientsConfig[] = [
  {
    name: "pro-tennis-kashirka",
    locationId: 967881,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1044864.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
  },
  {
    name: "megasport-tennis",
    locationId: 852917,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b916289.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
  },
  {
    name: "gallery-cort",
    locationId: 693093,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b735517.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: null  // Этот корт использует staff_id: null
  },
  {
    name: "tennis-capital",
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      2480431: "Корт 1",
      2535545: "Корт 2",
      3900730: "Корт 3",
      3900734: "Корт 4",
      2772203: "Корт 5",
      3300652: "Корт 6",
      3057405: "Корт 7"
    }
  },
];

// ⬇️ КОНФИГУРАЦИИ YCLIENTS (platform.yclients.com) - ПАДЕЛ ⬇️
const YCLIENTS_PADEL_CONFIGS: YClientsConfig[] = [
  {
    name: "rocket-padel-club",
    locationId: 1478703,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1647756.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: "padel-friends",
    locationId: 804153,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b861100.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: "buenos-padel",
    locationId: 1457979,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1555275.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      4268232: "Корт 1",
      4486944: "Корт 2",
      4486947: "Корт 3",
      4486950: "Корт 4",
      4486953: "Корт 5",
      4486956: "Корт 6",
      4486965: "Корт 7",
      4486974: "Корт 8"
    }
  },
  {
    name: "padel-belozer",
    locationId: 1583670,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1781322.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: "tennis-capital-padel-savelovskaya",
    locationId: 1450185,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1776180.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: "tennis-capital-padel-vdnh",
    locationId: 1553949,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1776180.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: "up2-padel",
    locationId: 1288180,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1422626.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: "bandehaarenaclub",
    locationId: 1449294,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1612373.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: "orbita-tennis",
    locationId: 1066130,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1159028.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: "v-padel",
    locationId: 1441312,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1602942.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
];

const YCLIENTS_API_URL = 'https://platform.yclients.com/api/v1/b2c/booking/availability/search-timeslots';

// ⬇️ КОНФИГУРАЦИИ VIVACRM (api.vivacrm.ru) ⬇️
const VIVACRM_CONFIGS: VivaCrmConfig[] = [
  {
    name: "luzhniki-tennis",
    tenantId: "ajV1T2",
    serviceId: "77075a2c-873a-411f-8073-028a2051cf2d",
    origin: "https://tennis.luzhniki.ru",
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ MOYKLASS (app.moyklass.com) ⬇️
const MOYKLASS_CONFIGS: MoyKlassConfig[] = [
  {
    name: "cooltennis-baumanskaya",
    widgetId: "01RNDZfjBowzq7hT06oW4BJJi7TGoyMtovbx",
    origin: "https://cooltennis.ru",
    weeksAhead: 2
  },
];

// ⬇️ КОНФИГУРАЦИИ FINDSPORT (findsport.ru) ⬇️
const FINDSPORT_CONFIGS: FindSportConfig[] = [
  {
    name: "olonetskiy",
    playgroundId: "5154",
    courts: {
      "9702": "Корт 2",
      "9703": "Корт 3",
      "9704": "Корт 4",
      "9705": "Корт 5"
    },
    daysAhead: 7,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; phpsession=cf6438fb8c534abc640608072d387832"
  },
  {
    name: "slice-tennis",
    playgroundId: "4749",
    courts: {
      "8958": "Корт 1",
      "8959": "Корт 2",
      "8960": "Корт 3",
      "8961": "Корт 4",
      "8962": "Корт 5"
    },
    daysAhead: 7,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; phpsession=cf6438fb8c534abc640608072d387832"
  },
];

// Интерфейс слота из API (из data-options)
interface RawSlot {
  time: string;
  date_time: string;      // Формат: "2025-12-04 07:00"
  seance_length: number;
  room_id: string;
  club_id: string;
  service_id: string;
  date?: {
    start: number;
    end: number;
  };
  price?: number;         // Добавляется после парсинга из HTML
  roomName?: string;      // Добавляется после парсинга из HTML
}

// Целевой формат слота
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

interface AllSlotsResult {
  lastUpdated: string;
  sites: {
    [siteName: string]: SiteSlots;
  };
}

const API_URL = 'https://reservi.ru/api-fit1c/json/v2/';

/**
 * Сохраняет данные в Cloud Storage или локальный файл
 */
async function saveToStorage(data: AllSlotsResult, fileName: string, localPath: string): Promise<string> {
  const jsonData = JSON.stringify(data, null, 2);
  
  if (USE_LOCAL_STORAGE) {
    // Локальный режим — сохраняем в файл
    fs.writeFileSync(localPath, jsonData, 'utf-8');
    console.log(`💾 Saved to local file: ${localPath}`);
    return `file://${localPath}`;
  }
  
  // Cloud Storage
  const bucket = storage!.bucket(BUCKET_NAME!);
  const file = bucket.file(fileName);
  
  await file.save(jsonData, {
    contentType: 'application/json',
    metadata: {
      cacheControl: 'no-cache'
    }
  });
  
  console.log(`☁️ Saved to gs://${BUCKET_NAME}/${fileName}`);
  return `gs://${BUCKET_NAME}/${fileName}`;
}

/**
 * Загружает данные из Cloud Storage или локального файла
 */
async function loadFromStorage(fileName: string, localPath: string): Promise<AllSlotsResult | null> {
  try {
    if (USE_LOCAL_STORAGE) {
      // Локальный режим — читаем из файла
      if (!fs.existsSync(localPath)) {
        return null;
      }
      const content = fs.readFileSync(localPath, 'utf-8');
      return JSON.parse(content) as AllSlotsResult;
    }
    
    // Cloud Storage
    const bucket = storage!.bucket(BUCKET_NAME!);
    const file = bucket.file(fileName);
    
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }
    
    const [content] = await file.download();
    return JSON.parse(content.toString()) as AllSlotsResult;
  } catch (error) {
    console.error('Error loading from storage:', error);
    return null;
  }
}


/**
 * Извлекает названия комнат из HTML
 */
function extractRoomNames(html: string): Record<string, string> {
  const roomNames: Record<string, string> = {};
  const roomNameRegex = /data-room='([^']+)'>([^<]+)<\/li>/g;
  let match;
  
  while ((match = roomNameRegex.exec(html)) !== null) {
    roomNames[match[1]] = match[2].trim();
  }
  
  return roomNames;
}

/**
 * Извлекает слоты из HTML-ответа API (из ALL_BLOCK)
 */
function extractSlotsFromHtml(html: string): RawSlot[] {
  const slots: RawSlot[] = [];
  
  // Получаем названия комнат
  const roomNames = extractRoomNames(html);
  
  // Ищем слоты: <a> с data-options (цена опциональна)
  const slotRegex = /<a[^>]*data-options="(\{[^"]+\})"[^>]*>[\s\S]*?<\/a>/g;
  const priceRegex = /price-tb_res">(\d+)/;
  
  let match;
  while ((match = slotRegex.exec(html)) !== null) {
    try {
      const block = match[0];
      
      // Декодируем HTML entities в data-options
      const jsonStr = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      
      // Цена опциональна (не все площадки показывают цену)
      const priceMatch = block.match(priceRegex);
      const price = priceMatch ? parseInt(priceMatch[1], 10) : undefined;
      
      const slotData = JSON.parse(jsonStr) as RawSlot;
      
      // Пропускаем если нет date_time
      if (!slotData.date_time) continue;
      
      // Добавляем цену и название комнаты
      slotData.price = price;
      slotData.roomName = roomNames[slotData.room_id] || undefined;
      
      slots.push(slotData);
    } catch (e) {
      // Игнорируем ошибки парсинга отдельных слотов
    }
  }
  
  return slots;
}

/**
 * Трансформирует сырые слоты в целевой формат с дедупликацией
 */
function transformSlots(rawSlots: RawSlot[]): SiteSlots {
  const result: SiteSlots = {};
  const seen = new Set<string>(); // Для дедупликации
  
  for (const raw of rawSlots) {
    // Извлекаем дату из date_time (формат: "2025-12-04 07:00")
    if (!raw.date_time) continue;
    
    // Уникальный ключ: dateTime + roomId
    const uniqueKey = `${raw.date_time}|${raw.room_id}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    
    const [date] = raw.date_time.split(' ');
    
    const slot: Slot = {
      time: raw.time,
      dateTime: raw.date_time,
      duration: raw.seance_length,
      price: raw.price ?? null,
      roomName: raw.roomName ?? null
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
 * Генерирует timestamp для начала дня
 */
function getDayTimestamp(daysFromNow: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Делает запрос к API для одного дня
 */
async function fetchSlotsForDay(config: SiteConfig, dayTimestamp: number): Promise<RawSlot[]> {
  const formData = new URLSearchParams();
  
  // Основные параметры запроса
  formData.append('method', 'getFitCalendar');
  formData.append('params[show_type]', 'day');
  formData.append('params[token]', '');
  formData.append('params[calendarType]', 'rent');
  formData.append('params[getAll]', 'Y');
  formData.append('params[window_width]', '1728');
  formData.append('isLK', 'false');
  
  // filter_day нужен для всех площадок
  formData.append('params[filter_day]', String(dayTimestamp));
  
  // Разные форматы для разных площадок
  if (config.useSalonId) {
    // Формат Спартак: salonId вместо service_id
    formData.append('params[salonId]', config.clubId);
  } else {
    // Формат Импульс: service_id
    if (config.serviceId) {
      formData.append('params[service_id]', config.serviceId);
    }
  }
  
  // Данные клуба
  formData.append(`clubs[${config.clubId}][id]`, config.clubId);
  formData.append(`clubs[${config.clubId}][title]`, config.clubTitle);
  formData.append(`clubs[${config.clubId}][countries][]`, 'RU');
  formData.append(`clubs[${config.clubId}][current]`, 'true');
  formData.append(`clubs[${config.clubId}][auth_message_to_user]`, '');
  formData.append(`clubs[${config.clubId}][free_registration]`, 'false');
  formData.append(`clubs[${config.clubId}][time_zone]`, 'Europe/Moscow');
  formData.append(`clubs[${config.clubId}][timestamp]`, String(Math.floor(Date.now() / 1000)));
  
  // API ключ и язык
  formData.append('api_key', config.apiKey);
  formData.append('lang', 'ru');
  formData.append('lang_cookie', '');
  formData.append('host_type', '');
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString()
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json() as Record<string, unknown>;
  
  if (data.isError) {
    console.log('❌ API Error:', data.Message);
  }
  
  // HTML со слотами находится в SLIDER.ALL_BLOCK
  const slider = data?.SLIDER as { ALL_BLOCK?: string } | undefined;
  const html = slider?.ALL_BLOCK || '';
  
  if (!html) {
    console.log('⚠️ No SLIDER.ALL_BLOCK in response. Available:', Object.keys(data));
  }
  
  return extractSlotsFromHtml(html);
}

/**
 * Делает запросы к API для всех дней конфигурации
 */
async function fetchSlotsForSite(config: SiteConfig): Promise<SiteSlots> {
  const daysAhead = config.daysAhead || 7;
  const allRawSlots: RawSlot[] = [];
  
  // Запрашиваем каждый день (начиная с сегодня)
  for (let i = 0; i < daysAhead; i++) {
    const dayTimestamp = getDayTimestamp(i);
    // Форматируем дату в локальном времени (не UTC)
    const date = new Date(dayTimestamp * 1000);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    try {
      const daySlots = await fetchSlotsForDay(config, dayTimestamp);
      if (daySlots.length > 0) {
        console.log(`  📅 ${dateStr}: ${daySlots.length} слотов`);
      }
      allRawSlots.push(...daySlots);
      
      // Небольшая задержка между запросами чтобы не перегружать API
      if (i < daysAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching day ${i} for ${config.name}:`, error);
    }
  }
  
  return transformSlots(allRawSlots);
}

// ============= YCLIENTS API =============

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
function formatDateForYClients(daysFromNow: number): string {
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
 */
async function fetchYClientsSlotsForSite(config: YClientsConfig): Promise<SiteSlots> {
  const result: SiteSlots = {};
  const daysAhead = config.daysAhead || 14;
  
  for (let i = 0; i < daysAhead; i++) {
    const dateStr = formatDateForYClients(i);
    try {
      const daySlots = await fetchYClientsSlotsForDay(config, dateStr);
      if (daySlots.length > 0) {
        result[dateStr] = daySlots;
        console.log(`  📅 ${dateStr}: ${daySlots.length} слотов`);
      }
      
      // Задержка между запросами
      if (i < daysAhead - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error fetching YClients day ${dateStr} for ${config.name}:`, error);
    }
  }
  
  return result;
}

// ============= VIVACRM API =============

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
async function fetchVivaCrmSlotsForSite(config: VivaCrmConfig): Promise<SiteSlots> {
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

// ============= MOYKLASS API =============

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
async function fetchMoyKlassSlotsForSite(config: MoyKlassConfig): Promise<SiteSlots> {
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

// ============= FINDSPORT API =============

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
async function fetchFindSportSlotsForSite(config: FindSportConfig): Promise<SiteSlots> {
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

// ============= ОБЩИЙ СБОР ДАННЫХ =============

/**
 * Собирает слоты со всех сконфигурированных площадок для тенниса
 */
async function fetchAllTennisSlots(): Promise<AllSlotsResult> {
  const result: AllSlotsResult = {
    lastUpdated: new Date().toISOString(),
    sites: {}
  };
  
  // Reservi.ru (Импульс, Спартак, ITC)
  for (const config of SITE_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (reservi.ru)`);
      result.sites[config.name] = await fetchSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  // YClients (теннис)
  for (const config of YCLIENTS_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (yclients)`);
      result.sites[config.name] = await fetchYClientsSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  // VivaCRM
  for (const config of VIVACRM_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (vivacrm)`);
      result.sites[config.name] = await fetchVivaCrmSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  // MoyKlass
  for (const config of MOYKLASS_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (moyklass)`);
      result.sites[config.name] = await fetchMoyKlassSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  // FindSport
  for (const config of FINDSPORT_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (findsport.ru)`);
      result.sites[config.name] = await fetchFindSportSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  return result;
}

/**
 * Собирает слоты со всех сконфигурированных площадок для падела
 */
async function fetchAllPadelSlots(): Promise<AllSlotsResult> {
  const result: AllSlotsResult = {
    lastUpdated: new Date().toISOString(),
    sites: {}
  };
  
  // YClients (падел)
  for (const config of YCLIENTS_PADEL_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (yclients)`);
      result.sites[config.name] = await fetchYClientsSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
  return result;
}

/**
 * Cloud Function для сбора слотов
 * POST - запустить сбор и сохранить в Cloud Storage
 * GET - получить данные из Cloud Storage
 * Поддерживает параметр ?sport=tennis|padel для выбора типа спорта
 */
export const slotsFetcher = async (req: CloudFunctionRequest, res: CloudFunctionResponse) => {
  try {
    // Определяем тип спорта из query параметра или body
    let sport = 'tennis';
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const sportParam = url.searchParams.get('sport');
        if (sportParam === 'padel' || sportParam === 'tennis') {
          sport = sportParam;
        }
      } catch (e) {
        // Если не удалось распарсить URL, пробуем из body
        const body = req.body as { sport?: string } | undefined;
        if (body?.sport === 'padel' || body?.sport === 'tennis') {
          sport = body.sport;
        }
      }
    } else {
      // Если нет URL, пробуем из body
      const body = req.body as { sport?: string } | undefined;
      if (body?.sport === 'padel' || body?.sport === 'tennis') {
        sport = body.sport;
      }
    }
    
    const isPadel = sport === 'padel';
    const fileName = isPadel ? PADEL_SLOTS_FILE : TENNIS_SLOTS_FILE;
    const localPath = isPadel ? PADEL_LOCAL_SLOTS_PATH : TENNIS_LOCAL_SLOTS_PATH;
    
    // GET - возвращаем данные из Cloud Storage
    if (req.method === 'GET') {
      const data = await loadFromStorage(fileName, localPath);
      if (data) {
        res.status(200).json(data);
      } else {
        res.status(200).json({ message: `No ${sport} data yet. Trigger POST to fetch.` });
      }
      return;
    }
    
    // POST - собираем данные и сохраняем
    if (req.method === 'POST') {
      console.log(`Starting ${sport} slots fetch...`);
      
      const slotsData = isPadel 
        ? await fetchAllPadelSlots()
        : await fetchAllTennisSlots();
      
      // Сохраняем в Storage (Cloud или локальный файл)
      const storagePath = await saveToStorage(slotsData, fileName, localPath);
      
      // Считаем статистику
      const siteCount = Object.keys(slotsData.sites).length;
      let totalSlots = 0;
      for (const site of Object.values(slotsData.sites)) {
        for (const slots of Object.values(site)) {
          totalSlots += slots.length;
        }
      }
      
      console.log(`Fetched ${totalSlots} ${sport} slots from ${siteCount} sites`);
      
      res.status(200).json({
        success: true,
        sport,
        lastUpdated: slotsData.lastUpdated,
        sitesCount: siteCount,
        totalSlots,
        storagePath,
        mode: USE_LOCAL_STORAGE ? 'local' : 'cloud'
      });
      return;
    }
    
    res.status(405).send('Method Not Allowed');
  } catch (error) {
    console.error('Error in slotsFetcher:', error);
    res.status(500).json({ error: 'Internal Server Error', details: String(error) });
  }
};

// Экспорт для Cloud Functions
export { slotsFetcher as fetchSlots };
