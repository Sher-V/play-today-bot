// Entry point для Google Cloud Functions
// Экспортирует все функции проекта

export { telegramWebhook, playTodayBot } from './index';
export { slotsFetcher, fetchSlots } from './functions/slots-fetcher/slots-fetcher';
export { broadcastMessage } from './functions/broadcast-message';

