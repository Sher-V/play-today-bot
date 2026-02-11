// Загрузка переменных окружения (должно быть первым импортом)
import 'dotenv/config';
import * as functions from '@google-cloud/functions-framework';
import { Firestore } from '@google-cloud/firestore';
import {
  RESERVATIONS_COLLECTION,
  CLUBS_COLLECTION,
  BOOKINGS_SUBCOLLECTION,
  type VoronezhReservation,
} from '../types/club-slots';

// Инициализация Firestore
const firestore = new Firestore();

/**
 * Cloud Function для отмены неоплаченных броней с истёкшим сроком оплаты (5 минут).
 * Вызывается по расписанию через Cloud Scheduler (рекомендуется каждые 1-2 минуты).
 * 
 * Переводит резервы со статусом 'pending' и истёкшим expiresAt в статус 'canceled'
 * и освобождает соответствующие слоты в клубах (обновляет статус брони в clubs/{clubId}/bookings).
 */
functions.http('cancelExpiredReservations', async (req, res) => {
  console.log('[cancelExpiredReservations] Function invoked');

  try {
    const now = Date.now();
    let canceledCount = 0;
    let errorCount = 0;

    // Получаем все резервы со статусом 'pending'
    const snapshot = await firestore
      .collection(RESERVATIONS_COLLECTION)
      .where('status', '==', 'pending')
      .get();

    console.log(`[cancelExpiredReservations] Found ${snapshot.docs.length} pending reservations`);

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data() as VoronezhReservation;
        const expiresAt = data.expiresAt;
        
        // Парсим expiresAt (может быть Timestamp или объект с _seconds)
        const expiresMs = expiresAt && typeof (expiresAt as { toDate?: () => Date }).toDate === 'function'
          ? (expiresAt as { toDate: () => Date }).toDate().getTime()
          : typeof (expiresAt as unknown as { _seconds?: number })?._seconds === 'number'
            ? (expiresAt as unknown as { _seconds: number })._seconds * 1000
            : 0;

        // Если срок истёк
        if (expiresMs > 0 && expiresMs < now) {
          const reservationId = doc.id;
          console.log(`[cancelExpiredReservations] Canceling expired reservation ${reservationId} (expired at ${new Date(expiresMs).toISOString()})`);

          // Обновляем статус резерва на 'canceled'
          await firestore.collection(RESERVATIONS_COLLECTION).doc(reservationId).update({ 
            status: 'canceled' 
          });

          // Обновляем статус брони в клубе (освобождаем слот)
          try {
            await firestore
              .collection(CLUBS_COLLECTION)
              .doc(data.clubId)
              .collection(BOOKINGS_SUBCOLLECTION)
              .doc(reservationId)
              .update({ status: 'canceled' });
            
            console.log(`[cancelExpiredReservations] Updated club booking ${reservationId} in club ${data.clubId}`);
          } catch (e) {
            // Бронь в клубе может не существовать (например, если была удалена)
            console.warn(`[cancelExpiredReservations] Could not update club booking ${reservationId}:`, e);
          }

          canceledCount++;
        }
      } catch (error) {
        console.error(`[cancelExpiredReservations] Error processing reservation ${doc.id}:`, error);
        errorCount++;
      }
    }

    const result = {
      success: true,
      totalPending: snapshot.docs.length,
      canceled: canceledCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    };

    console.log(`[cancelExpiredReservations] Completed: ${JSON.stringify(result)}`);
    res.status(200).json(result);
  } catch (error) {
    console.error('[cancelExpiredReservations] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});
