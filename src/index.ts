import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { trackButtonClick, generateSessionId, parseButtonType } from './analytics';

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
const TENNIS_SLOTS_FILE = 'actual-tennis-slots.json';
const PADEL_SLOTS_FILE = 'actual-padel-slots.json';
const TENNIS_LOCAL_SLOTS_PATH = path.join(process.cwd(), TENNIS_SLOTS_FILE);
const PADEL_LOCAL_SLOTS_PATH = path.join(process.cwd(), PADEL_SLOTS_FILE);
const USE_LOCAL_STORAGE = !BUCKET_NAME;
const storage = BUCKET_NAME ? new Storage() : null;

// Названия площадок для отображения (теннис)
const TENNIS_COURT_NAMES: Record<string, string> = {
  "impuls": "Импульс",
  "spartak-grunt": "Спартак» — крытый грунт",
  "spartak-hard": "Спартак» — хард",
  "itc-tsaritsyno": "ITC by WeGym «Царицыно»",
  "itc-mytischy": "ITC by WeGym «Мытищи»",
  "vidnyysport": "Видный Спорт",
  "pro-tennis-kashirka": "PRO TENNIS на Каширке",
  "megasport-tennis": "Мегаспорт",
  "gallery-cort": "The Tennis Club Gallery",
  "tennis-capital": "Tennis Capital",
  "luzhniki-tennis": "Лужники",
  "cooltennis-baumanskaya": "CoolTennis Бауманская",
  "olonetskiy": "Олонецкий",
  "slice-tennis": "Slice"
};

// Ссылки на бронирование кортов (теннис)
const TENNIS_COURT_LINKS: Record<string, string> = {
  "impuls": "https://tennis-impuls.ru/schedule/",
  "spartak-grunt": "https://tenniscentre-spartak.ru/arenda/",
  "spartak-hard": "https://tenniscentre-spartak.ru/arenda/",
  "itc-tsaritsyno": "https://wegym.ru/tennis/tsaritsyno/",
  "itc-mytischy": "https://tenniscentr.ru/schedule/?type=rent",
  "vidnyysport": "https://vidnyysport.ru/tennisclub/raspisanie?type=rent",
  "pro-tennis-kashirka": "https://myprotennis.ru/#rec848407151",
  "megasport-tennis": "https://www.mstennis.ru/tennisnye-korty.aspx",
  "gallery-cort": "https://www.gltennis.ru/tennis",
  "tennis-capital": "https://tenniscapital.ru/rent",
  "luzhniki-tennis": "https://tennis.luzhniki.ru/#courts",
  "cooltennis-baumanskaya": "https://cooltennis.ru/timetable",
  "olonetskiy": "https://findsport.ru/playground/5154",
  "slice-tennis": "https://slicetennis-club.com/"
};

// Ссылки на карты кортов (теннис)
const TENNIS_COURT_MAPS: Record<string, string> = {
  "spartak-grunt": "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  "spartak-hard": "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  "itc-tsaritsyno": "https://yandex.ru/maps/org/wegym/113604721914/?ll=37.648751%2C55.608562&z=16.67",
  "itc-mytischy": "https://yandex.ru/maps/org/tennisny_tsentr_mytishchi/1069246291/?ll=37.777518%2C55.929636&z=16.96",
  "tennis-capital": "https://yandex.ru/maps/org/tennis_capital/224212200985/?ll=37.496897%2C55.827879&z=14",
  "pro-tennis-kashirka": "https://yandex.ru/maps/org/protennis/120107923310/?indoorLevel=1&ll=37.642770%2C55.654482&z=16.96",
  "cooltennis-baumanskaya": "https://yandex.ru/maps/org/cooltennis/179733447361/?ll=37.554967%2C55.703911&z=16.67",
  "megasport-tennis": "https://yandex.ru/maps/org/megasport_tennis/1115449195/?ll=37.496299%2C55.651212&z=16.96",
  "luzhniki-tennis": "https://yandex.ru/maps/org/dvorets_tennisa_luzhniki/2495166648/?indoorLevel=1&ll=37.564221%2C55.712837&z=16.96",
  "slice-tennis": "https://yandex.ru/maps/org/slays/146210327632/?ll=37.753802%2C55.667452&z=16.96",
  "gallery-cort": "https://yandex.ru/maps/org/galereya/1366934557/?ll=37.715830%2C55.680707&z=16.96",
  "olonetskiy": "https://yandex.ru/maps/org/chempion/51651714906/?ll=37.662836%2C55.880622&z=16.67",
  "impuls": "https://yandex.ru/maps/org/tsentr_tennisnykh_tekhnologiy_impuls/226524913148/?ll=37.753979%2C55.884070&z=16.67",
  "vidnyysport": "https://yandex.ru/maps/org/i_love_tennis/15458668670/?ll=37.665431%2C55.551756&z=12.59"
};

