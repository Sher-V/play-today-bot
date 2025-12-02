import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ BOT_TOKEN не найден в .env файле');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Временное хранилище пользователей (в памяти)
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

console.log('🤖 Бот запущен...');

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || 'друг';
  
  bot.sendMessage(chatId, `Привет, ${userName}! 👋\n\nЯ бот Play Today.\n
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
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, 
    `📖 *Доступные команды:*\n\n` +
    `/start - Начать работу с ботом\n` +
    `/help - Показать это сообщение\n`,
    { parse_mode: 'Markdown' }
  );
});

// Обработка текстовых сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from?.id;

  // Пропускаем команды
  if (text?.startsWith('/')) return;

  // Проверяем, это ответ на вопрос "Как к тебе обращаться?"
  if (msg.reply_to_message?.text === '👤 Как к тебе обращаться?' && userId && text) {
    // Сохраняем имя пользователя
    const profile = users.get(userId) || {};
    profile.name = text;
    users.set(userId, profile);

    // Задаём вопрос об уровне игры
    bot.sendMessage(chatId, `Приятно познакомиться, ${text}! 
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
      bot.sendMessage(chatId, '🎮 Отлично! Выбери игру или создай новую сессию.');
      break;
    case '👥 Найти партнера':
      bot.sendMessage(chatId, '📋 Список твоих игр пока пуст.');
      break;
    case '👤 Профиль':
      bot.sendMessage(chatId, '👤 Как к тебе обращаться?', {
        reply_markup: {
          force_reply: true
        }
      });
      break;
  }
});

// Обработка callback query (для inline кнопок)
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId) return;

  bot.answerCallbackQuery(query.id);

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
    await bot.sendMessage(chatId, `Отлично! Твой уровень: ${levelText}`);
    
    // Переходим к выбору районов
    bot.sendMessage(chatId, `📍 В каких частях Москвы тебе удобно играть?\n\nМожно выбрать несколько вариантов:`, {
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
        bot.answerCallbackQuery(query.id, { text: 'Выбери хотя бы один район!' });
        return;
      }

      const selectedLabels = selected.map(id => 
        districtOptions.find(opt => opt.id === id)?.label
      ).filter(Boolean);

      // Первое сообщение - редактируем текущее
      await bot.editMessageText(
        `📍 Районы: ${selectedLabels.join(', ')}`,
        { chat_id: chatId, message_id: query.message?.message_id }
      );

      // Второе сообщение с кнопками
      bot.sendMessage(chatId, 
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
    bot.editMessageReplyMarkup(
      { inline_keyboard: getDistrictKeyboard(profile.districts || []) },
      { chat_id: chatId, message_id: query.message?.message_id }
    );
    return;
  }

  // Кнопка "Вернуться на главную"
  if (data === 'action_home') {
    const profile = users.get(userId);
    const userName = profile?.name || query.from.first_name;
    
    bot.sendMessage(chatId, `Привет, ${userName}! 👋\n\nЯ бот Play Today. Чем могу помочь?`, {
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
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Бот остановлен');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Бот остановлен');
  bot.stopPolling();
  process.exit(0);
});

