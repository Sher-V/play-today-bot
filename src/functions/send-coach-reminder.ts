// Загрузка переменных окружения (должно быть первым импортом)
import 'dotenv/config';
import * as functions from '@google-cloud/functions-framework';
import TelegramBot from 'node-telegram-bot-api';
import { Firestore } from '@google-cloud/firestore';
import { getBotToken } from '../utils/config-utils';

// Инициализация Firestore
const firestore = new Firestore();
const REQUESTS_COLLECTION = 'coachRequests';

interface CoachRequestData {
  userId: number;
  coachUserId: number;
  userName: string;
  coachName: string;
  coachContact: string;
  timestamp: number;
  reminderSent: boolean;
  courtSearchDate?: string;
  courtSearchTime?: string;
  courtSearchLocation?: string;
}

/**
 * Cloud Function для отправки напоминаний о заявке тренеру
 * Вызывается через Cloud Tasks с задержкой в 1 час
 */
functions.http('sendCoachReminder', async (req, res) => {
  console.log('[sendCoachReminder] Function invoked');

  try {
    const { requestKey } = req.body;

    if (!requestKey) {
      console.error('[sendCoachReminder] Missing requestKey in request body');
      res.status(400).send('Missing requestKey');
      return;
    }

    console.log(`[sendCoachReminder] Processing request: ${requestKey}`);

    // Получаем данные заявки из Firestore
    const requestDoc = await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).get();

    if (!requestDoc.exists) {
      console.log(`[sendCoachReminder] Request ${requestKey} not found or already processed`);
      res.status(404).send('Request not found');
      return;
    }

    const requestData = requestDoc.data() as CoachRequestData;

    // Проверяем, не было ли уже отправлено напоминание
    if (requestData.reminderSent) {
      console.log(`[sendCoachReminder] Reminder already sent for ${requestKey}`);
      res.status(200).send('Reminder already sent');
      return;
    }

    const { userId, coachUserId, userName, coachName, coachContact, courtSearchDate, courtSearchTime, courtSearchLocation } = requestData;

    // Инициализируем бота
    const botToken = getBotToken();
    if (!botToken) {
      // Детальное логирование для отладки
      const isDev = process.env.NODE_ENV === 'development';
      const expectedTokenName = isDev ? 'BOT_TOKEN_DEV' : 'BOT_TOKEN';
      const hasDevToken = !!process.env.BOT_TOKEN_DEV;
      const hasProdToken = !!process.env.BOT_TOKEN;
      
      console.error(`[sendCoachReminder] Bot token not found. Details:`);
      console.error(`  - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
      console.error(`  - isDev: ${isDev}`);
      console.error(`  - Expected token: ${expectedTokenName}`);
      console.error(`  - BOT_TOKEN_DEV exists: ${hasDevToken}`);
      console.error(`  - BOT_TOKEN exists: ${hasProdToken}`);
      
      throw new Error(`Bot token not configured. Expected: ${expectedTokenName}`);
    }

    const bot = new TelegramBot(botToken);

    // Формируем URL для контакта с предзаполненным текстом
    const predefinedText = 'Добрый день, я из бота Play Today, хочу с вами потренироваться.';
    let contactUrl = '';
    if (coachContact.startsWith('@')) {
      const username = coachContact.substring(1);
      contactUrl = `https://t.me/${username}?text=${encodeURIComponent(predefinedText)}`;
    } else if (coachContact.startsWith('+')) {
      contactUrl = `https://t.me/${coachContact.replace(/\D/g, '')}?text=${encodeURIComponent(predefinedText)}`;
    } else {
      contactUrl = `https://t.me/${coachContact}?text=${encodeURIComponent(predefinedText)}`;
    }

    // Формируем сообщение для тренера
    let coachMessage = `⏰ <b>Напоминание о заявке</b>\n\n` +
      `Вы связались с клиентом <b>${userName}</b>?`;
    
    // Добавляем информацию о поиске корта, если есть
    if (courtSearchDate && courtSearchTime && courtSearchLocation) {
      coachMessage += `\n\n🗓 Игрок искал корт на <b>${courtSearchDate}</b> (${courtSearchTime})\n`;
      coachMessage += `📍 в районе: ${courtSearchLocation}`;
    }

    // Отправляем напоминание тренеру
    await bot.sendMessage(coachUserId, coachMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Да', callback_data: `request_coach_yes_${requestKey}` }],
          [{ text: '❌ Нет, не смогу', callback_data: `request_coach_no_${requestKey}` }],
          [{ text: '💬 Связаться', url: `tg://user?id=${userId}` }]
        ]
      }
    });

    console.log(`[sendCoachReminder] Reminder sent to coach ${coachUserId}`);

    // Отправляем напоминание клиенту
    await bot.sendMessage(userId, 
      `⏰ <b>Напоминание</b>\n\n` +
      `С вами связался тренер <b>${coachName}</b>?`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Да', callback_data: `request_client_yes_${requestKey}` }],
            [{ text: '❌ Нет', callback_data: `request_client_no_${requestKey}` }]
          ]
        }
      }
    );

    console.log(`[sendCoachReminder] Reminder sent to client ${userId}`);

    // Обновляем статус напоминания в Firestore
    await firestore.collection(REQUESTS_COLLECTION).doc(requestKey).update({
      reminderSent: true
    });

    console.log(`[sendCoachReminder] Successfully processed request ${requestKey}`);
    res.status(200).send('Reminders sent successfully');
  } catch (error) {
    console.error('[sendCoachReminder] Error:', error);
    res.status(500).send(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

