import type { Timestamp } from '@google-cloud/firestore';

/**
 * Структура данных для клуба в Воронеже (и при необходимости в других городах):
 * клуб → корты → брони.
 * Свободные слоты вычисляются по кортам и броням (временные окна без броней).
 */

// ============ Имена коллекций Firestore ============

/** Коллекция клубов (документ = один клуб, например воронежский). */
export const CLUBS_COLLECTION = 'clubs';

/** Подколлекция кортов внутри клуба: clubs/{clubId}/courts/{courtId} */
export const COURTS_SUBCOLLECTION = 'courts';

/** Подколлекция броней внутри клуба: clubs/{clubId}/bookings/{bookingId} */
export const BOOKINGS_SUBCOLLECTION = 'bookings';

/** Подколлекция клиентов клуба: clubs/{clubId}/clients/{clientId} */
export const CLIENTS_SUBCOLLECTION = 'clients';

/** Коллекция резервов (бронирований) для клубов. */
export const RESERVATIONS_COLLECTION = 'voronezhReservations';

// ============ Типы бронирований ============

export type BookingType = 'one_time' | 'group' | 'regular' | 'tournament';

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  one_time: 'Разовая',
  group: 'Группа',
  regular: 'Регулярная',
  tournament: 'Турнир',
};

// ============ Клуб ============

/** Сегмент цен: интервал времени и цена за час (руб). */
export interface PricingSegment {
  startTime: string; // "6:00"
  endTime: string;   // "10:00"
  priceRub: number;
}

/** Цены по времени: будни и выходные. */
export interface ClubPricing {
  weekday?: PricingSegment[];
  weekend?: PricingSegment[];
}

export interface Club {
  id: string;
  name: string;
  city: string; // Название города на русском (Москва, Воронеж)
  /** Цена за 1 час (в рублях). Используется, если нет pricing или время не попало в сегмент. */
  pricePerHour?: number;
  /** Цены по интервалам времени (будни/выходные). */
  pricing?: ClubPricing;
  /** Время открытия клуба (HH:MM). */
  openingTime?: string;
  /** Время закрытия клуба (HH:MM). Занятие не должно заканчиваться позже. */
  closingTime?: string;
  /** Ссылка на Яндекс.Карты. */
  yandexMapsUrl?: string;
  /** Порядок кортов для отображения (опционально). */
  courtOrder?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ============ Корт ============

export interface Court {
  id: string;
  name: string;
  /** Порядок в списке кортов клуба (меньше = выше). */
  order?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============ Клиент клуба ============

export interface ClubClient {
  id: string;
  name: string;
  /** Контакт: телефон, Telegram, email. Может быть заполнен вручную в карточке клиента или из бота. */
  contact?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============ Бронь ============

export interface ClubBooking {
  id: string;
  /** ID корта в этом же клубе (документ из подколлекции courts). */
  courtId: string;
  type: BookingType;
  /** Время начала брони. */
  startTime: Timestamp;
  /** Время окончания брони. */
  endTime: Timestamp;
  /** Комментарий к брони. */
  comment: string;
  /**
   * Дата первого занятия в серии. Обязательно для type === 'regular' и 'group'.
   * В Firestore хранить как Timestamp (начало дня в UTC или локальной зоне).
   */
  firstSessionDate: Timestamp | null;
  /**
   * Дата последнего занятия в серии. Обязательно для type === 'regular' и 'group'.
   * В Firestore хранить как Timestamp (конец дня или начало последнего дня).
   */
  lastSessionDate: Timestamp | null;
  createdAt?: Date;
  updatedAt?: Date;
  /** Резерв по боту: hold (ожидание оплаты), confirmed (оплачено), canceled. */
  status?: 'hold' | 'confirmed' | 'canceled';
  /** ID в voronezhReservations (для связки с оплатой). */
  reservationId?: string;
  /** ID документа в подколлекции clubs/{clubId}/clients. */
  clientId?: string;
  /** ФИО клиента (для отображения). */
  clientName?: string;
}

// ============ Пути в Firestore ============

/** Путь к документу клуба. */
export function clubPath(clubId: string): string {
  return `${CLUBS_COLLECTION}/${clubId}`;
}

/** Путь к документу корта. */
export function courtPath(clubId: string, courtId: string): string {
  return `${CLUBS_COLLECTION}/${clubId}/${COURTS_SUBCOLLECTION}/${courtId}`;
}

/** Путь к документу брони. */
export function bookingPath(clubId: string, bookingId: string): string {
  return `${CLUBS_COLLECTION}/${clubId}/${BOOKINGS_SUBCOLLECTION}/${bookingId}`;
}

/** Путь к документу клиента клуба. */
export function clientPath(clubId: string, clientId: string): string {
  return `${CLUBS_COLLECTION}/${clubId}/${CLIENTS_SUBCOLLECTION}/${clientId}`;
}

// ============ Рекомендуемые составные индексы Firestore ============
//
// Для подколлекции bookings (clubs/{clubId}/bookings):
//
// 1. Запрос «все брони корта за период»:
//    courtId (Ascending), startTime (Ascending)
//
// 2. Запрос «все брони за день»:
//    startTime (Ascending), courtId (Ascending)
//
// Создать через Firebase Console → Firestore → Indexes или firestore.indexes.json.

// ============ Резерв (бронирование) для Воронежа ============

export type ReservationStatus = 'pending' | 'paid' | 'expired' | 'canceled';

export interface VoronezhReservation {
  id: string;
  userId: number;
  chatId: number;
  clubId: string;
  clubName: string;
  date: string; // YYYY-MM-DD
  slotStart: string; // HH:MM
  durationMinutes: number;
  price: number;
  status: ReservationStatus;
  /** Firestore Timestamp — до этого времени нужно оплатить (для pending). */
  expiresAt: Date | Timestamp;
  createdAt?: Date;
  paidAt?: Date;
  /** ID платежа в ЮKassa (для вебхука payment.succeeded). */
  yookassaPaymentId?: string;
  /** Телефон пользователя. */
  phone?: string;
  /** Имя пользователя для бронирования. */
  name?: string;
}
