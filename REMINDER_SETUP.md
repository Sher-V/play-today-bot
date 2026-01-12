# Настройка системы напоминаний для заявок тренерам

## Обзор

Система отправляет напоминания тренеру и клиенту через 1 час после отправки заявки:
- Тренеру: "Вы связались с клиентом?"
- Клиенту: "С вами связался тренер?"

## Архитектура

1. **Основной бот** (`src/index.ts`):
   - При отправке заявки сохраняет данные в Firestore (`coachRequests` коллекция)
   - Создает Cloud Task с задержкой:
     - **Production**: 1 час (3600 секунд)
     - **Development** (`NODE_ENV=development`): 10 секунд
   
2. **Cloud Task**:
   - Выполняется через заданную задержку после создания
   - Вызывает Cloud Function `sendCoachReminder`
   
3. **Cloud Function** (`src/functions/send-coach-reminder.ts`):
   - Читает данные заявки из Firestore
   - Отправляет напоминания через Telegram Bot API
   - Обновляет статус `reminderSent` в Firestore

## Настройка

### 1. Создание Cloud Tasks Queue

Если очередь еще не создана:

```bash
./setup-video-upload-queue.sh
```

Или вручную:

```bash
gcloud tasks queues create default \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID
```

### 2. Деплой Cloud Function для напоминаний

```bash
# Убедитесь, что переменные окружения установлены
export GCP_PROJECT="your-project-id"
export BOT_TOKEN="your-bot-token"

# Деплой функции
./deploy-reminder-function.sh
```

Скрипт выведет URL функции. Скопируйте его.

### 3. Обновление переменных окружения

Добавьте в `.env`:

```bash
# URL Cloud Function для отправки напоминаний (после деплоя)
REMINDER_FUNCTION_URL=https://us-central1-YOUR_PROJECT.cloudfunctions.net/sendCoachReminder

# Cloud Tasks настройки (если еще не установлены)
GCP_PROJECT=your-project-id
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_QUEUE=default
```

### 4. Передеплой основного бота

После установки `REMINDER_FUNCTION_URL` передеплойте основной бот:

```bash
npm run deploy
# или
gcloud functions deploy playTodayBot --gen2 ...
```

## Локальная разработка

При локальной разработке (`NODE_ENV=development`):

1. **Задержка составляет 10 секунд** вместо 1 часа для быстрого тестирования
2. Если `REMINDER_FUNCTION_URL` не установлен, Cloud Task не создается (логируется предупреждение)
3. Можно запустить функцию напоминаний локально:

```bash
# В одном терминале - основной бот
npm run dev

# В другом терминале - функция напоминаний
npx functions-framework --target=sendCoachReminder --source=dist/functions/send-coach-reminder.js --port=8081
```

4. Установите в `.env`:
```bash
NODE_ENV=development
REMINDER_FUNCTION_URL=http://localhost:8081
```

## Структура данных в Firestore

### Коллекция: `coachRequests`

Document ID: `{userId}_{coachUserId}`

```typescript
{
  userId: number;           // ID клиента
  coachUserId: number;      // ID тренера
  userName: string;         // Имя клиента
  coachName: string;        // Имя тренера
  coachContact: string;     // Контакт тренера
  timestamp: number;        // Время создания заявки (Unix timestamp)
  reminderSent: boolean;    // Было ли отправлено напоминание
}
```

## Обработка ответов

### Кнопки для тренера
- ✅ **Да** → `request_coach_yes_{requestKey}` - удаляет заявку из Firestore
- ❌ **Нет, не смогу** → `request_coach_no_{requestKey}` - уведомляет клиента и удаляет заявку
- 💬 **Связаться** → открывает чат с клиентом

### Кнопки для клиента
- ✅ **Да** → `request_client_yes_{requestKey}` - удаляет заявку из Firestore
- ❌ **Нет** → `request_client_no_{requestKey}` - отправляет напоминание тренеру, показывает клиенту контакт

## Мониторинг

### Проверка Cloud Function

```bash
# Просмотр логов
gcloud functions logs read sendCoachReminder \
  --region=us-central1 \
  --limit=50

# Проверка статуса
gcloud functions describe sendCoachReminder \
  --region=us-central1 \
  --gen2
```

### Проверка Cloud Tasks Queue

```bash
# Список задач в очереди
gcloud tasks list --queue=default --location=us-central1

# Статистика очереди
gcloud tasks queues describe default --location=us-central1
```

### Проверка данных в Firestore

Через Google Cloud Console или локально:

```typescript
const snapshot = await firestore.collection('coachRequests').get();
snapshot.forEach(doc => {
  console.log(doc.id, doc.data());
});
```

## Troubleshooting

### Cloud Task не создается
- Проверьте, что `REMINDER_FUNCTION_URL`, `GCP_PROJECT`, `CLOUD_TASKS_LOCATION` установлены
- Проверьте, что очередь `default` существует
- Проверьте права доступа сервисного аккаунта Cloud Functions к Cloud Tasks

### Напоминания не отправляются
- Проверьте логи функции `sendCoachReminder`
- Убедитесь, что документ существует в Firestore
- Проверьте, что `BOT_TOKEN` установлен в функции

### Напоминание отправилось дважды
- Проверьте поле `reminderSent` в Firestore
- Функция должна проверять это поле перед отправкой

## Стоимость

- **Cloud Tasks**: $0.40 за 1 млн задач
- **Cloud Functions**: Gen 2, ~256MB RAM, ~1 секунда выполнения
- **Firestore**: Операции чтения/записи ($0.06 за 100k операций)

Примерная стоимость для 1000 заявок/день: < $1/месяц

