/**
 * Модуль аналитики для сбора данных о кликах на кнопки в Telegram боте
 * 
 * Использует:
 * - Cloud Logging для логирования событий (встроено в Google Cloud Functions)
 * - BigQuery для хранения и анализа данных (опционально)
 */

import { BigQuery } from '@google-cloud/bigquery';

// Конфигурация BigQuery (опционально)
// GOOGLE_CLOUD_PROJECT может быть не установлен в Cloud Functions, используем metadata или явно задаем
const BIGQUERY_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'play-today-479819';
const BIGQUERY_DATASET_ID = process.env.BIGQUERY_DATASET || 'telegram_bot_analytics';
const BIGQUERY_TABLE_ID = process.env.BIGQUERY_TABLE || 'button_clicks';
const USE_BIGQUERY = process.env.USE_BIGQUERY === 'true' && !!BIGQUERY_PROJECT_ID;

// Логируем для отладки
if (process.env.USE_BIGQUERY === 'true') {
  console.log(`🔧 BigQuery config: USE_BIGQUERY=${process.env.USE_BIGQUERY}, PROJECT_ID=${BIGQUERY_PROJECT_ID}, DATASET=${BIGQUERY_DATASET_ID}`);
}

// Инициализация BigQuery клиента (только если включен)
let bigquery: BigQuery | null = null;
if (USE_BIGQUERY && BIGQUERY_PROJECT_ID) {
  bigquery = new BigQuery({ projectId: BIGQUERY_PROJECT_ID });
}

/**
 * Интерфейс события клика на кнопку
 */
export interface ButtonClickEvent {
  timestamp: string; // ISO 8601 формат
  userId: number;
  userName?: string;
  chatId: number;
  buttonType: string; // тип кнопки: 'callback' | 'text' | 'inline'
  buttonId: string; // идентификатор кнопки (callback_data или текст)
  buttonLabel?: string; // отображаемый текст кнопки
  messageId?: number; // ID сообщения с кнопкой
  context?: Record<string, any>; // дополнительный контекст
  sessionId?: string; // идентификатор сессии пользователя
}

/**
 * Логирует событие в Cloud Logging с structured logging
 */
function logToCloudLogging(event: ButtonClickEvent): void {
  const logEntry = {
    severity: 'INFO',
    message: `Button click: ${event.buttonType}/${event.buttonId}`,
    jsonPayload: {
      event_type: 'button_click',
      ...event,
      // Преобразуем timestamp в ISO строку для логов
      timestamp: new Date(event.timestamp).toISOString(),
    },
    labels: {
      service: 'play-today-bot',
      event_type: 'analytics',
    },
  };

  // Используем стандартный console.log, который автоматически
  // отправляется в Cloud Logging в Google Cloud Functions
  console.log(JSON.stringify(logEntry));
}

/**
 * Сохраняет событие в BigQuery (асинхронно, не блокирует выполнение)
 */
