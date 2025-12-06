#!/bin/bash

# Play Today Bot - Deploy Script for Google Cloud Functions
# =========================================================

set -e

# Загружаем .env если есть
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Проверяем наличие BOT_TOKEN
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Ошибка: BOT_TOKEN не установлен"
    echo "Создай .env файл с BOT_TOKEN=твой_токен"
    echo "Или выполни: export BOT_TOKEN='твой_токен_бота'"
    exit 1
fi

# Проверяем gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "❌ Ошибка: gcloud CLI не установлен"
    echo "Установи: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Проверяем авторизацию в gcloud
if ! gcloud auth print-access-token &> /dev/null; then
    echo "❌ Ошибка: Не авторизован в gcloud"
    echo "Выполни: gcloud auth login"
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="europe-west1"
FUNCTION_NAME="playTodayBot"
BUCKET_NAME="${PROJECT_ID}-slots"

echo "📦 Сборка TypeScript..."
npm run build

echo "🚀 Деплой в Google Cloud Functions..."
echo "   Проект: $PROJECT_ID"
echo "   Регион: $REGION"
echo "   Функция: $FUNCTION_NAME"

gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --runtime=nodejs20 \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point=telegramWebhook \
    --set-env-vars "BOT_TOKEN=$BOT_TOKEN,GCS_BUCKET=$BUCKET_NAME" \
    --set-build-env-vars "GOOGLE_NODE_RUN_SCRIPTS=" \
    --region=$REGION \
    --source=. \
    --memory=256MB \
    --timeout=60s \
    --quiet

# Получаем URL функции
WEBHOOK_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format='value(serviceConfig.uri)' 2>/dev/null)

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "🔗 URL функции: $WEBHOOK_URL"
echo ""
echo "📌 Теперь установи webhook в Telegram:"
echo "   curl -X POST \"https://api.telegram.org/bot\$BOT_TOKEN/setWebhook\" -d \"url=$WEBHOOK_URL\""
echo ""
echo "   Или выполни: npm run set-webhook (предварительно export WEBHOOK_URL='$WEBHOOK_URL')"