// Маппинг метро/города для кортов (теннис)
const TENNIS_COURT_METRO: Record<string, string> = {
  "spartak-grunt": "Сокольники",
  "spartak-hard": "Сокольники",
  "itc-tsaritsyno": "Кантемировская",
  "itc-mytischy": "Мытищи",
  "tennis-capital": "Войковская",
  "pro-tennis-kashirka": "Каширская",
  "cooltennis-baumanskaya": "Бауманская",
  "megasport-tennis": "Беляево",
  "luzhniki-tennis": "Лужники",
  "slice-tennis": "Братиславская",
  "gallery-cort": "Печатники",
  "olonetskiy": "Медведково",
  "impuls": "Мытищи",
  "vidnyysport": "Видное"
};

// Маппинг округов/районов для кортов (теннис)
const TENNIS_COURT_DISTRICTS: Record<string, string> = {
  "spartak-grunt": "ВАО",
  "spartak-hard": "ВАО",
  "itc-tsaritsyno": "ЮАО",
  "itc-mytischy": "Мытищи",
  "tennis-capital": "САО",
  "pro-tennis-kashirka": "ЮАО",
  "cooltennis-baumanskaya": "ЦАО",
  "megasport-tennis": "ЮЗАО",
  "luzhniki-tennis": "ЦАО",
  "slice-tennis": "ЮВАО",
  "gallery-cort": "ЮВАО",
  "olonetskiy": "СВАО",
  "impuls": "Мытищи",
  "vidnyysport": "Видное"
};

// Список кортов, где в метро указан город (не станция метро)
const TENNIS_COURT_IS_CITY: Record<string, boolean> = {
  "itc-mytischy": true,
  "impuls": true,
  "vidnyysport": true
};

// Названия площадок для отображения (падел)
const PADEL_COURT_NAMES: Record<string, string> = {
  "rocket-padel-club": "Rocket Padel Club",
  "padel-friends": "Padel Friends",
  "buenos-padel": "Buenos Padel",
  "padel-belozer": "Падел на Белозерской",
  "tennis-capital-padel-savelovskaya": "Tennis Capital Савеловская",
  "tennis-capital-padel-vdnh": "Tennis Capital ВДНХ",
  "up2-padel": "Up2 Padel",
  "bandehaarenaclub": "Bandeha Padel Arena",
  "orbita-tennis": "Орбита Падел",
  "v-padel": "V Padel"
};

// Ссылки на бронирование кортов (падел)
const PADEL_COURT_LINKS: Record<string, string> = {
  "rocket-padel-club": "https://rocketpadel-club.ru/",
  "padel-friends": "https://padelfriends.ru/moscow",
  "buenos-padel": "https://buenospadel.ru/",
  "padel-belozer": "https://padel-tennis-msk.ru/",
  "tennis-capital-padel-savelovskaya": "https://tenniscapital.ru/padel-tennis",
  "tennis-capital-padel-vdnh": "https://tenniscapital.ru/padel-tennis",
  "up2-padel": "https://juzhnyj-1745398028.clients.site/?yclid=16571022320512532479&utm_content=17369921911&utm_source=geoadv_maps",
  "bandehaarenaclub": "https://bandehaarenaclub.ru/",
  "orbita-tennis": "https://orbitatennis.ru/",
  "v-padel": "https://v-padel.ru/"
};

