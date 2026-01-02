#!/bin/bash

# Play Today Bot - Deploy Broadcast Function Script
# ===================================================

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
FUNCTION_NAME="broadcastMessage"

echo "📦 Сборка TypeScript..."
npm run build

echo "🚀 Деплой функции рассылки в Google Cloud Functions..."
echo "   Проект: $PROJECT_ID"
echo "   Регион: $REGION"
echo "   Функция: $FUNCTION_NAME"

# Подготовка переменных окружения
ENV_VARS="BOT_TOKEN=$BOT_TOKEN,GOOGLE_CLOUD_PROJECT=$PROJECT_ID"

# Опционально: добавляем BigQuery переменные, если они заданы
if [ ! -z "$USE_BIGQUERY" ]; then
    ENV_VARS="$ENV_VARS,USE_BIGQUERY=$USE_BIGQUERY"
fi
if [ ! -z "$BIGQUERY_DATASET" ]; then
    ENV_VARS="$ENV_VARS,BIGQUERY_DATASET=$BIGQUERY_DATASET"
fi
if [ ! -z "$BIGQUERY_TABLE" ]; then
    ENV_VARS="$ENV_VARS,BIGQUERY_TABLE=$BIGQUERY_TABLE"
fi

gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --runtime=nodejs20 \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point=broadcastMessage \
    --set-env-vars "$ENV_VARS" \
    --set-build-env-vars "GOOGLE_NODE_RUN_SCRIPTS=" \
    --region=$REGION \
    --source=. \
    --memory=512MB \
    --timeout=540s \
    --quiet

# Получаем URL функции
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format='value(serviceConfig.uri)' 2>/dev/null)

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "🔗 URL функции: $FUNCTION_URL"
echo ""
echo "📌 Для тестирования на двух пользователях выполни:"
echo "   curl -X POST \"$FUNCTION_URL\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"testMode\": true, \"testUserIds\": [503391201, 500405387]}'"
echo ""
echo "📌 Для рассылки всем пользователям (ОСТОРОЖНО!):"
echo "   curl -X POST \"$FUNCTION_URL\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"testMode\": false}'"

