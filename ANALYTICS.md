# Аналитика кликов на кнопки в Telegram боте

Система аналитики собирает данные о всех кликах пользователей на кнопки в боте и сохраняет их для дальнейшего анализа.

## Возможности

- ✅ **Cloud Logging** - автоматическое логирование всех событий (всегда включено)
- ✅ **BigQuery** - сохранение данных в BigQuery для сложных запросов и анализа (опционально)

## Настройка

### 1. Cloud Logging (автоматически)

Cloud Logging работает автоматически в Google Cloud Functions. Все события логируются в structured формате и доступны в [Cloud Console Logs Explorer](https://console.cloud.google.com/logs).

**Поиск событий:**
```
jsonPayload.event_type="button_click"
```

### 2. BigQuery (опционально)

Для включения сохранения данных в BigQuery:

1. **Установите переменные окружения:**
   ```bash
   # Включить BigQuery
   export USE_BIGQUERY=true
   
   # Название dataset (по умолчанию: telegram_bot_analytics)
   export BIGQUERY_DATASET=telegram_bot_analytics
   
   # Название таблицы (по умолчанию: button_clicks)
   export BIGQUERY_TABLE=button_clicks
   ```

2. **Добавьте переменные окружения при деплое:**
   ```bash
   gcloud functions deploy playTodayBot \
     --gen2 \
     --runtime=nodejs20 \
     --trigger-http \
     --allow-unauthenticated \
     --entry-point=telegramWebhook \
     --set-env-vars BOT_TOKEN=$BOT_TOKEN,USE_BIGQUERY=true,BIGQUERY_DATASET=telegram_bot_analytics,BIGQUERY_TABLE=button_clicks \
     --region=europe-west1 \
     --source=.
   ```

3. **Дайте права Cloud Functions на запись в BigQuery:**
   ```bash
   # Получите email сервисного аккаунта функции
   SERVICE_ACCOUNT=$(gcloud functions describe playTodayBot --gen2 --region=europe-west1 --format="value(serviceAccountEmail)")
   
   # Дайте права на BigQuery
   gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
     --member="serviceAccount:$SERVICE_ACCOUNT" \
     --role="roles/bigquery.dataEditor"
   
   gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
     --member="serviceAccount:$SERVICE_ACCOUNT" \
     --role="roles/bigquery.jobUser"
   ```

## Структура данных

### Cloud Logging

Каждое событие логируется в формате:
```json
{
  "severity": "INFO",
  "message": "Button click: callback/date_today_tennis",
  "jsonPayload": {
    "event_type": "button_click",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "userId": 123456789,
    "userName": "Иван",
    "chatId": 123456789,
    "buttonType": "callback",
    "buttonId": "date_today_tennis",
    "buttonLabel": "📆 Сегодня",
    "messageId": 123,
    "context": {
      "buttonType": "date",
      "buttonAction": "today_tennis",
      "username": "ivan_username",
      "languageCode": "ru"
    },
    "sessionId": "123456789_2024-01-15"
  }
}
```

### BigQuery

Таблица создается автоматически при первом событии со следующей схемой:

| Поле | Тип | Описание |
|------|-----|----------|
| `timestamp` | TIMESTAMP | Время клика |
| `userId` | INTEGER | ID пользователя Telegram |
| `userName` | STRING | Имя пользователя |
| `chatId` | INTEGER | ID чата |
| `buttonType` | STRING | Тип кнопки: `callback`, `text`, `command` |
| `buttonId` | STRING | ID кнопки (callback_data или текст) |
| `buttonLabel` | STRING | Отображаемый текст кнопки |
| `messageId` | INTEGER | ID сообщения с кнопкой |
| `context` | JSON | Дополнительный контекст |
| `sessionId` | STRING | ID сессии пользователя |

## Примеры запросов BigQuery

### Топ-10 самых популярных кнопок за последние 7 дней
```sql
SELECT 
  buttonId,
  buttonLabel,
  COUNT(*) as clicks
FROM `project_id.telegram_bot_analytics.button_clicks`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY buttonId, buttonLabel
ORDER BY clicks DESC
LIMIT 10
```

### Количество уникальных пользователей по дням
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(DISTINCT userId) as unique_users,
  COUNT(*) as total_clicks
FROM `project_id.telegram_bot_analytics.button_clicks`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY date
ORDER BY date DESC
```

### Конверсия по воронке (поиск корта)
```sql
WITH funnel AS (
  SELECT 
    userId,
    sessionId,
    MIN(CASE WHEN buttonId LIKE 'date_%' THEN timestamp END) as date_selected,
    MIN(CASE WHEN buttonId LIKE 'location_%' AND buttonId != 'location_done' THEN timestamp END) as location_selected,
    MIN(CASE WHEN buttonId = 'location_done' THEN timestamp END) as location_confirmed,
    MIN(CASE WHEN buttonId LIKE 'time_%' AND buttonId != 'time_done' THEN timestamp END) as time_selected,
    MIN(CASE WHEN buttonId = 'time_done' THEN timestamp END) as time_confirmed
  FROM `project_id.telegram_bot_analytics.button_clicks`
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND buttonType = 'callback'
  GROUP BY userId, sessionId
)
SELECT 
  COUNT(*) as total_sessions,
  COUNT(date_selected) as selected_date,
  COUNT(location_selected) as selected_location,
  COUNT(location_confirmed) as confirmed_location,
  COUNT(time_selected) as selected_time,
  COUNT(time_confirmed) as confirmed_time,
  ROUND(COUNT(time_confirmed) * 100.0 / COUNT(*), 2) as completion_rate
FROM funnel
```

### Распределение кликов по времени суток
```sql
SELECT 
  EXTRACT(HOUR FROM timestamp) as hour,
  COUNT(*) as clicks
FROM `project_id.telegram_bot_analytics.button_clicks`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY hour
ORDER BY hour
```

## Мониторинг

### Cloud Monitoring

Создайте метрику на основе логов для мониторинга активности:

1. Перейдите в [Cloud Monitoring](https://console.cloud.google.com/monitoring)
2. Создайте метрику на основе логов с фильтром:
   ```
   resource.type="cloud_function"
   jsonPayload.event_type="button_click"
   ```
3. Настройте алерты при необходимости

## Отключение аналитики

Чтобы отключить BigQuery (Cloud Logging нельзя отключить, но это не проблема):
```bash
export USE_BIGQUERY=false
```

Или просто не устанавливайте переменную `USE_BIGQUERY`.

## Локальная разработка

При разработке локально аналитика будет:
- ✅ Логироваться в консоль (в формате Cloud Logging)
- ❌ Не сохраняться в BigQuery (если не настроен GCP проект)

Это безопасно для разработки, так как не влияет на работу бота.

