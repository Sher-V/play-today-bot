#!/bin/bash

# Скрипт для создания Cloud Tasks очереди для загрузки видео

set -e

echo "🔧 Setting up Cloud Tasks queue for video uploads..."

# Параметры
PROJECT_ID=$(gcloud config get-value project)
LOCATION="europe-west1"
QUEUE_NAME="video-upload-queue"

echo "Project ID: $PROJECT_ID"
echo "Location: $LOCATION"
echo "Queue name: $QUEUE_NAME"

# Проверяем, существует ли очередь
if gcloud tasks queues describe $QUEUE_NAME --location=$LOCATION 2>/dev/null; then
  echo "✓ Queue already exists"
else
  echo "📝 Creating queue..."
  gcloud tasks queues create $QUEUE_NAME \
    --location=$LOCATION \
    --max-concurrent-dispatches=10 \
    --max-attempts=3 \
    --max-retry-duration=3600s \
    --min-backoff=60s \
    --max-backoff=600s
  
  echo "✅ Queue created successfully!"
fi

# Настраиваем permissions для Cloud Tasks
echo ""
echo "🔐 Setting up permissions..."

# Получаем service account для Cloud Tasks
SERVICE_ACCOUNT=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudtasks-service.iam.gserviceaccount.com

echo "Service Account: $SERVICE_ACCOUNT"

# Даем права на вызов Cloud Function
echo "Granting Cloud Functions Invoker role..."
gcloud functions add-iam-policy-binding uploadCoachVideo \
  --region=europe-west1 \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudfunctions.invoker" \
  --gen2

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Add these variables to your .env file:"
echo "CLOUD_TASKS_LOCATION=$LOCATION"
echo "CLOUD_TASKS_QUEUE=$QUEUE_NAME"
echo "GCP_PROJECT=$PROJECT_ID"


