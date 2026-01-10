#!/bin/bash

# Скрипт для деплоя Cloud Function загрузки видео тренеров

set -e

echo "🚀 Deploying uploadCoachVideo Cloud Function..."

# Параметры
PROJECT_ID=$(gcloud config get-value project)
REGION="europe-west1"
FUNCTION_NAME="uploadCoachVideo"
COACH_MEDIA_BUCKET=${COACH_MEDIA_BUCKET:-"play-today-coach-media"}

echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Function name: $FUNCTION_NAME"
echo "Bucket: $COACH_MEDIA_BUCKET"

# Собираем проект
echo "📦 Building TypeScript..."
npm run build

# Деплоим функцию
echo "☁️ Deploying to Cloud Functions..."
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=. \
  --entry-point=$FUNCTION_NAME \
  --trigger-http \
  --timeout=540s \
  --memory=1GiB \
  --max-instances=10 \
  --set-env-vars COACH_MEDIA_BUCKET=$COACH_MEDIA_BUCKET \
  --no-allow-unauthenticated

# Получаем URL функции
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
  --region=$REGION \
  --gen2 \
  --format='value(serviceConfig.uri)')

echo ""
echo "✅ Function deployed successfully!"
echo "📍 Function URL: $FUNCTION_URL"
echo ""
echo "⚠️ Don't forget to:"
echo "1. Add VIDEO_UPLOAD_FUNCTION_URL=$FUNCTION_URL to your .env file"
echo "2. Create Cloud Tasks queue: ./setup-video-upload-queue.sh"
echo "3. Grant Cloud Tasks service account permissions to invoke this function"


