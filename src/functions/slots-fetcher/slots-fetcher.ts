import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  SiteConfig,
  SITE_CONFIGS,
  SITE_PADEL_CONFIGS,
  YCLIENTS_CONFIGS,
  YCLIENTS_PADEL_CONFIGS,
  VIVACRM_CONFIGS,
  VIVACRM_PADEL_CONFIGS,
  MOYKLASS_CONFIGS,
  FINDSPORT_CONFIGS,
  API_URL
} from '../../constants/slots-constants';
import { fetchYClientsSlotsForSite } from './yclients-fetcher';
import { fetchVivaCrmSlotsForSite } from './vivacrm-fetcher';
import { fetchMoyKlassSlotsForSite } from './moyklass-fetcher';
import { fetchFindSportSlotsForSite } from './findsport-fetcher';
import { getDayTimestamp } from '../../utils/date-utils';

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
  
  // Reservi.ru (1C) для падела
  for (const config of SITE_PADEL_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (reservi.ru)`);
      result.sites[config.name] = await fetchSlotsForSite(config);
      console.log(`✅ Successfully fetched ${config.name}`);
    } catch (error) {
      console.error(`Error fetching ${config.name}:`, error);
      result.sites[config.name] = {};
    }
  }
  
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
  
  // VivaCRM (падел)
  for (const config of VIVACRM_PADEL_CONFIGS) {
    try {
      console.log(`Fetching slots for: ${config.name} (vivacrm)`);
      result.sites[config.name] = await fetchVivaCrmSlotsForSite(config);
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
 * POST - запустить сбор и сохранить в Cloud Storage (обновляет данные для тенниса и падела)
 * GET - получить данные из Cloud Storage
 * Поддерживает параметр ?sport=tennis|padel для GET запросов
 */
export const slotsFetcher = async (req: CloudFunctionRequest, res: CloudFunctionResponse) => {
  try {
    // GET - возвращаем данные из Cloud Storage
    if (req.method === 'GET') {
      // Определяем тип спорта из query параметра или body для GET запросов
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
      
      const data = await loadFromStorage(fileName, localPath);
      if (data) {
        res.status(200).json(data);
      } else {
        res.status(200).json({ message: `No ${sport} data yet. Trigger POST to fetch.` });
      }
      return;
    }
    
    // POST - собираем данные для обоих типов спорта и сохраняем
    if (req.method === 'POST') {
      console.log('Starting slots fetch for both tennis and padel...');
      
      // Собираем данные для тенниса и падела параллельно
      const [tennisData, padelData] = await Promise.all([
        fetchAllTennisSlots(),
        fetchAllPadelSlots()
      ]);
      
      // Сохраняем оба файла
      const [tennisStoragePath, padelStoragePath] = await Promise.all([
        saveToStorage(tennisData, TENNIS_SLOTS_FILE, TENNIS_LOCAL_SLOTS_PATH),
        saveToStorage(padelData, PADEL_SLOTS_FILE, PADEL_LOCAL_SLOTS_PATH)
      ]);
      
      // Считаем статистику для тенниса
      const tennisSiteCount = Object.keys(tennisData.sites).length;
      let tennisTotalSlots = 0;
      for (const site of Object.values(tennisData.sites)) {
        for (const slots of Object.values(site)) {
          tennisTotalSlots += slots.length;
        }
      }
      
      // Считаем статистику для падела
      const padelSiteCount = Object.keys(padelData.sites).length;
      let padelTotalSlots = 0;
      for (const site of Object.values(padelData.sites)) {
        for (const slots of Object.values(site)) {
          padelTotalSlots += slots.length;
        }
      }
      
      console.log(`✅ Fetched ${tennisTotalSlots} tennis slots from ${tennisSiteCount} sites`);
      console.log(`✅ Fetched ${padelTotalSlots} padel slots from ${padelSiteCount} sites`);
      
      res.status(200).json({
        success: true,
        lastUpdated: new Date().toISOString(),
        tennis: {
          lastUpdated: tennisData.lastUpdated,
          sitesCount: tennisSiteCount,
          totalSlots: tennisTotalSlots,
          storagePath: tennisStoragePath
        },
        padel: {
          lastUpdated: padelData.lastUpdated,
          sitesCount: padelSiteCount,
          totalSlots: padelTotalSlots,
          storagePath: padelStoragePath
        },
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
