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
