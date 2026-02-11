// Entry point для Google Cloud Functions
// Экспортирует все функции проекта

export { telegramWebhook, playTodayBot } from './index';
export { slotsFetcher, fetchSlots } from './functions/slots-fetcher/slots-fetcher';
export { uploadCoachMedia } from './functions/upload-coach-media';

// Для sendCoachReminder используется functions-framework напрямую в файле
import './functions/send-coach-reminder';
// Для cancelExpiredReservations используется functions-framework напрямую в файле
import './functions/cancel-expired-reservations';