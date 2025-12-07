-- Создание таблицы button_clicks вручную через BigQuery Console
-- Выполни этот запрос в BigQuery Console (выбери локацию europe-west1)

CREATE TABLE IF NOT EXISTS `play-today-479819.telegram_bot_analytics.button_clicks` (
  timestamp TIMESTAMP NOT NULL,
  userId INT64 NOT NULL,
  userName STRING,
  chatId INT64 NOT NULL,
  buttonType STRING NOT NULL,
  buttonId STRING NOT NULL,
  buttonLabel STRING,
  messageId INT64,
  context JSON,
  sessionId STRING
)
OPTIONS(
  description='Telegram bot button click events'
);

