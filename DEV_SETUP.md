# Локальная разработка

Этот документ описывает, как запустить бота и все связанные сервисы локально для разработки.

## Быстрый старт

### 1. Установите зависимости

```bash
npm install
```

### 2. Настройте `.env` файл

Минимальная конфигурация для dev:

```env
# Telegram
BOT_TOKEN_DEV=your-dev-bot-token

# Google Cloud Storage
COACH_MEDIA_BUCKET=play-today-coach-media

# Опционально: URL локальной функции (по умолчанию http://localhost:8081)
VIDEO_UPLOAD_FUNCTION_URL=http://localhost:8081
```

### 3. Запустите dev-окружение

**Вариант А: Все в одном терминале**

```bash
chmod +x dev-start.sh
./dev-start.sh
```

Этот скрипт:
- ✅ Соберет TypeScript
- ✅ Запустит функцию загрузки видео на порту 8081
- ✅ Запустит Telegram бота

**Вариант Б: Раздельно в разных терминалах**

Терминал 1 - Upload Function:
```bash
npm run dev:upload:watch
```

Терминал 2 - Telegram Bot:
```bash
npm run dev:bot:watch
```

## Архитектура в dev-режиме

```
Telegram Bot (port: polling) ──HTTP POST──> Upload Function (port: 8081)
                                                      │
                                                      ↓
                                             Cloud Storage (GCS)
                                                      │
                                                      ↓
                                                  Firestore
```

## Как работает загрузка видео

1. **Пользователь загружает видео** в Telegram бот
2. **Бот** сохраняет временный URL `tg://video/{fileId}` в Firestore
3. **Бот** отправляет HTTP POST запрос на `http://localhost:8081` с данными о видео
4. **Upload Function** (работает локально):
   - Скачивает видео от Telegram
   - Загружает в Cloud Storage
   - Обновляет профиль в Firestore (заменяет temp URL на real URL)

## Доступные команды

### Разработка

```bash
# Запустить бота с auto-reload
npm run dev:bot:watch

# Запустить upload function с auto-reload
npm run dev:upload:watch

# Запустить все вместе
./dev-start.sh
```

### Сборка

```bash
# Собрать TypeScript
npm run build

# Собрать и запустить бота
npm run start
```

### Тестирование

```bash
# Запустить линтер
npm run lint

# Исправить проблемы линтера
npm run lint:fix
```

## Тестирование загрузки видео

1. Запустите dev-окружение: `./dev-start.sh`
2. Откройте бота в Telegram
3. Начните регистрацию тренера: `/start` → "Зарегистрироваться"
4. Заполните шаги 1-7
5. На шаге 8 загрузите видео

### Что смотреть в логах

**Успешная загрузка:**

```
[uploadMediaToStorage] Video detected, starting background upload
[createVideoUploadTask] Dev mode: sending HTTP request to http://localhost:8081
[createVideoUploadTask] Local function accepted the request
✅ Видео обрабатывается...
```

**В логах upload function:**

```
[uploadCoachVideo] Function invoked
[uploadCoachVideo] Processing video for user 123456, fileId: xxx
[uploadCoachVideo] Downloading video from Telegram...
[uploadCoachVideo] Download complete, total 12345678 bytes
[uploadCoachVideo] Uploading to GCS: coaches/123456/1234567890.mov
[uploadCoachVideo] Upload complete! Public URL: https://storage.googleapis.com/...
[uploadCoachVideo] Profile updated with final URL
```

## Отладка

### Upload function не отвечает

**Проблема:** `ECONNREFUSED 127.0.0.1:8081`

**Решение:**
1. Проверьте, что функция запущена: `lsof -i :8081`
2. Перезапустите: `npm run dev:upload`

### Видео не загружается в Storage

**Проблема:** `COACH_MEDIA_BUCKET environment variable not set`

**Решение:** Добавьте в `.env`:
```env
COACH_MEDIA_BUCKET=play-today-coach-media
```

### Ошибка при скачивании от Telegram

**Проблема:** `Failed to download file from Telegram`

**Решение:** Проверьте `BOT_TOKEN_DEV` в `.env`

## Production деплой

Когда готовы к production:

1. **Задеплойте upload function:**
```bash
./deploy-video-upload-function.sh
```

2. **Настройте Cloud Tasks:**
```bash
./setup-video-upload-queue.sh
```

3. **Обновите `.env`** с production значениями:
```env
VIDEO_UPLOAD_FUNCTION_URL=https://europe-west1-xxx.cloudfunctions.net/uploadCoachVideo
GCP_PROJECT=your-project-id
CLOUD_TASKS_QUEUE=video-upload-queue
```

4. **Задеплойте бота:**
```bash
npm run deploy
```

## Структура проекта

```
src/
├── index.ts                    # Основной код бота
├── functions.ts                # Экспорт всех Cloud Functions
├── functions/
│   ├── upload-coach-video.ts  # Функция загрузки видео
│   └── slots-fetcher/         # Функции для слотов
└── constants/
    └── user-texts.ts          # Тексты сообщений

scripts:
├── dev-start.sh               # Запуск dev-окружения
├── deploy-video-upload-function.sh  # Деплой upload function
└── setup-video-upload-queue.sh      # Настройка Cloud Tasks
```

## FAQ

**Q: Нужно ли настраивать Cloud Tasks для локальной разработки?**  
A: Нет! В dev-режиме используется простой HTTP запрос к localhost.

**Q: Можно ли использовать production бота для тестирования?**  
A: Лучше использовать отдельного dev-бота (BOT_TOKEN_DEV) чтобы не мешать пользователям.

**Q: Где хранятся загруженные файлы?**  
A: В Google Cloud Storage в bucket `play-today-coach-media`.

**Q: Сколько времени занимает загрузка видео?**  
A: Зависит от размера. Обычно 5-30 секунд для видео до 50 МБ.

