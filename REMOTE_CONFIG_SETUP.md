# Настройка Firebase Remote Config для кнопки "Найти тренера"

## Описание

Кнопка "👤 Найти тренера" в главном меню управляется через Firebase Remote Config с помощью флага `show_find_coach`.

## Настройка в Firebase Console

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите ваш проект
3. Перейдите в раздел **Remote Config** (или **Build** → **Remote Config**)
4. Нажмите **"Добавить параметр"** или **"Add parameter"**
5. Создайте параметр:
   - **Ключ параметра**: `show_find_coach`
   - **Значение по умолчанию**: `false` (кнопка скрыта) или `true` (кнопка видна)
   - **Тип данных**: Boolean (рекомендуется) или String
6. Нажмите **"Опубликовать изменения"** или **"Publish changes"**

## Значения параметра

Код поддерживает следующие форматы значений:
- **Boolean**: `true` или `false` (рекомендуется)
- **String**: `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"` (регистр не важен)
- **Number**: `1` (true) или `0` (false)

Для отображения кнопки установите значение `true` (boolean) или `"true"` (string).

## Настройка Quota Project (важно!)

Для работы Remote Config API требуется настроить quota project. Это обычно делается автоматически в Google Cloud Functions, но если возникает ошибка:

### В Google Cloud Functions (автоматически)

В Cloud Functions quota project настраивается автоматически через переменную окружения `GOOGLE_CLOUD_PROJECT`. Убедитесь, что она установлена при деплое:

```bash
gcloud functions deploy ... --set-env-vars GOOGLE_CLOUD_PROJECT=your-project-id
```

### Для локальной разработки

1. Установите переменную окружения:
   ```bash
   export GOOGLE_CLOUD_PROJECT=your-project-id
   ```

2. Или добавьте в `.env` файл:
   ```
   GOOGLE_CLOUD_PROJECT=your-project-id
   ```

3. Или используйте Application Default Credentials:
   ```bash
   gcloud auth application-default login
   gcloud config set project your-project-id
   ```

### Альтернатива: настройка через Google Cloud Console

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите ваш проект
3. Перейдите в **APIs & Services** → **Enabled APIs**
4. Убедитесь, что включен **Firebase Remote Config API**
5. Перейдите в **APIs & Services** → **Quotas**
6. Убедитесь, что quota project установлен для вашего проекта

## Кэширование

Значения Remote Config кэшируются на 5 минут для оптимизации производительности. 
При необходимости можно принудительно очистить кэш, вызвав функцию `clearRemoteConfigCache()`.

## Локальная разработка

В локальной среде, если Remote Config недоступен или quota project не настроен, функция вернет значение по умолчанию (`false`), 
и кнопка не будет отображаться. Это безопасное поведение по умолчанию.

## Использование в коде

```typescript
import { getRemoteConfigValue } from './utils/remote-config';

// Получить значение флага
const showFindCoach = await getRemoteConfigValue('show_find_coach', false);

if (showFindCoach) {
  // Показать кнопку "Найти тренера"
}
```

## Примечания

- Изменения в Remote Config применяются после публикации и обновления кэша (максимум 5 минут)
- В случае ошибки получения значения из Remote Config используется значение по умолчанию (`false`)
- Remote Config - специализированный инструмент для feature flags с встроенной оптимизацией
- В Google Cloud Functions quota project обычно настраивается автоматически
