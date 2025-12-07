# Аналитика кликов на кнопки - Быстрый старт

## Что было сделано

Система аналитики собирает данные о всех кликах пользователей на кнопки в вашем Telegram боте.

## Как это работает

### Автоматически (Cloud Logging)
- Все события автоматически логируются в Cloud Logging
- Доступны в [Cloud Console Logs Explorer](https://console.cloud.google.com/logs)
- Поиск: `jsonPayload.event_type="button_click"`

### Опционально (BigQuery)
Для глубокого анализа данных можно включить сохранение в BigQuery.

## Включение BigQuery

### 1. Установите зависимости
```bash
npm install
```

### 2. Добавьте переменные окружения при деплое
Добавьте в команду деплоя:
```bash
--set-env-vars BOT_TOKEN=$BOT_TOKEN,USE_BIGQUERY=true,BIGQUERY_DATASET=telegram_bot_analytics,BIGQUERY_TABLE=button_clicks
```

### 3. Дайте права Cloud Function на BigQuery
```bash
# Получите email сервисного аккаунта
SERVICE_ACCOUNT=$(gcloud functions describe playTodayBot --gen2 --region=europe-west1 --format="value(serviceAccountEmail)")

# Дайте права
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.jobUser"
```

## Примеры использования

### Просмотр событий в Cloud Logging
1. Откройте [Cloud Console Logs Explorer](https://console.cloud.google.com/logs)
2. Введите фильтр: `jsonPayload.event_type="button_click"`
3. Нажмите "Run query"

### Запросы BigQuery

**Топ кнопок за неделю:**
```sql
SELECT 
  buttonId,
  buttonLabel,
  COUNT(*) as clicks
FROM `ваш_проект.telegram_bot_analytics.button_clicks`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY buttonId, buttonLabel
ORDER BY clicks DESC
LIMIT 10
```

**Уникальные пользователи по дням:**
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(DISTINCT userId) as unique_users,
  COUNT(*) as total_clicks
FROM `ваш_проект.telegram_bot_analytics.button_clicks`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY date
ORDER BY date DESC
```

Подробнее см. [ANALYTICS.md](./ANALYTICS.md)

