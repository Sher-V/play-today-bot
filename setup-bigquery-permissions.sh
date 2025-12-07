#!/bin/bash

# Скрипт для выдачи прав на BigQuery сервисному аккаунту Cloud Function

set -e

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="europe-west1"
FUNCTION_NAME="playTodayBot"

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Ошибка: Не установлен проект в gcloud"
    echo "Выполни: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Получаю Service Account для функции $FUNCTION_NAME..."

SERVICE_ACCOUNT=$(gcloud functions describe $FUNCTION_NAME \
    --gen2 \
    --region=$REGION \
    --format="value(serviceAccountEmail)" 2>/dev/null)

if [ -z "$SERVICE_ACCOUNT" ]; then
    echo "❌ Ошибка: Не удалось получить Service Account"
    echo "Убедись, что функция развернута: gcloud functions describe $FUNCTION_NAME --gen2 --region=$REGION"
    exit 1
fi

echo "✅ Service Account: $SERVICE_ACCOUNT"
echo ""
echo "🔐 Выдаю права на BigQuery..."

# Выдаем права на редактирование данных
echo "   → roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/bigquery.dataEditor" \
    --quiet

# Выдаем права на выполнение запросов
echo "   → roles/bigquery.jobUser"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/bigquery.jobUser" \
    --quiet

echo ""
echo "✅ Права выданы успешно!"
echo ""
echo "📌 Теперь передеплойте функцию с USE_BIGQUERY=true:"
echo "   ./deploy.sh"

