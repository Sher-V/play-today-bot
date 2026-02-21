/**
 * Вебхук ЮKassa: получает уведомления о платежах (payment.succeeded).
 * В личном кабинете ЮKassa укажите URL этой функции и включите событие payment.succeeded.
 * Документация: https://yookassa.ru/developers/using-api/webhooks
 */

import 'dotenv/config';
import * as functions from '@google-cloud/functions-framework';
import { Firestore } from '@google-cloud/firestore';
import {
  RESERVATIONS_COLLECTION,
  CLUBS_COLLECTION,
  BOOKINGS_SUBCOLLECTION,
  type VoronezhReservation,
} from '../types/club-slots';
import { USER_TEXTS } from '../constants/user-texts';
import { getBotToken } from '../utils/config-utils';
import { formatDateShort } from '../utils/date-utils';

const firestore = new Firestore();

interface YooKassaNotification {
  type?: string;
  event?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: { reservation_id?: string };
  };
}

function buildPaidMessage(reservation: VoronezhReservation): string {
  const [startH, startM] = (reservation.slotStart || '0:0').split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = startMinutes + (reservation.durationMinutes || 0);
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const hoursStr = reservation.durationMinutes === 60 ? '1 час' : `${(reservation.durationMinutes || 0) / 60} ч`;
  const nameLine = reservation.name?.trim() ? `👤 ${reservation.name.trim()}\n` : '';
  return (
    USER_TEXTS.BOOK_PAID_HEADER + '\n\n' +
    nameLine +
    USER_TEXTS.BOOK_PAID_CLUB(reservation.clubName) + '\n' +
    USER_TEXTS.BOOK_PAID_TIME(reservation.date ? formatDateShort(reservation.date) : '', reservation.slotStart!, endTime, hoursStr) + '\n' +
    USER_TEXTS.BOOK_PAID_AMOUNT(reservation.price) + '\n\n' +
    USER_TEXTS.BOOK_PAID_FOOTER + '\n\n' +
    USER_TEXTS.BOOK_PAID_FOOTER_HINT
  );
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] }
): Promise<boolean> {
  const token = getBotToken();
  if (!token) {
    console.error('[yookassa-webhook] Bot token not set (BOT_TOKEN_DEV in development, BOT_TOKEN in production)');
    return false;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[yookassa-webhook] Telegram sendMessage failed', res.status, await res.text());
    return false;
  }
  return true;
}

functions.http('yookassaWebhook', async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const notification = body as YooKassaNotification;

    // Лог каждого входящего POST (для отладки: доходит ли запрос от ЮKassa)
    const event = notification?.event;
    const obj = notification?.object;
    const meta = obj?.metadata;
    const reservationId = meta?.reservation_id;
    console.log('[yookassa-webhook] POST received', { event, paymentId: obj?.id, reservationId });

    if (notification.event !== 'payment.succeeded' || !reservationId) {
      if (event || obj?.id) {
        console.log('[yookassa-webhook] Skipped (wrong event or no reservation_id in metadata)');
      }
      res.status(200).send('OK');
      return;
    }

    const doc = await firestore.collection(RESERVATIONS_COLLECTION).doc(reservationId).get();
    if (!doc.exists) {
      console.warn('[yookassa-webhook] Reservation not found:', reservationId);
      res.status(200).send('OK');
      return;
    }

    const reservation = doc.data() as VoronezhReservation;
    if (reservation.status !== 'pending') {
      console.log('[yookassa-webhook] Reservation already processed:', reservationId, reservation.status);
      res.status(200).send('OK');
      return;
    }

    await firestore.collection(RESERVATIONS_COLLECTION).doc(reservationId).update({
      status: 'paid',
      paidAt: new Date(),
    });

    try {
      await firestore
        .collection(CLUBS_COLLECTION)
        .doc(reservation.clubId)
        .collection(BOOKINGS_SUBCOLLECTION)
        .doc(reservationId)
        .update({ status: 'confirmed' });
    } catch (e) {
      console.warn('[yookassa-webhook] Could not update club booking:', e);
    }

    const text = buildPaidMessage(reservation);
    const sent = await sendTelegramMessage(reservation.chatId, text, {
      inline_keyboard: [[{ text: '📅 Мои бронирования', callback_data: 'my_bookings' }]],
    });
    if (sent) {
      console.log('[yookassa-webhook] Paid notification sent for reservation', reservationId);
    } else {
      console.error('[yookassa-webhook] Failed to send Telegram message for reservation', reservationId);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[yookassa-webhook] Error:', error);
    res.status(500).send('Internal Server Error');
  }
});