async function saveToBigQuery(event: ButtonClickEvent): Promise<void> {
  console.log(`🔍 saveToBigQuery called: bigquery=${!!bigquery}, USE_BIGQUERY=${USE_BIGQUERY}`);
  if (!bigquery || !USE_BIGQUERY) {
    console.log(`❌ Cannot save to BigQuery: bigquery=${!!bigquery}, USE_BIGQUERY=${USE_BIGQUERY}`);
    return;
  }

  const datasetId = BIGQUERY_DATASET_ID;
  const tableId = BIGQUERY_TABLE_ID;

  try {

    // Проверяем существование dataset и создаем если нужно
    const [datasets] = await bigquery.getDatasets();
    const datasetExists = datasets.some(ds => (ds.id || '') === datasetId);

    if (!datasetExists) {
      console.log(`📦 Creating dataset ${datasetId} in europe-west1...`);
      await bigquery.createDataset(datasetId, {
        location: 'europe-west1', // Belgium
        description: 'Telegram bot analytics dataset',
      });
      console.log(`✅ Dataset ${datasetId} created`);
    }

    // Проверяем существование таблицы и создаем если нужно
    const dataset = bigquery.dataset(datasetId);
    const [tables] = await dataset.getTables();
    const tableExists = tables.some(t => (t.id || '') === tableId);
    
    if (!tableExists) {
      console.log(`📋 Creating table ${tableId} in dataset ${datasetId}...`);
    }

    if (!tableExists) {
      await dataset.createTable(tableId, {
        schema: [
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'userId', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'userName', type: 'STRING', mode: 'NULLABLE' },
          { name: 'chatId', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'buttonType', type: 'STRING', mode: 'REQUIRED' },
          { name: 'buttonId', type: 'STRING', mode: 'REQUIRED' },
          { name: 'buttonLabel', type: 'STRING', mode: 'NULLABLE' },
          { name: 'messageId', type: 'INTEGER', mode: 'NULLABLE' },
          { name: 'context', type: 'JSON', mode: 'NULLABLE' },
          { name: 'sessionId', type: 'STRING', mode: 'NULLABLE' },
        ],
        description: 'Telegram bot button click events',
      });
      console.log(`✅ Table ${tableId} created`);
    }

    // Вставляем событие
    const rows = [
      {
        timestamp: event.timestamp,
        userId: event.userId,
        userName: event.userName || null,
        chatId: event.chatId,
        buttonType: event.buttonType,
        buttonId: event.buttonId,
        buttonLabel: event.buttonLabel || null,
        messageId: event.messageId || null,
        context: event.context ? JSON.stringify(event.context) : null,
        sessionId: event.sessionId || null,
      },
    ];

    await dataset.table(tableId).insert(rows);
    console.log(`✅ Event saved to BigQuery: ${event.buttonType}/${event.buttonId}`);
  } catch (error: any) {
    // Логируем детальную ошибку
    console.error('❌ Error saving to BigQuery:', {
      message: error?.message,
      code: error?.code,
      errors: error?.errors,
      datasetId,
      tableId,
      eventButtonId: event.buttonId,
    });
  }
}

/**
 * Отслеживает клик на кнопку
 * 
 * @param event - данные о событии клика
 * @param saveToBQ - сохранять ли в BigQuery (по умолчанию true, если BigQuery включен)
 */
export async function trackButtonClick(
  event: Omit<ButtonClickEvent, 'timestamp'>,
  saveToBQ: boolean = USE_BIGQUERY
): Promise<void> {
  const fullEvent: ButtonClickEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Логируем в Cloud Logging (всегда)
  logToCloudLogging(fullEvent);

  // Сохраняем в BigQuery (если включено и запрошено)
  if (saveToBQ && USE_BIGQUERY) {
    console.log(`💾 Attempting to save to BigQuery: ${event.buttonType}/${event.buttonId}, USE_BIGQUERY=${USE_BIGQUERY}, bigquery=${!!bigquery}`);
    // Выполняем асинхронно, не ждем завершения
    saveToBigQuery(fullEvent).catch(err => {
      console.error('Failed to save event to BigQuery:', err);
    });
  } else {
    console.log(`⏭️  Skipping BigQuery save: saveToBQ=${saveToBQ}, USE_BIGQUERY=${USE_BIGQUERY}, bigquery=${!!bigquery}`);
  }
}

/**
 * Парсит callback_data для определения типа кнопки
 */
export function parseButtonType(callbackData: string): {
  type: string;
  action: string;
  params?: Record<string, string>;
} {
  // Примеры: 'date_today_tennis', 'location_center', 'time_morning', 'district_done'
  const parts = callbackData.split('_');
  const type = parts[0] || 'unknown';
  const action = parts.slice(1).join('_') || 'unknown';

  return {
    type,
    action,
  };
}

/**
 * Создает sessionId для пользователя на основе userId и текущей даты
 * (можно улучшить, используя более сложную логику)
 */
export function generateSessionId(userId: number): string {
  const today = new Date().toISOString().split('T')[0];
  return `${userId}_${today}`;
}

