// Entry point для Google Cloud Functions
// Экспортирует все функции проекта

export { telegramWebhook, playTodayBot } from './index';
export { slotsFetcher, fetchSlots } from './slots-fetcher';