// Ссылки на карты кортов (падел)
const PADEL_COURT_MAPS: Record<string, string> = {
  "rocket-padel-club": "https://yandex.ru/maps/org/rocket_padel_club/209082414430/?ll=37.060725%2C55.532844&z=16.96",
  "padel-friends": "https://yandex.ru/maps/org/padel_friends/35837402005/?ll=37.552166%2C55.715677&z=16.96",
  "buenos-padel": "https://yandex.ru/maps/org/buenos_padel/67008877127/?indoorLevel=1&ll=37.592561%2C55.803768&z=16.67",
  "padel-belozer": "https://yandex.ru/maps/org/tennis_i_padel/124086428013/?ll=37.615136%2C55.895171&z=16.67",
  "tennis-capital-padel-savelovskaya": "https://yandex.ru/maps/org/padel_tennis_kepital/96963201111/?ll=37.591995%2C55.800454&z=16.67",
  "tennis-capital-padel-vdnh": "https://yandex.ru/maps/org/tennis_kepital/78859832801/?ll=37.613995%2C55.832212&z=16.67",
  "up2-padel": "https://yandex.ru/maps/org/up2_padel/166138496300/?indoorLevel=1&ll=37.611742%2C55.621719&z=16.96",
  "bandehaarenaclub": "https://yandex.ru/maps/org/bandeha_padel_arena/216192396141/?ll=37.389086%2C55.826837&z=16.96",
  "orbita-tennis": "https://yandex.ru/maps/org/orbita_padel/113012593244/?ll=37.395581%2C55.649413&z=13.19",
  "v-padel": "https://yandex.ru/maps/org/v_padel/54876592176/?indoorLevel=5&ll=37.407196%2C55.884969&z=16.96"
};

// Маппинг метро/города для кортов (падел)
const PADEL_COURT_METRO: Record<string, string> = {
  "tennis-capital-padel-savelovskaya": "Савеловская",
  "tennis-capital-padel-vdnh": "ВДНХ",
  "padel-friends": "Сокольники",
  "buenos-padel": "Савеловская",
  "padel-belozer": "Белозерская",
  "up2-padel": "Южная",
  "bandehaarenaclub": "Октябрьское поле",
  "orbita-tennis": "Юго-Западная",
  "v-padel": "Петровско-Разумовская",
  "rocket-padel-club": "Мытищи"
};

// Маппинг округов/районов для кортов (падел)
const PADEL_COURT_DISTRICTS: Record<string, string> = {
  "tennis-capital-padel-savelovskaya": "САО",
  "tennis-capital-padel-vdnh": "СВАО",
  "padel-friends": "ВАО",
  "buenos-padel": "САО",
  "padel-belozer": "СВАО",
  "up2-padel": "ЮАО",
  "bandehaarenaclub": "СЗАО",
  "orbita-tennis": "ЗАО",
  "v-padel": "САО",
  "rocket-padel-club": "Мытищи"
};

// Список кортов, где в метро указан город (не станция метро)
const PADEL_COURT_IS_CITY: Record<string, boolean> = {
  "rocket-padel-club": true
};

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

// Опции локаций для поиска кортов
const locationOptions = [
  { id: 'center', label: 'Центр' },
  { id: 'west', label: 'Запад' },
  { id: 'north', label: 'Север' },
  { id: 'south', label: 'Юг' },
  { id: 'east', label: 'Восток' },
  { id: 'moscow-region', label: 'Подмосковье' },
  { id: 'any', label: 'Не важно' }
];

// Опции времени для поиска кортов
const timeOptions = [
  { id: 'morning', label: 'Утро (6:00-12:00)', startHour: 6, endHour: 12 },
  { id: 'day', label: 'День (12:00-18:00)', startHour: 12, endHour: 18 },
  { id: 'evening', label: 'Вечер (18:00-00:00)', startHour: 18, endHour: 24 },
  { id: 'any', label: 'Не важно' }
];

// Маппинг кортов к локациям (теннис)
const TENNIS_COURT_LOCATIONS: Record<string, string[]> = {
  "impuls": ["moscow-region"],
  "spartak-grunt": ["east"],
  "spartak-hard": ["east"],
  "itc-tsaritsyno": ["south"],
  "itc-mytischy": ["moscow-region"],
  "vidnyysport": ["moscow-region"],
  "pro-tennis-kashirka": ["south"],
  "megasport-tennis": ["south"],
  "gallery-cort": ["south"],
  "tennis-capital": ["north"],
  "luzhniki-tennis": ["center"],
  "cooltennis-baumanskaya": ["east"],
  "olonetskiy": ["north"],
  "slice-tennis": ["east"]
};

