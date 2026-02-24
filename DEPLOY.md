# Деплой: dev и prod

## Поведение

| Ветка    | GitHub Environment | Куда деплоится |
|----------|--------------------|----------------|
| `dev`    | **dev**            | Dev Firebase/GCP проект, dev-бот |
| `master` / `main` | **prod** | Prod Firebase/GCP проект, prod-бот |

- **Пуш в `dev`** → деплой только в dev-проект (dev-бот, dev Firestore/Storage и т.д.).
- **Пуш в `master`/`main`** → деплой только в prod-проект (prod-бот, prod данные).

Данные dev и prod полностью разделены: у каждого окружения свои секреты (свой `GCP_PROJECT_ID`, свой `BOT_TOKEN` и т.д.), поэтому прод не использует данные дева и наоборот.

## Настройка GitHub Environments

1. Репозиторий → **Settings** → **Environments**.
2. Создайте два окружения: **dev** и **prod**.
3. В каждом окружении добавьте **одни и те же имена секретов**, но со значениями для этого проекта:

### Секреты (в обоих окружениях — свои значения)

| Secret | Описание |
|--------|----------|
| `GCP_SERVICE_ACCOUNT_KEY` | JSON ключ сервисного аккаунта (dev — для dev-проекта, prod — для prod) |
| `GCP_PROJECT_ID` | ID Firebase/GCP проекта (dev или prod) |
| `BOT_TOKEN` | Токен бота Telegram (dev-бот или prod-бот) |
| `COACH_MEDIA_BUCKET` | Имя бакета для медиа тренеров (опционально) |
| `CLOUD_TASKS_QUEUE` | Имя очереди Cloud Tasks (опционально) |
| `USE_BIGQUERY` | Включить BigQuery (опционально) |
| `BIGQUERY_DATASET` | Датасет BigQuery (опционально) |
| `BIGQUERY_TABLE` | Таблица BigQuery (опционально) |
| `YOOKASSA_SHOP_ID` | Shop ID ЮKassa (опционально) |
| `YOOKASSA_SECRET_KEY` | Секретный ключ ЮKassa (опционально) |

В **dev** подставляйте значения от dev-проекта и dev-бота, в **prod** — от prod-проекта и prod-бота.

## Workflow

Файл: `.github/workflows/deploy.yml`

- Срабатывает на `push` в ветки `dev`, `master`, `main`.
- Для каждого запуска выбирается окружение по ветке (`dev` → environment `dev`, `master`/`main` → environment `prod`).
- Все шаги используют секреты выбранного окружения, поэтому деплой идёт в нужный проект и с нужным ботом без пересечения с другим окружением.

После деплоя не забудьте выставить webhook для бота на URL соответствующей Cloud Function (в summary workflow будет команда с подстановкой URL).
