# Локальное тестирование системы напоминаний

## Быстрый старт

### 1. Подготовка

Убедитесь, что у вас установлены необходимые зависимости:

```bash
npm install
npm run build
```

### 2. Настройка переменных окружения

Создайте/обновите файл `.env`:

```bash
# Основные настройки
BOT_TOKEN_DEV=your_dev_bot_token_here
BOT_TOKEN=your_production_bot_token_here
NODE_ENV=development

# Для локального тестирования напоминаний
REMINDER_FUNCTION_URL=http://localhost:8082
GCP_PROJECT=your-project-id

# Cloud Tasks (опционально для локального тестирования)
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_QUEUE=default
```

**Важно:** 
- `NODE_ENV=development` - устанавливает задержку 10 секунд вместо 1 часа и использует dev токены
- `BOT_TOKEN_DEV` - токен бота для разработки (используется везде в dev режиме)
- `REMINDER_FUNCTION_URL=http://localhost:8082` - указывает на локальную функцию
- В dev режиме используется `setTimeout` с прямым HTTP вызовом (не Cloud Tasks)
- `GCP_PROJECT` не обязателен для локального тестирования, но может быть указан

### 3. Запуск (2 терминала)

#### Терминал 1: Запуск функции напоминаний

**Важно:** Убедитесь, что файл `.env` находится в корне проекта и содержит `BOT_TOKEN_DEV`.

```bash
# Одноразовый запуск
npm run dev:reminder

# Или с автоперезагрузкой при изменениях
npm run dev:reminder:watch
```

Вы должны увидеть:
```
Serving function...
Function: sendCoachReminder
Signature type: http
URL: http://localhost:8082/
```

**Если видите ошибку "Bot token not configured":**
1. Проверьте, что файл `.env` существует в корне проекта
2. Убедитесь, что в `.env` есть строка: `BOT_TOKEN_DEV=ваш_токен`
3. Перезапустите функцию напоминаний

#### Терминал 2: Запуск основного бота

```bash
# Одноразовый запуск
npm run dev

# Или с автоперезагрузкой
npm run dev:watch
```

### 4. Тестирование

1. **Создайте профиль тренера** в боте (если еще не создан)
2. **Создайте профиль игрока** от другого пользователя
3. **Выполните поиск корта** (это сохранит информацию о поиске):
   - Выберите дату
   - Выберите район (например, "Север")
   - Выберите время (например, "Утро")
   - Нажмите "Готово"
4. **Найдите тренера**:
   - Нажмите "👤 Подобрать тренера"
   - Выберите формат тренировки
   - Нажмите "📩 Отправить заявку" на карточке тренера

5. **Ожидайте 10 секунд** (в dev режиме)

6. **Проверьте напоминания**:
   - Тренер получит: "⏰ Напоминание о заявке"
   - Клиент получит: "⏰ Напоминание"
   - Оба сообщения будут содержать информацию о поиске корта

## Структура данных в Firestore

Во время теста можно проверить данные в Firestore:

### Коллекция: `coachRequests`

Document ID: `{userId}_{coachUserId}` (например, `123456_789012`)

```json
{
  "userId": 123456,
  "coachUserId": 789012,
  "userName": "Иван Иванов",
  "coachName": "Тренер Петров",
  "coachContact": "@trainer_petrov",
  "timestamp": 1705234567890,
  "reminderSent": false,
  "courtSearchDate": "понедельник, 13 января",
  "courtSearchTime": "Утро (до 12:00)",
  "courtSearchLocation": "Север, Центр"
}
```

После отправки напоминания поле `reminderSent` изменится на `true`.

## Логи для отладки

### Что смотреть в логах бота (Терминал 2):

При отправке заявки:
```
[coach_request] Request saved to Firestore: 123456_789012
[createReminderTask] Scheduling direct HTTP call in 10s for request 123456_789012
[coach_request] Scheduled reminder task for request 123456_789012
```

Через 10 секунд:
```
[createReminderTask] Calling reminder function for 123456_789012
[createReminderTask] Reminder sent successfully for 123456_789012
```

### Что смотреть в логах функции напоминаний (Терминал 1):

