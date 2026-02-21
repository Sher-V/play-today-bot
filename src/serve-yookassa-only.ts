/**
 * Точка входа только для локального запуска вебхука ЮKassa.
 * Не импортирует index (бот), чтобы не запускать два polling при dev:yookassa + dev:bot.
 */
import './functions/yookassa-webhook';
