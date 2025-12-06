import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

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
const SLOTS_FILE = 'actual-slots.json';
const LOCAL_SLOTS_PATH = path.join(process.cwd(), SLOTS_FILE);
const USE_LOCAL_STORAGE = !BUCKET_NAME;
const storage = BUCKET_NAME ? new Storage() : null;

// Названия площадок для отображения
const COURT_NAMES: Record<string, string> = {
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
  "luzhniki-tennis": "Лужник»",
  "cooltennis-baumanskaya": "CoolTennis Бауманская",
  "olonetskiy": "Олонецкий",
  "slice-tennis": "Slice"
};

// Ссылки на бронирование кортов
const COURT_LINKS: Record<string, string> = {
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

// === Функции для работы со слотами ===

/**
 * Загружает слоты из Cloud Storage или локального файла
 */
async function loadSlots(): Promise<SlotsData | null> {
  try {
    if (USE_LOCAL_STORAGE) {
      // Загружаем из локального файла
      if (!fs.existsSync(LOCAL_SLOTS_PATH)) {
        console.error('Локальный файл слотов не найден:', LOCAL_SLOTS_PATH);
        return null;
      }
      const data = fs.readFileSync(LOCAL_SLOTS_PATH, 'utf-8');
      return JSON.parse(data);
    } else {
      // Загружаем из Cloud Storage
      const bucket = storage!.bucket(BUCKET_NAME!);
      const file = bucket.file(SLOTS_FILE);
      
      const [exists] = await file.exists();
      if (!exists) {
        console.error('Файл слотов не найден в Cloud Storage');
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
 * Форматирует слоты для отображения пользователю
 */
function formatSlotsMessage(date: string, siteSlots: { siteName: string; slots: Slot[] }[]): string {
  if (siteSlots.length === 0) {
    return `😔 На ${date} свободных кортов не найдено.`;
  }
  
  let message = `🎾 *Свободные корты на ${date}*\n\n`;
  
  for (const { siteName, slots } of siteSlots) {
    const displayName = COURT_NAMES[siteName] || siteName;
    const bookingLink = COURT_LINKS[siteName];
    
    if (bookingLink) {
      message += `📍 *${displayName}* — [Забронировать](${bookingLink})\n`;
    } else {
      message += `📍 *${displayName}*\n`;
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

// Обработка команды /start
async function handleStart(msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || 'друг';
  
  await getBot().sendMessage(chatId, `Привет, ${userName}! 👋\n\nЯ бот Play Today.\n
Что я умею:
• подобрать тебе партнёра под твой уровень и район
• подсказать корты поблизости`, {
    reply_markup: {
      keyboard: [
        [{ text: '🎾 Найти корт' }],
        [{ text: '👥 Найти партнера' }, { text: '👤 Профиль' }]
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
    return handleStart(msg);
  }
  if (text === '/help') {
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
    case '🎾 Найти корт':
      await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📆 Сегодня', callback_data: 'date_today' }],
            [{ text: '📆 Завтра', callback_data: 'date_tomorrow' }],
            [{ text: '🗓 Указать дату', callback_data: 'date_custom' }]
          ]
        }
      });
      break;
    case '👥 Найти партнера':
      await getBot().sendMessage(chatId, '📋 Список твоих игр пока пуст.');
      break;
    case '👤 Профиль':
      await getBot().sendMessage(chatId, '👤 Как к тебе обращаться?', {
        reply_markup: {
          force_reply: true
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
        `Готово, профиль сохранён ✅\n\nТеперь я могу:\n• находить тебе партнёров под твой уровень и район\n• подсказывать корты поблизости\n\nЧто сделаем сейчас? 👇`, 
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Найти партнёра', callback_data: 'action_find_partner' }],
              [{ text: '🎾 Найти корт', callback_data: 'action_find_court' }],
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

  // Кнопка "Найти корт" из inline меню
  if (data === 'action_find_court') {
    await getBot().sendMessage(chatId, '📅 На какую дату ищем корт?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📆 Сегодня', callback_data: 'date_today' }],
          [{ text: '📆 Завтра', callback_data: 'date_tomorrow' }],
          [{ text: '🗓 Указать дату', callback_data: 'date_custom' }]
        ]
      }
    });
    return;
  }

  // Обработка выбора конкретной даты из date picker (должен быть ДО date_)
  if (data?.startsWith('date_pick_')) {
    const dateKey = data.replace('date_pick_', '');
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    await getBot().sendMessage(chatId, `🔍 Ищем корты на ${dateStr}...`);
    
    const slotsData = await loadSlots();
    if (!slotsData) {
      await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
      return;
    }
    
    const siteSlots = getSlotsByDate(slotsData, dateKey);
    const message = formatSlotsMessage(dateStr, siteSlots);
    
    await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
    return;
  }

  // Обработка выбора даты для поиска корта
  if (data?.startsWith('date_')) {
    const dateType = data.replace('date_', '');
    
    if (dateType === 'today') {
      const today = new Date();
      const dateStr = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      await getBot().sendMessage(chatId, `🔍 Ищем корты на сегодня (${dateStr})...`);
      
      const slotsData = await loadSlots();
      if (!slotsData) {
        await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
        return;
      }
      
      const siteSlots = getSlotsByDate(slotsData, dateKey);
      const message = formatSlotsMessage(dateStr, siteSlots);
      
      await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
      
    } else if (dateType === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const dateKey = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
      
      await getBot().sendMessage(chatId, `🔍 Ищем корты на завтра (${dateStr})...`);
      
      const slotsData = await loadSlots();
      if (!slotsData) {
        await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
        return;
      }
      
      const siteSlots = getSlotsByDate(slotsData, dateKey);
      const message = formatSlotsMessage(dateStr, siteSlots);
      
      await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
      
    } else if (dateType === 'custom') {
      const slotsData = await loadSlots();
      if (!slotsData) {
        await getBot().sendMessage(chatId, '❌ Не удалось загрузить данные о кортах. Попробуй позже.');
        return;
      }
      
      const availableDates = getAvailableDates(slotsData);
      if (availableDates.length === 0) {
        await getBot().sendMessage(chatId, '😔 Нет доступных дат для бронирования.');
        return;
      }
      
      await getBot().sendMessage(chatId, '📅 Выбери дату:', {
        reply_markup: {
          inline_keyboard: getDatePickerKeyboard(availableDates)
        }
      });
    }
    return;
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    const profile = users.get(userId);
    const userName = profile?.name || query.from.first_name;
    
    await getBot().sendMessage(chatId, `Привет, ${userName}! 👋\n\nЯ бот Play Today. Чем могу помочь?`, {
      reply_markup: {
        keyboard: [
          [{ text: '🎾 Найти корт' }],
          [{ text: '👥 Найти партнера' }, { text: '👤 Профиль' }]
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