```
[sendCoachReminder] Function invoked
[sendCoachReminder] Processing request: 123456_789012
[sendCoachReminder] Reminder sent to coach 789012
[sendCoachReminder] Reminder sent to client 123456
[sendCoachReminder] Successfully processed request 123456_789012
```

## Тестирование без Cloud Tasks

Если у вас нет настроенного Cloud Tasks (или не хотите его использовать локально), можно протестировать функцию напоминаний напрямую:

### Вручную вызвать функцию напоминаний:

```bash
# Создайте заявку через бота
# Затем вызовите функцию вручную:

curl -X POST http://localhost:8082 \
  -H "Content-Type: application/json" \
  -d '{"requestKey": "123456_789012"}'
```

Замените `123456_789012` на реальный ключ из Firestore.

## Troubleshooting

### Проблема: "Missing configuration, skipping reminder"

**Решение:** Убедитесь, что в `.env` установлен:
- `REMINDER_FUNCTION_URL=http://localhost:8082` (обязательно для локального тестирования)
- `GCP_PROJECT` не обязателен для dev режима, но может быть указан

### Проблема: "Bot token not configured"

**Решение:**
1. **Проверьте файл `.env`** в корне проекта - он должен содержать:
   ```bash
   BOT_TOKEN_DEV=ваш_токен_бота
   NODE_ENV=development
   ```
2. **Проверьте логи функции** - должны быть детали:
   ```
   [sendCoachReminder] Bot token not found. Details:
     - NODE_ENV: development
     - Expected token: BOT_TOKEN_DEV
     - BOT_TOKEN_DEV exists: true/false
   ```
3. **Убедитесь, что `.env` файл находится в корне проекта** (там же, где `package.json`)
4. **Перезапустите функцию напоминаний** после изменения `.env`
5. **Проверьте, что токен не содержит пробелов** и правильно скопирован

### Проблема: Функция напоминаний не запускается

**Решение:** 
1. Проверьте, что код скомпилирован: `npm run build`
2. Проверьте, что файл существует: `dist/functions/send-coach-reminder.js`
3. Проверьте порт 8082 - возможно, он занят другим процессом
4. Проверьте, что переменные окружения загружены (см. проблему выше)

### Проблема: Напоминания не приходят через 10 секунд

**Решение:**
1. **Проверьте, что функция напоминаний запущена** (Терминал 1 должен показывать "Serving function...")
2. **Проверьте логи бота** (Терминал 2) - должно быть:
   - `[createReminderTask] Scheduling direct HTTP call in 10s for request ...`
   - Через 10 секунд: `[createReminderTask] Calling reminder function for ...`
3. **Проверьте логи функции напоминаний** (Терминал 1) - должно быть:
   - `[sendCoachReminder] Function invoked`
   - `[sendCoachReminder] Processing request: ...`
4. **Убедитесь, что `NODE_ENV=development` установлен**
5. **Проверьте, что `REMINDER_FUNCTION_URL=http://localhost:8082` установлен**
6. **Проверьте, что порт 8082 доступен** - попробуйте вызвать функцию вручную:
   ```bash
   curl -X POST http://localhost:8082 \
     -H "Content-Type: application/json" \
     -d '{"requestKey": "YOUR_REQUEST_KEY"}'
   ```
7. **Проверьте Firestore** - убедитесь, что заявка сохранена и `reminderSent: false`

### Проблема: "Request not found or already processed"

**Причины:**
- Заявка была удалена (кто-то нажал "Да" или "Нет")
- Неправильный `requestKey`
- Данные не сохранились в Firestore

**Решение:** Проверьте Firestore Console и создайте новую заявку

## Дополнительные команды

### Просмотр документов в Firestore (если установлен gcloud):

```bash
gcloud firestore documents list coachRequests --project=your-project-id
```

### Очистка тестовых данных:

```bash
# Через Google Cloud Console -> Firestore
# Удалите коллекцию coachRequests
```

## Переход на production

Когда все протестировано локально:

1. **Деплой функции напоминаний:**
   ```bash
   ./deploy-reminder-function.sh
   ```

2. **Обновите `.env` production переменные:**
   ```bash
   NODE_ENV=production
   REMINDER_FUNCTION_URL=https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendCoachReminder
   ```

3. **Деплой основного бота:**
   ```bash
   npm run deploy
   ```

Задержка автоматически изменится с 10 секунд на 1 час.

