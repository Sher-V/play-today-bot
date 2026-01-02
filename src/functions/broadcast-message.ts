/**
 * Cloud Function для массовой рассылки сообщений пользователям бота
 * 
 * Получает всех пользователей из BigQuery (которые хоть раз нажимали кнопку)
 * и отправляет им сообщение
 */

import { BigQuery } from '@google-cloud/bigquery';
import TelegramBot from 'node-telegram-bot-api';
import type { IncomingMessage, ServerResponse } from 'http';

// Типы для Cloud Functions
interface CloudFunctionRequest extends IncomingMessage {
  body?: {
    testMode?: boolean;
    testUserIds?: number[];
  };
  method: string;
}

interface CloudFunctionResponse extends ServerResponse {
  status(code: number): CloudFunctionResponse;
  send(body: string): CloudFunctionResponse;
  json(body: unknown): CloudFunctionResponse;
}

// Конфигурация BigQuery
const BIGQUERY_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'play-today-479819';
const BIGQUERY_DATASET_ID = process.env.BIGQUERY_DATASET || 'telegram_bot_analytics';
const BIGQUERY_TABLE_ID = process.env.BIGQUERY_TABLE || 'button_clicks';

// Сообщение для отправки
const NEW_YEAR_MESSAGE = `🎄 <b>С Новым годом!</b> Пусть в 2026 будет больше движения и свободных слотов 🙂

Мы добавили <b>переуступку корта</b> - теперь если у вас есть корт, но вы не можете сыграть - скидывайте его боту - и он предложит его всем пользователям!

Ещё обновили вид слотов — надеемся, стало нагляднее)

<b>Пробуйте!</b> 🙌`;

/**
 * Получает уникальные userId из BigQuery
 */
async function getUniqueUserIds(): Promise<number[]> {
  try {
    const bigquery = new BigQuery({ projectId: BIGQUERY_PROJECT_ID });
    const dataset = bigquery.dataset(BIGQUERY_DATASET_ID);
    const table = dataset.table(BIGQUERY_TABLE_ID);

    // SQL запрос для получения уникальных userId
    const query = `
      SELECT DISTINCT userId
      FROM \`${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.${BIGQUERY_TABLE_ID}\`
      ORDER BY userId
    `;

    console.log(`🔍 Executing query: ${query}`);

    const [rows] = await bigquery.query(query);
    const userIds = rows.map((row: { userId: number }) => row.userId);

    console.log(`✅ Found ${userIds.length} unique users`);
    
    if (userIds.length === 0) {
      console.warn('⚠️  No users found in BigQuery');
    }
    
    return userIds;
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error(`❌ Error querying BigQuery:`, err);
    throw new Error(`Failed to get users from BigQuery: ${err?.message || String(error)}`);
  }
}

/**
 * Отправляет сообщение пользователю
 */
async function sendMessageToUser(
  bot: TelegramBot,
  userId: number,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await bot.sendMessage(userId, message, { parse_mode: 'HTML' });
    console.log(`✅ Message sent to user ${userId}`);
    return { success: true };
  } catch (error: unknown) {
    const err = error as { response?: { body?: { description?: string } }; message?: string };
    const errorMessage = err?.response?.body?.description || err?.message || String(error);
    
    // Игнорируем ошибки, когда пользователь заблокировал бота или удалил чат
    if (
      errorMessage.includes('chat not found') ||
      errorMessage.includes('bot was blocked') ||
      errorMessage.includes('user is deactivated')
    ) {
      console.log(`⚠️  User ${userId} blocked bot or chat not found`);
      return { success: false, error: errorMessage };
    }
    
    console.error(`❌ Error sending message to user ${userId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Cloud Function для массовой рассылки
 */
export const broadcastMessage = async (
  req: CloudFunctionRequest,
  res: CloudFunctionResponse
): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const body = req.body || {};
    const testMode = body.testMode !== false; // По умолчанию testMode = true для безопасности
    const testUserIds = body.testUserIds || [503391201, 500405387];

    console.log(`📢 Starting broadcast. Test mode: ${testMode}, Test user IDs: ${testUserIds.join(', ')}`);

    // Инициализация бота
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new Error('BOT_TOKEN не найден в переменных окружения');
    }
    const bot = new TelegramBot(botToken, { polling: false });

    // Получаем список пользователей
    let userIds: number[];
    if (testMode) {
      userIds = testUserIds;
      console.log(`🧪 Test mode: using ${userIds.length} test users`);
    } else {
      userIds = await getUniqueUserIds();
      console.log(`📊 Production mode: found ${userIds.length} users from BigQuery`);
    }

    // Отправляем сообщения
    const results = {
      total: userIds.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: number; error: string }>,
    };

    // Отправляем сообщения с небольшой задержкой между запросами
    // чтобы не превысить rate limits Telegram API
    for (const userId of userIds) {
      const result = await sendMessageToUser(bot, userId, NEW_YEAR_MESSAGE);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push({ userId, error: result.error });
        }
      }

      // Задержка 50ms между сообщениями (20 сообщений в секунду)
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`✅ Broadcast completed. Success: ${results.success}, Failed: ${results.failed}`);

    res.status(200).json({
      message: 'Broadcast completed',
      testMode,
      results,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Error in broadcast:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err?.message || String(error),
    });
  }
};