// Маппинг кортов к локациям (падел)
const PADEL_COURT_LOCATIONS: Record<string, string[]> = {
  "rocket-padel-club": ["moscow-region"],
  "padel-friends": ["center"],
  "buenos-padel": ["center"],
  "padel-belozer": ["south"],
  "tennis-capital-padel-savelovskaya": ["north"],
  "tennis-capital-padel-vdnh": ["north"],
  "up2-padel": ["south"],
  "bandehaarenaclub": ["west"],
  "orbita-tennis": ["west"],
  "v-padel": ["center"]
};

// Временное хранилище для состояния поиска (дата, спорт, выбранные локации, выбранное время)
interface SearchState {
  date: string;
  dateStr: string;
  sport: 'tennis' | 'padel';
  selectedLocations: string[];
  selectedTimeSlots: string[];
}
const searchStates = new Map<number, SearchState>();

// === Функции для работы со слотами ===

/**
 * Загружает слоты из Cloud Storage или локального файла
 */
async function loadSlots(sport: 'tennis' | 'padel' = 'tennis'): Promise<SlotsData | null> {
  try {
    const fileName = sport === 'padel' ? PADEL_SLOTS_FILE : TENNIS_SLOTS_FILE;
    const localPath = sport === 'padel' ? PADEL_LOCAL_SLOTS_PATH : TENNIS_LOCAL_SLOTS_PATH;
    
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
    console.error('Ошибка загрузки слотов:', error);
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
  sport: 'tennis' | 'padel'
): { siteName: string; slots: Slot[] }[] {
  // Если выбрано "Не важно", возвращаем все слоты
  if (selectedLocations.includes('any')) {
    return siteSlots;
  }
  
  // Получаем маппинг локаций для текущего спорта
  const COURT_LOCATIONS = sport === 'padel' ? PADEL_COURT_LOCATIONS : TENNIS_COURT_LOCATIONS;
  
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
 * Получает все уникальные даты из данных слотов (начиная с сегодня)
 */
function getAvailableDates(slotsData: SlotsData): string[] {
  const datesSet = new Set<string>();
  const today = new Date().toISOString().split('T')[0];
  
  for (const dates of Object.values(slotsData.sites)) {
    for (const date of Object.keys(dates)) {
      if (date >= today) {
        datesSet.add(date);
      }
    }
  }
  
  return Array.from(datesSet).sort();
}

/**
 * Форматирует дату для отображения на кнопке (например, "5 дек")
 */
function formatDateButton(dateKey: string): string {
  const date = new Date(dateKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateObj = new Date(dateKey);
  dateObj.setHours(0, 0, 0, 0);
  
  if (dateObj.getTime() === today.getTime()) {
    return 'Сегодня';
  }
  if (dateObj.getTime() === tomorrow.getTime()) {
    return 'Завтра';
  }
  
  const day = date.getDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${day} ${months[date.getMonth()]}`;
}

/**
 * Создаёт горизонтальную клавиатуру с датами
 */
function getDatePickerKeyboard(dates: string[]): TelegramBot.InlineKeyboardButton[][] {
  const buttons = dates.map(date => ({
    text: formatDateButton(date),
    callback_data: `date_pick_${date}`
  }));
  
  // Возвращаем все кнопки в одном ряду (Telegram позволяет скроллить горизонтально)
  return [buttons];
}

/**
 * Форматирует время из ISO строки в формат "12:00"
 */
function formatLastUpdatedTime(lastUpdated: string): string {
  try {
    const date = new Date(lastUpdated);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (error) {
    console.error('Ошибка форматирования времени:', error);
    return '';
  }
}

/**
 * Форматирует слоты для отображения пользователю
 */
function formatSlotsMessage(date: string, siteSlots: { siteName: string; slots: Slot[] }[], sport: 'tennis' | 'padel' = 'tennis', lastUpdated?: string, prefix?: string): string {
  if (siteSlots.length === 0) {
    const emoji = sport === 'padel' ? '🏓' : '🎾';
    return `${emoji} На ${date} свободных кортов не найдено.`;
  }
  
  const emoji = sport === 'padel' ? '🏓' : '🎾';
  const COURT_NAMES = sport === 'padel' ? PADEL_COURT_NAMES : TENNIS_COURT_NAMES;
  const COURT_LINKS = sport === 'padel' ? PADEL_COURT_LINKS : TENNIS_COURT_LINKS;
  const COURT_METRO = sport === 'padel' ? PADEL_COURT_METRO : TENNIS_COURT_METRO;
  const COURT_MAPS = sport === 'padel' ? PADEL_COURT_MAPS : TENNIS_COURT_MAPS;
  const COURT_DISTRICTS = sport === 'padel' ? PADEL_COURT_DISTRICTS : TENNIS_COURT_DISTRICTS;
  const COURT_IS_CITY = sport === 'padel' ? PADEL_COURT_IS_CITY : TENNIS_COURT_IS_CITY;
  
  let message = '';
  if (prefix) {
    message = `${prefix}\n\n`;
  }
  message += `${emoji} *Свободные корты на ${date}*\n\n`;
  
  for (const { siteName, slots } of siteSlots) {
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
  
  // Добавляем информацию об актуальности данных
  if (lastUpdated) {
    const formattedTime = formatLastUpdatedTime(lastUpdated);
    if (formattedTime) {
      message += `\nℹ️ _Данные актуальны на ${formattedTime} и обновляются каждые 20 минут._`;
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

// Генерация клавиатуры для выбора локаций
function getLocationKeyboard(selectedLocations: string[]): TelegramBot.InlineKeyboardButton[][] {
  return [
    ...locationOptions.map(opt => [{
      text: selectedLocations.includes(opt.id) ? `✅ ${opt.label}` : opt.label,
      callback_data: `location_${opt.id}`
    }]),
    [{ text: '✔️ Готово', callback_data: 'location_done' }]
  ];
}

/**
 * Получает доступные временные диапазоны на основе текущего времени
 * Если dateKey - сегодняшняя дата, фильтруем прошедшие диапазоны
 */
function getAvailableTimeOptions(dateKey: string): typeof timeOptions {
  const today = new Date().toISOString().split('T')[0];
  
  // Если это не сегодня, возвращаем все опции
  if (dateKey !== today) {
    return timeOptions;
  }
  
  // Если это сегодня, фильтруем прошедшие диапазоны
  const now = new Date();
  const currentHour = now.getHours();
  
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

// Генерация клавиатуры с кнопкой "Выбрать другую дату"
function getSelectAnotherDateKeyboard(sport: 'tennis' | 'padel'): TelegramBot.InlineKeyboardButton[][] {
  return [
    [{ text: '📅 Выбрать другую дату', callback_data: `select_another_date_${sport}` }]
  ];
}

// Обработка команды /start
async function handleStart(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || 'друг';
  
  await getBot().sendMessage(chatId, `Рад тебя видеть, ${userName}!

Ты в Play Today — сервисе, который делает поиск кортов для тенниса и падела лёгким и комфортным.

Выбери время, а я покажу, где можно сыграть. 🎾✨`, {
    reply_markup: {
      keyboard: [
        [{ text: '🎾 Найти корт (теннис)' }],
        [{ text: '🏓 Найти корт (падел)' }],
        [{ text: '💬 Обратная связь' }],
      ],
      resize_keyboard: true
    }
  });
}

// Обработка команды /help
async function handleHelp(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  
  await getBot().sendMessage(chatId, 
    `📖 *Доступные команды:*\n\n` +
    `/start - Начать работу с ботом\n` +
    `/help - Показать это сообщение\n`,
    { parse_mode: 'Markdown' }
  );
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
  if (msg.reply_to_message?.text === '👤 Как к тебе обращаться?' && userId && text) {
    // Сохраняем имя пользователя
    const profile = users.get(userId) || {};
    profile.name = text;
    users.set(userId, profile);

    // Задаём вопрос об уровне игры
    await getBot().sendMessage(chatId, `Приятно познакомиться, ${text}! 
      \nВот как я понимаю уровни игры:
🎾 Новичок — беру ракетку редко, почти не играл(а)
🙂 Играл(а) немного — могу перекинуть мяч, иногда играю
🔥 Уверенный любитель — подача, розыгрыши, играю ≈1 раз в неделю
🏆 Сильный любитель — регулярные тренировки / турниры
\nВыбери свой уровень игры:`, {
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
      
      await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: 'date_today_tennis' }],
            [{ text: '📆 Завтра', callback_data: 'date_tomorrow_tennis' }],
            [{ text: '🗓 Указать дату', callback_data: 'date_custom_tennis' }]
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
      
      await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: 'date_today_padel' }],
            [{ text: '📆 Завтра', callback_data: 'date_tomorrow_padel' }],
            [{ text: '🗓 Указать дату', callback_data: 'date_custom_padel' }]
          ]
        }
      });
      break;
    case '💬 Обратная связь':
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
      
      await getBot().sendMessage(chatId, '💬 Оставьте обратную связь: https://t.me/play_today_chat');
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

  // Отслеживаем клик на кнопку
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

  await getBot().answerCallbackQuery(query.id);

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
    await getBot().sendMessage(chatId, `Отлично! Твой уровень: ${levelText}`);
    
    // Переходим к выбору районов
    await getBot().sendMessage(chatId, `📍 В каких частях Москвы тебе удобно играть?\n\nМожно выбрать несколько вариантов:`, {
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
      await getBot().sendMessage(chatId, '❌ Сессия поиска истекла. Начни поиск заново.');
      return;
    }
    
    const locationId = data.replace('location_', '');
    
    // Кнопка "Готово"
    if (locationId === 'done') {
      if (searchState.selectedLocations.length === 0) {
        await getBot().answerCallbackQuery(query.id, { text: 'Выбери хотя бы одну локацию или "Не важно"!' });
        return;
      }
      
      // Получаем доступные временные диапазоны
      const availableTimeOptions = getAvailableTimeOptions(searchState.date);
      
      // Фильтруем опции, исключая "Не важно" для проверки
      const timeOptionsWithoutAny = availableTimeOptions.filter(opt => opt.id !== 'any');
      
      // Если остался только один диапазон (кроме "Не важно"), автоматически выбираем его
      if (timeOptionsWithoutAny.length === 1) {
        searchState.selectedTimeSlots = [timeOptionsWithoutAny[0].id];
        searchStates.set(userId, searchState);
        
        // Пропускаем шаг выбора времени и сразу показываем результаты
        const slotsData = await loadSlots(searchState.sport);
        if (!slotsData) {
          await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
          searchStates.delete(userId);
          return;
        }
        
        // Получаем слоты на выбранную дату
        const siteSlots = getSlotsByDate(slotsData, searchState.date);
        
        // Фильтруем по локациям
        const filteredByLocation = filterSlotsByLocation(siteSlots, searchState.selectedLocations, searchState.sport);
        
        // Фильтруем по времени
        const filteredSlots = filterSlotsByTime(filteredByLocation, searchState.selectedTimeSlots);
        
        // Форматируем и отправляем сообщение
        const emoji = searchState.sport === 'padel' ? '🏓' : '🎾';
        await getBot().editMessageText(
          `${emoji} Ищем корты на ${searchState.dateStr}...`,
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
            const allSlotsWithoutFilters = filterSlotsByTime(allSlotsWithoutLocationFilter, ['any']);
            
            if (allSlotsWithoutFilters.length > 0) {
              // Показываем альтернативные варианты
              const message = formatSlotsMessage(searchState.dateStr, allSlotsWithoutFilters, searchState.sport, slotsData.lastUpdated);
              await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
              
              // Отправляем отдельным сообщением информацию об альтернативах
              await getBot().sendMessage(
                chatId,
                `К сожалению, по заданным параметрам подходящих кортов не нашлось.\n\nНо выше написал несколько альтернатив на ${searchState.dateStr} — возможно, они окажутся удобными. 🎾✨`,
                { 
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: getSelectAnotherDateKeyboard(searchState.sport)
                  }
                }
              );
            } else {
              // Даже без фильтров ничего нет
              await getBot().sendMessage(
                chatId,
                `К сожалению на данную дату нет доступных кортов, попробуйте выбрать другую дату или попробовать позднее`,
                { parse_mode: 'Markdown' }
              );
            }
          } else {
            // Фильтры были "any", но ничего не найдено
            await getBot().sendMessage(
              chatId,
              `К сожалению на данную дату нет доступных кортов, попробуйте выбрать другую дату или попробовать позднее`,
              { parse_mode: 'Markdown' }
            );
          }
        } else {
          const message = formatSlotsMessage(searchState.dateStr, filteredSlots, searchState.sport, slotsData.lastUpdated);
          await getBot().sendMessage(chatId, message, { 
            parse_mode: 'Markdown', 
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: getSelectAnotherDateKeyboard(searchState.sport)
            }
          });
        }
        
        // Очищаем состояние поиска
        searchStates.delete(userId);
        return;
      }
      
      // Если диапазонов несколько, показываем выбор времени с доступными опциями
      searchState.selectedTimeSlots = [];
      searchStates.set(userId, searchState);
      
      // Показываем выбор времени
      await getBot().editMessageText(
        '⏰ В какое время ищем корт?',
        { 
          chat_id: chatId, 
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: getTimeKeyboard([], availableTimeOptions)
          }
        }
      );
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
    await getBot().editMessageReplyMarkup(
      { inline_keyboard: getLocationKeyboard(searchState.selectedLocations) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Обработка выбора времени
  if (data?.startsWith('time_')) {
    const searchState = searchStates.get(userId);
    if (!searchState) {
      await getBot().sendMessage(chatId, '❌ Сессия поиска истекла. Начни поиск заново.');
      return;
    }
    
    const timeId = data.replace('time_', '');
    
    // Кнопка "Готово"
    if (timeId === 'done') {
      if (searchState.selectedTimeSlots.length === 0) {
        await getBot().answerCallbackQuery(query.id, { text: 'Выбери хотя бы одно время или "Не важно"!' });
        return;
      }
      
      // Загружаем слоты
      const slotsData = await loadSlots(searchState.sport);
      if (!slotsData) {
        await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
        searchStates.delete(userId);
        return;
      }
      
      // Получаем слоты на выбранную дату
      const siteSlots = getSlotsByDate(slotsData, searchState.date);
      
      // Фильтруем по локациям
      const filteredByLocation = filterSlotsByLocation(siteSlots, searchState.selectedLocations, searchState.sport);
      
      // Фильтруем по времени
      const filteredSlots = filterSlotsByTime(filteredByLocation, searchState.selectedTimeSlots);
      
      // Форматируем и отправляем сообщение
      const emoji = searchState.sport === 'padel' ? '🏓' : '🎾';
      await getBot().editMessageText(
        `${emoji} Ищем корты на ${searchState.dateStr}...`,
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
          const allSlotsWithoutFilters = filterSlotsByTime(allSlotsWithoutLocationFilter, ['any']);
          
          if (allSlotsWithoutFilters.length > 0) {
            // Показываем альтернативные варианты
            const message = formatSlotsMessage(searchState.dateStr, allSlotsWithoutFilters, searchState.sport, slotsData.lastUpdated);
            await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
            
            // Отправляем отдельным сообщением информацию об альтернативах
            await getBot().sendMessage(
              chatId,
              `К сожалению, по заданным параметрам подходящих кортов не нашлось.\n\Но выше написал несколько альтернатив на ${searchState.dateStr} — возможно, они окажутся удобными. 🎾✨`,
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: getSelectAnotherDateKeyboard(searchState.sport)
                }
              }
            );
          } else {
            // Даже без фильтров ничего нет
            await getBot().sendMessage(
              chatId,
              `К сожалению на данную дату нет доступных кортов, попробуйте выбрать другую дату или попробовать позднее`,
              { parse_mode: 'Markdown' }
            );
          }
        } else {
          // Фильтры были "any", но ничего не найдено
          await getBot().sendMessage(
            chatId,
            `К сожалению на данную дату нет доступных кортов, попробуйте выбрать другую дату или попробовать позднее`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        const message = formatSlotsMessage(searchState.dateStr, filteredSlots, searchState.sport, slotsData.lastUpdated);
        await getBot().sendMessage(chatId, message, { 
          parse_mode: 'Markdown', 
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: getSelectAnotherDateKeyboard(searchState.sport)
          }
        });
      }
      
      // Очищаем состояние поиска
      searchStates.delete(userId);
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
    await getBot().editMessageReplyMarkup(
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
        await getBot().answerCallbackQuery(query.id, { text: 'Выбери хотя бы один район!' });
        return;
      }

      const selectedLabels = selected.map(id => 
        districtOptions.find(opt => opt.id === id)?.label
      ).filter(Boolean);

      // Первое сообщение - редактируем текущее
      await getBot().editMessageText(
        `📍 Районы: ${selectedLabels.join(', ')}`,
        { chat_id: chatId, message_id: query.message?.message_id }
      );

      // Второе сообщение с кнопками
      await getBot().sendMessage(chatId, 
        `Готово, профиль сохранён ✅\n\nТеперь я могу:\n• подсказывать корты поблизости\n\nЧто сделаем сейчас? 👇`, 
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
    await getBot().editMessageReplyMarkup(
      { inline_keyboard: getDistrictKeyboard(profile.districts || []) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Кнопка "Найти корт" из inline меню (по умолчанию теннис)
  if (data === 'action_find_court') {
    await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📆 Сегодня', callback_data: 'date_today_tennis' }],
          [{ text: '📆 Завтра', callback_data: 'date_tomorrow_tennis' }],
          [{ text: '🗓 Указать дату', callback_data: 'date_custom_tennis' }]
        ]
      }
    });
    return;
  }

  // Обработка выбора конкретной даты из date picker
  if (data?.startsWith('date_pick_')) {
    const parts = data.replace('date_pick_', '').split('_');
    const dateKey = parts[0];
    const sport = parts[1] === 'padel' ? 'padel' : 'tennis';
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
    
    // Показываем выбор локации
    await getBot().sendMessage(chatId, '📍 В какой локации ищем корт?', {
      reply_markup: {
        inline_keyboard: getLocationKeyboard([])
      }
    });
    return;
  }

  // Обработка выбора даты для поиска корта (теннис или падел)
  if (data?.startsWith('date_')) {
    const parts = data.replace('date_', '').split('_');
    const dateType = parts[0];
    const sport = parts[1] === 'padel' ? 'padel' : 'tennis';
    
    if (dateType === 'today') {
      const today = new Date();
      const dateStr = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Сохраняем состояние поиска
      searchStates.set(userId, {
        date: dateKey,
        dateStr: dateStr,
        sport: sport,
        selectedLocations: [],
        selectedTimeSlots: []
      });
      
      // Показываем выбор локации
      await getBot().sendMessage(chatId, '📍 В какой локации ищем корт?', {
        reply_markup: {
          inline_keyboard: getLocationKeyboard([])
        }
      });
      
    } else if (dateType === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Сохраняем состояние поиска
      searchStates.set(userId, {
        date: dateKey,
        dateStr: dateStr,
        sport: sport,
        selectedLocations: [],
        selectedTimeSlots: []
      });
      
      // Показываем выбор локации
      await getBot().sendMessage(chatId, '📍 В какой локации ищем корт?', {
        reply_markup: {
          inline_keyboard: getLocationKeyboard([])
        }
      });
      
    } else if (dateType === 'custom') {
      const slotsData = await loadSlots(sport);
      if (!slotsData) {
        await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
        return;
      }
      
      const availableDates = getAvailableDates(slotsData);
      if (availableDates.length === 0) {
        await getBot().sendMessage(chatId, '😔 Нет доступных дат для бронирования.');
        return;
      }
      
      // Добавляем sport к callback_data для каждой даты
      const dateButtons = availableDates.map(date => ({
        text: formatDateButton(date),
        callback_data: `date_pick_${date}_${sport}`
      }));
      
      await getBot().sendMessage(chatId, '📅 Выбери дату:', {
        reply_markup: {
          inline_keyboard: [dateButtons]
        }
      });
    }
    return;
  }

  // Обработка кнопки "Выбрать другую дату"
  if (data?.startsWith('select_another_date_')) {
    const sport = data.replace('select_another_date_', '') === 'padel' ? 'padel' : 'tennis';
    
    await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📆 Сегодня', callback_data: `date_today_${sport}` }],
          [{ text: '📆 Завтра', callback_data: `date_tomorrow_${sport}` }],
          [{ text: '🗓 Указать дату', callback_data: `date_custom_${sport}` }]
        ]
      }
    });
    return;
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    const profile = users.get(userId);
    const userName = profile?.name || query.from.first_name;
    
    await getBot().sendMessage(chatId, `Рад тебя видеть, ${userName}!

Ты в Play Today — сервисе, который делает поиск кортов для тенниса и падела лёгким и комфортным.

Выбери время, а я покажу, где можно сыграть. 🎾✨`, {
      reply_markup: {
        keyboard: [
          [{ text: '🎾 Найти корт (теннис)' }],
          [{ text: '🏓 Найти корт (падел)' }],
          [{ text: '💬 Обратная связь' }]
          // [{ text: '👤 Профиль' }]
        ],
        resize_keyboard: true
      }
    });
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
