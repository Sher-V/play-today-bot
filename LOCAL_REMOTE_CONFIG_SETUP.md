# Настройка Remote Config для локальной разработки

## Проблема

При локальной разработке возникает ошибка:
```
The firebaseremoteconfig.googleapis.com API requires a quota project, which is not set by default.
```

## Решение

### Вариант 1: Настройка через gcloud (рекомендуется)

1. Установите Google Cloud SDK, если еще не установлен:
   ```bash
   # macOS
   brew install google-cloud-sdk
   ```

2. Авторизуйтесь:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

3. Установите проект и quota project:
   ```bash
   # Замените YOUR_PROJECT_ID на ID вашего Firebase проекта
   gcloud config set project YOUR_PROJECT_ID
   gcloud auth application-default set-quota-project YOUR_PROJECT_ID
   ```

4. Проверьте настройки:
   ```bash
   gcloud config get-value project
   gcloud auth application-default print-access-token
   ```

### Вариант 2: Через переменные окружения

1. Добавьте в `.env` файл:
   ```
   GOOGLE_CLOUD_PROJECT=your-project-id
   ```

2. Убедитесь, что `.env` загружается (в коде уже есть `import 'dotenv/config'`)

### Вариант 3: Через Application Default Credentials файл

1. Найдите файл с credentials (обычно `~/.config/gcloud/application_default_credentials.json`)

2. Добавьте или обновите поле `quota_project_id`:
   ```json
   {
     "quota_project_id": "your-project-id",
     ...
   }
   ```

## Проверка

После настройки перезапустите бота и проверьте логи. Должно появиться:
```
[remote-config] Firebase Admin initialized with project: your-project-id
[remote-config] Template fetched successfully
[remote-config] Available parameters: show_find_coach
```

## Альтернатива: Использование Firestore для локальной разработки

Если настройка quota project вызывает проблемы, можно временно использовать Firestore для feature flags в локальной разработке. Для этого нужно изменить код в `src/utils/remote-config.ts` для использования Firestore в dev режиме.

## Полезные ссылки

- [Troubleshooting Application Default Credentials](https://cloud.google.com/docs/authentication/adc-troubleshooting/user-creds)
- [Setting up quota project](https://cloud.google.com/docs/authentication/application-default-credentials#setting_the_quota_project)
