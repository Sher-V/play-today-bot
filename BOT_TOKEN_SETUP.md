# Настройка токенов бота для dev и production

## Обзор

Бот теперь использует разные токены в зависимости от окружения (`NODE_ENV`):
- **Development** - использует `BOT_TOKEN_DEV`
- **Production** - использует `BOT_TOKEN`

Это позволяет тестировать изменения на отдельном dev боте без влияния на production.

## Структура токенов

Все компоненты используют единую функцию `getBotToken()` из `src/utils/config-utils.ts`:
- Dev: `BOT_TOKEN_DEV`
- Production: `BOT_TOKEN`

### Основной бот (`src/index.ts`)
Использует токены через функцию `getBotToken()`:
- Dev: `BOT_TOKEN_DEV`
- Production: `BOT_TOKEN`

### Cloud Function для напоминаний (`src/functions/send-coach-reminder.ts`)
Использует токены через функцию `getBotToken()`:
- Dev: `BOT_TOKEN_DEV`
- Production: `BOT_TOKEN`

### Cloud Function для загрузки видео (`src/functions/upload-coach-video.ts`)
Получает токен в теле запроса от основного бота (автоматически правильный токен).

## Настройка переменных окружения

### Файл `.env` для локальной разработки:

```bash
# Окружение
NODE_ENV=development

# Токены для бота (используются везде)
BOT_TOKEN_DEV=1234567890:AAH-your-dev-bot-token-here
BOT_TOKEN=9876543210:AAH-your-production-bot-token-here

# Другие настройки...
GCP_PROJECT=your-project-id
```

**Важно:** 
- Dev и production токены могут быть одинаковыми, но рекомендуется использовать отдельные боты
- Один и тот же токен используется для основного бота и всех Cloud Functions

### Production деплой:

При деплое в production убедитесь что переменные установлены:

```bash
export NODE_ENV=production
export BOT_TOKEN="your-production-token"
```

## Функция getBotToken()

Централизованная функция для получения токена:

```typescript
function getBotToken(): string | null {
  const token = isDev ? process.env.BOT_TOKEN_DEV : process.env.BOT_TOKEN;
  
  if (!token) {
    const tokenName = isDev ? 'BOT_TOKEN_DEV' : 'BOT_TOKEN';
    console.error(`[getBotToken] ${tokenName} not found in environment variables`);
    return null;
  }
  
  return token;
}
```

Эта функция используется в:
- `getBot()` - создание основного бота
- `createVideoUploadTask()` - загрузка видео
- `uploadMediaToStorage()` - загрузка фото

Аналогичная функция существует в `send-coach-reminder.ts` для Cloud Function напоминаний.

## Создание dev бота

### 1. Создайте нового бота через @BotFather

```
/newbot
```

Следуйте инструкциям и сохраните токен.

### 2. Настройте команды для dev бота (опционально)

```
/setcommands
```

Выберите вашего dev бота и введите команды:
```
start - Начать работу с ботом
help - Помощь
```

### 3. Добавьте токен в `.env`

```bash
BOT_TOKEN_DEV=ваш_новый_токен
BOT_TOKEN_DEV=ваш_новый_токен
```

## Проверка текущего токена

### В логах бота:

```bash
npm run dev
```

При запуске в dev режиме бот будет использовать `BOT_TOKEN_DEV`.

### Программная проверка:

Функция `getBotToken()` логирует ошибки если токен не найден:
```
[getBotToken] BOT_TOKEN_DEV not found in environment variables
```

## Переключение между окружениями

### Локальная разработка (dev бот):

```bash
NODE_ENV=development npm run dev
```

Или установите в `.env`:
```bash
NODE_ENV=development
```

### Production:

Не устанавливайте `NODE_ENV` или установите:
```bash
NODE_ENV=production
```

## Деплой Cloud Functions

### Деплой функции напоминаний:

```bash
export BOT_TOKEN="ваш-production-токен"
export GCP_PROJECT="ваш-проект"
./deploy-reminder-function.sh
```

Функция автоматически получит токен через переменную окружения.

## Troubleshooting

### Ошибка: "BOT_TOKEN_DEV не найден в переменных окружения"

**Решение:** Добавьте `BOT_TOKEN_DEV` в `.env` файл.

### Бот отвечает в production окружении

**Проблема:** Используется dev токен в production.

**Решение:** Убедитесь что `NODE_ENV` не установлен в `development` при деплое.

### Cloud Function использует неправильный токен

**Проблема:** Функция напоминаний использует dev токен в production.

**Решение:** 
1. Проверьте переменные окружения в Cloud Function:
   ```bash
   gcloud functions describe sendCoachReminder --region=us-central1 --gen2
   ```
2. Передеплойте с правильным токеном:
   ```bash
   export BOT_TOKEN="production-token"
   ./deploy-reminder-function.sh
   ```

### Токены одинаковые, но хочу разделить

**Решение:** Создайте нового бота для dev через @BotFather и обновите `BOT_TOKEN_DEV`.

## Лучшие практики

1. **Используйте отдельные боты** для dev и production
2. **Не коммитьте токены** в git (они в .gitignore)
3. **Регулярно меняйте токены** через @BotFather
4. **Храните production токены** в безопасном месте (менеджер паролей)
5. **Проверяйте переменные** перед деплоем в production
6. **Логируйте окружение** при старте бота для отладки

## Миграция с единого токена

Если у вас был единый токен:

1. Создайте dev бота
2. Добавьте в `.env`:
   ```bash
   BOT_TOKEN_DEV=новый_dev_токен
   BOT_TOKEN=старый_production_токен
   NODE_ENV=development
   ```
3. Тестируйте на dev боте
4. Деплойте в production с production токенами

Готово! Теперь dev и production окружения разделены.

