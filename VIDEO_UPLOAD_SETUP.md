# Настройка фоновой загрузки видео тренеров

Этот документ описывает процесс настройки системы фоновой загрузки видео тренеров через Cloud Functions и Cloud Tasks.

## Архитектура

```
Telegram Bot → Cloud Tasks Queue → Cloud Function → Cloud Storage
                                         ↓
                                    Firestore
```

1. **Бот** получает видео от тренера
2. Создает **Cloud Task** с информацией о видео
3. **Cloud Function** обрабатывает задачу:
   - Скачивает видео от Telegram
   - Загружает в Cloud Storage
   - Обновляет профиль в Firestore

## Преимущества

- ✅ **Надежность**: Задачи не теряются при рестарте бота
- ✅ **Масштабируемость**: Автоматическое масштабирование Cloud Functions
- ✅ **Retry логика**: Автоматические повторы при ошибках
- ✅ **Мониторинг**: Логи в Cloud Logging
- ✅ **Независимость**: Не нагружает основной процесс бота

## Установка

### 1. Установить зависимости

```bash
npm install
```

Убедитесь, что `@google-cloud/tasks` добавлен в `package.json`.

### 2. Задеплоить Cloud Function

```bash
chmod +x deploy-video-upload-function.sh
./deploy-video-upload-function.sh
```

Эта команда:
- Соберет TypeScript код
- Задеплоит `uploadCoachVideo` функцию в Cloud Functions
- Выведет URL функции

### 3. Создать Cloud Tasks очередь

```bash
chmod +x setup-video-upload-queue.sh
./setup-video-upload-queue.sh
```

Эта команда:
- Создаст очередь `video-upload-queue`
- Настроит права доступа
- Выведет переменные для `.env`

### 4. Настроить переменные окружения

Добавьте в `.env` файл:

```env
# Cloud Function URL (из шага 2)
VIDEO_UPLOAD_FUNCTION_URL=https://europe-west1-your-project.cloudfunctions.net/uploadCoachVideo

# Cloud Tasks настройки (из шага 3)
CLOUD_TASKS_LOCATION=europe-west1
CLOUD_TASKS_QUEUE=video-upload-queue
GCP_PROJECT=your-project-id

# Bucket для медиа (уже должен быть создан)
COACH_MEDIA_BUCKET=play-today-coach-media
```

### 5. Перезапустить бота

```bash
npm run dev:watch
```

или задеплоить в production:

```bash
npm run deploy
```

## Мониторинг

### Просмотр задач в очереди

```bash
gcloud tasks queues describe video-upload-queue --location=europe-west1
```

### Логи Cloud Function

```bash
gcloud functions logs read uploadCoachVideo \
  --region=europe-west1 \
  --gen2 \
  --limit=50
```

### Логи Cloud Tasks

В Google Cloud Console:
1. Перейдите в Cloud Tasks
2. Выберите очередь `video-upload-queue`
3. Смотрите статус задач

## Тестирование

### 1. Локальное тестирование бота

```bash
npm run dev:watch
```

### 2. Отправить видео через Telegram

1. Откройте бота в Telegram
2. Начните регистрацию тренера
3. Загрузите видео на шаге 8
4. Проверьте логи:
   - Бот создал задачу: `[createVideoUploadTask] Task created`
   - Function получила задачу: `[uploadCoachVideo] Function invoked`
   - Видео загружено: `[uploadCoachVideo] Upload complete!`

### 3. Проверить результат

```bash
# Проверить файлы в bucket
gsutil ls gs://play-today-coach-media/coaches/

# Проверить профиль в Firestore
gcloud firestore documents get users/{userId}
```

## Troubleshooting

### Задача не создается

**Проблема**: `[createVideoUploadTask] Missing configuration`

**Решение**: Проверьте переменные в `.env`:
- `GCP_PROJECT`
- `VIDEO_UPLOAD_FUNCTION_URL`

### Function возвращает 403 Forbidden

**Проблема**: Cloud Tasks не может вызвать функцию

**Решение**: Запустите снова:
```bash
./setup-video-upload-queue.sh
```

### Видео не появляется в Storage

**Проблема**: Ошибка при загрузке

**Решение**: Проверьте логи:
```bash
gcloud functions logs read uploadCoachVideo --region=europe-west1 --gen2 --limit=20
```

### Задачи накапливаются в очереди

**Проблема**: Function не успевает обрабатывать

**Решение**: Увеличьте max-concurrent-dispatches:
```bash
gcloud tasks queues update video-upload-queue \
  --location=europe-west1 \
  --max-concurrent-dispatches=20
```

## Стоимость

**Cloud Functions**:
- Первые 2 млн вызовов бесплатно
- ~$0.40 за 1 млн вызовов после этого

**Cloud Tasks**:
- Первые 1 млн операций бесплатно
- $0.40 за 1 млн операций после этого

**Cloud Storage**:
- Стандартное хранение: ~$0.02/ГБ/месяц

**Итого**: Для ~1000 видео/месяц ≈ $1-2/месяц

## Дальнейшие улучшения

1. **Уведомления**: Отправлять сообщение тренеру когда видео обработано
2. **Сжатие**: Сжимать видео перед загрузкой
3. **Превью**: Генерировать превью для видео
4. **CDN**: Использовать Cloud CDN для быстрой раздачи


