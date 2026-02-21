# Админская документация

## Структура данных клуба и слотов (Firestore)

Используется для клуба в Воронеже (и при необходимости в других городах). Свободные слоты вычисляются по кортам и броням: временные окна без броней считаются свободными.

### Иерархия коллекций

```
clubs                          — коллекция клубов
  {clubId}                     — документ клуба
    courts                     — подколлекция кортов
      {courtId}                 — документ корта
    bookings                   — подколлекция броней
      {bookingId}               — документ брони
```

### Документ клуба (Club)

Путь: `clubs/{clubId}`

| Поле        | Тип     | Описание                                      |
|-------------|---------|-----------------------------------------------|
| id          | string  | Идентификатор клуба                           |
| name        | string  | Название клуба                                |
| city        | string  | Название города на русском (например `Воронеж`, `Москва`) |
| courtOrder  | string[]| (опц.) Порядок кортов для отображения         |
| createdAt   | Date    | (опц.) Дата создания                          |
| updatedAt   | Date    | (опц.) Дата обновления                        |

### Документ корта (Court)

Путь: `clubs/{clubId}/courts/{courtId}`

| Поле      | Тип    | Описание                                      |
|-----------|--------|-----------------------------------------------|
| id        | string | Идентификатор корта                            |
| name      | string | Название корта                                 |
| order     | number | (опц.) Порядок в списке кортов (меньше = выше) |
| createdAt | Date   | (опц.) Дата создания                           |
| updatedAt | Date   | (опц.) Дата обновления                         |

### Документ брони (ClubBooking)

Путь: `clubs/{clubId}/bookings/{bookingId}`

| Поле             | Тип       | Описание |
|-------------------|------------|----------|
| id                | string     | Идентификатор брони |
| courtId           | string     | ID корта в этом клубе (документ из подколлекции `courts`) |
| type              | BookingType| Тип брони: см. ниже |
| startTime         | Timestamp  | Время начала брони |
| endTime           | Timestamp  | Время окончания брони |
| comment           | string     | Комментарий к брони |
| firstSessionDate  | Timestamp \| null | Дата первого занятия в серии. Для типов `regular` и `group` — обязательно |
| lastSessionDate   | Timestamp \| null | Дата последнего занятия в серии. Для типов `regular` и `group` — обязательно |
| createdAt         | Date       | (опц.) Дата создания |
| updatedAt         | Date       | (опц.) Дата обновления |
| status            | string     | (опц.) Статус брони из бота: см. «Статусы брони» ниже |
| reservationId     | string     | (опц.) ID документа в коллекции `voronezhReservations` (связка с оплатой) |

### Статусы брони (status)

Используются для броней, созданных ботом (резерв по нажатию «Оплатить»):

| Значение    | Описание |
|-------------|----------|
| hold        | Слот зарезервирован, ожидается оплата. Бронь создаётся при нажатии «Оплатить»; слот перестаёт отображаться как свободный. |
| confirmed   | Оплата прошла (по вебхуку ЮKassa). Бронь подтверждена. |
| canceled    | Резерв отменён (истёк срок оплаты или отмена). Слот снова считается свободным. |

Логика: при нажатии «Оплатить» в `clubs/{clubId}/bookings` создаётся документ со `status: 'hold'` и `reservationId` = id резерва в `voronezhReservations`. При успешной оплате (вебхук) статус брони меняют на `confirmed`; при истечении резерва или отмене — на `canceled` (или документ удаляют). Брони со статусом `hold` и `confirmed` участвуют в расчёте занятых слотов (слот не показывается свободным).

### Типы бронирований (BookingType)

| Значение   | Подпись     | Примечание |
|------------|-------------|------------|
| one_time   | Разовая     | Одно занятие, firstSessionDate/lastSessionDate можно не заполнять |
| group      | Группа      | Серия занятий: заполнять firstSessionDate и lastSessionDate |
| regular    | Регулярная  | Серия занятий: заполнять firstSessionDate и lastSessionDate |
| tournament | Турнир      | Турнир, firstSessionDate/lastSessionDate по необходимости |

Для типов `regular` и `group` в Firestore хранятся даты первого и последнего занятия серии (как `Timestamp`).

### Составные индексы Firestore

Для подколлекции `bookings` (`clubs/{clubId}/bookings`) рекомендуется создать индексы:

1. **Все брони корта за период**  
   - `courtId` (Ascending), `startTime` (Ascending)

2. **Все брони за день**  
   - `startTime` (Ascending), `courtId` (Ascending)

