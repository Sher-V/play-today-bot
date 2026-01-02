# Быстрое локальное тестирование функции рассылки

## Способ 1: Простой скрипт (самый быстрый)

```bash
# Убедитесь, что у вас есть .env файл с BOT_TOKEN
npm run test:broadcast
```

Это запустит функцию с тестовыми пользователями `[503391201, 500405387]` и выведет результаты в консоль.

## Способ 2: Через HTTP сервер (как в Cloud Functions)

```bash
# 1. Соберите проект
npm run build

# 2. Запустите функцию на порту 8081
npm run dev:broadcast
```

В другом терминале:

```bash
# Отправьте тестовый запрос
curl -X POST "http://localhost:8081" \
  -H "Content-Type: application/json" \
  -d '{
    "testMode": true,
    "testUserIds": [503391201, 500405387]
  }'
```

## Что нужно для тестирования

1. **Переменные окружения** (в `.env` файле):
   ```
   BOT_TOKEN=your_bot_token_here
   GOOGLE_CLOUD_PROJECT=play-today-479819
   ```

2. **Для работы с BigQuery** (если тестируете с `testMode: false`):
   ```bash
   gcloud auth application-default login
   ```

## Примеры использования

### Тест на двух пользователях (по умолчанию)
```bash
npm run test:broadcast
```

### Тест с другими пользователями
```bash
npx ts-node test-broadcast-local.ts --testUserIds=123456,789012
```

### Тест на всех пользователях из BigQuery (осторожно!)
```bash
npx ts-node test-broadcast-local.ts --testMode=false
```

## Ожидаемый результат

Вы должны увидеть:
```
🧪 Локальное тестирование функции рассылки
   Test mode: true
   Test user IDs: 503391201, 500405387

📢 Starting broadcast. Test mode: true, Test user IDs: 503391201, 500405387
🧪 Test mode: using 2 test users
✅ Message sent to user 503391201
✅ Message sent to user 500405387
✅ Broadcast completed. Success: 2, Failed: 0

📊 Response status: 200
📋 Response JSON:
{
  "message": "Broadcast completed",
  "testMode": true,
  "results": {
    "total": 2,
    "success": 2,
    "failed": 0,
    "errors": []
  }
}

✅ Тест завершен
```

