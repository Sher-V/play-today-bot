# Локальный запуск slots-fetcher

## Быстрый старт

1. **Соберите проект:**
   ```bash
   npm run build
   ```

2. **Запустите функцию локально:**
   ```bash
   npm run dev:slots
   ```
   
   Или с автоперезагрузкой при изменении файлов:
   ```bash
   npm run dev:slots:watch
   ```

   Функция будет доступна на `http://localhost:8080`

## Примеры запросов

### 1. Собрать слоты для тенниса (все дни)
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"sport":"tennis"}'
```

### 2. Собрать слоты для падела (все дни)
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"sport":"padel"}'
```

### 3. Собрать слоты для падела - ближайшая неделя (дни 0-7)
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"sport":"padel","startDay":0,"endDay":7}'
```

### 4. Собрать слоты для падела - вторая неделя (дни 7-14)
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"sport":"padel","startDay":7,"endDay":14}'
```

### 5. Собрать слоты для обоих видов спорта (обратная совместимость)
```bash
curl -X POST http://localhost:8080
```

### 6. Получить данные из хранилища (GET запрос)
```bash
# Для тенниса на конкретную дату
curl "http://localhost:8080?sport=tennis&date=2025-12-21"

# Для падела на конкретную дату
curl "http://localhost:8080?sport=padel&date=2025-12-21"
```

## Параметры запроса

### POST запросы

**Параметры в body (JSON):**
- `sport` (опционально): `"tennis"` или `"padel"` - тип спорта
- `startDay` (опционально): число - начальный день (0 = сегодня)
- `endDay` (опционально): число - конечный день (исключительно)

**Параметры в query string:**
- `sport`: `tennis` или `padel`
- `startDay`: число
- `endDay`: число

Пример с query параметрами:
```bash
curl -X POST "http://localhost:8080?sport=padel&startDay=0&endDay=7" \
  -H "Content-Type: application/json"
```

### GET запросы

**Обязательные параметры:**
- `sport`: `tennis` или `padel`
- `date`: дата в формате `YYYY-MM-DD`

## Переменные окружения

Убедитесь, что в `.env` файле настроены:
- `GCS_BUCKET` - имя bucket в Cloud Storage (опционально, если не указан - используется локальное хранилище)

## Локальное хранилище

Если `GCS_BUCKET` не указан, данные сохраняются в локальные файлы:
- `actual-tennis-slots-YYYY-MM-DD.json`
- `actual-padel-slots-YYYY-MM-DD.json`

## Отладка

Для просмотра логов в реальном времени используйте:
```bash
npm run dev:slots:watch
```

Логи будут показывать:
- Какие площадки обрабатываются
- Количество слотов для каждой даты
- Куда сохраняются данные (локально или в Cloud Storage)