Создание: Firebase Console → Firestore → Indexes или через `firestore.indexes.json`.

### Код

Типы и константы: `src/types/club-slots.ts`.

### ЮKassa (тестовая)

Для тестовых платежей настройте в `.env`:

- **YOOKASSA_SHOP_ID** — идентификатор магазина из [личного кабинета ЮKassa](https://yookassa.ru/my) (Интеграция → API ключи). Для теста создайте демо-магазин.
- **YOOKASSA_SECRET_KEY** — секретный ключ тестового магазина (формат `test_...`).

Скопируйте переменные из `.env.example` в `.env` и добавьте `YOOKASSA_SHOP_ID` из личного кабинета.

#### Вебхук ЮKassa (уведомление об успешной оплате)

Чтобы бот сразу писал пользователю «Оплата прошла успешно, поздравляем!» после оплаты (без опроса API), настройте HTTP-уведомления в [личном кабинете ЮKassa](https://yookassa.ru/my/http-notifications-settings):

1. Разверните Cloud Function `yookassaWebhook` (файл `src/functions/yookassa-webhook.ts`).
2. Укажите в настройках уведомлений ЮKassa URL функции, например: `https://REGION-PROJECT.cloudfunctions.net/yookassaWebhook`.
3. Включите событие **payment.succeeded**.

Вебхук при получении `payment.succeeded` обновляет резерв на `paid`, бронь в клубе на `confirmed` и отправляет пользователю сообщение в Telegram.

#### Локальный запуск вебхука (для теста оплаты без деплоя)

Чтобы ЮKassa вызывала вебхук на твою машину:

1. **Запусти вебхук локально** (в отдельном терминале):
   ```bash
   npm run dev:yookassa
   ```
   Сервис будет слушать порт **8083** (`http://localhost:8083`).

2. **Пробрось порт в интернет через ngrok** (нужен [ngrok](https://ngrok.com)):
   ```bash
   ngrok http 8083
   ```
   В выводе будет публичный URL, например `https://abc123.ngrok.io`.

3. **В личном кабинете ЮKassa** → [HTTP-уведомления](https://yookassa.ru/my/http-notifications-settings) укажи URL: `https://ТВОЙ_НОМЕР.ngrok.io` (без пути — у functions-framework один обработчик на `/`). Включи событие **payment.succeeded**.

4. Запусти бота (`npm run dev:bot`), сделай тестовую оплату. После успешной оплаты ЮKassa отправит POST на ngrok → твой локальный вебхук обновит резерв и отправит сообщение в Telegram.

После теста в ЮKassa можно вернуть URL на задеплоенную Cloud Function.

### Редирект после оплаты и отмена по таймауту

- **BOT_USERNAME** — переменная окружения (например `play_today_bot`) для формирования ссылки возврата после оплаты ЮKassa. После успешной оплаты пользователь переходит по ссылке `https://t.me/{BOT_USERNAME}?start=paid_{reservationId}` и видит сообщение с номером корта и датой/временем; в тексте указано, что бронирования можно посмотреть в *Ещё → Мои бронирования*.
- **Неоплаченные брони (5 минут)** — автоматическая отмена истёкших резервов выполняется через Cloud Function `cancelExpiredReservations` (файл `src/functions/cancel-expired-reservations.ts`). Функция переводит резервы со статусом `pending` и истёкшим `expiresAt` в статус `canceled` и освобождает соответствующие слоты в клубах.

#### Настройка Cloud Scheduler для автоматической отмены

Для автоматической отмены неоплаченных броней через 5 минут необходимо настроить Cloud Scheduler, который будет вызывать функцию `cancelExpiredReservations` каждые 1–2 минуты:

```bash
# Создание задачи в Cloud Scheduler (каждые 2 минуты)
gcloud scheduler jobs create http cancel-expired-reservations \
  --location=europe-west1 \
  --schedule="*/2 * * * *" \
  --uri="https://REGION-PROJECT.cloudfunctions.net/cancelExpiredReservations" \
  --http-method=POST \
  --time-zone="Europe/Moscow"
```

Где:
- `REGION-PROJECT` — регион и ID проекта (например `europe-west1-play-today-bot`)
- Расписание `*/2 * * * *` означает запуск каждые 2 минуты (можно изменить на `*/1 * * * *` для запуска каждую минуту)

После деплоя функции `cancelExpiredReservations` она будет доступна по HTTP endpoint и может быть вызвана Cloud Scheduler.
