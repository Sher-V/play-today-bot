#!/bin/bash

# Деплой Cloud Function для отправки напоминаний о заявках
# Эта функция вызывается через Cloud Tasks с задержкой в 1 час

set -e

echo "🚀 Deploying sendCoachReminder Cloud Function..."

# Проверяем наличие необходимых переменных окружения
if [ -z "$GCP_PROJECT" ]; then
  echo "❌ Error: GCP_PROJECT not set"
  exit 1
fi

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ Error: BOT_TOKEN not set (production bot token)"
  exit 1
fi

FUNCTION_NAME="sendCoachReminder"
REGION="us-central1"
RUNTIME="nodejs20"
ENTRY_POINT="sendCoachReminder"
MEMORY="256MB"
TIMEOUT="60s"

echo "📦 Building TypeScript..."
npm run build

echo "☁️ Deploying function to Google Cloud..."
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=$RUNTIME \
  --region=$REGION \
  --source=. \
  --entry-point=$ENTRY_POINT \
  --trigger-http \
  --allow-unauthenticated \
  --memory=$MEMORY \
  --timeout=$TIMEOUT \
  --set-env-vars="BOT_TOKEN=$BOT_TOKEN" \
  --project=$GCP_PROJECT

echo ""
echo "✅ Function deployed successfully!"
echo ""
echo "📝 Function URL:"
gcloud functions describe $FUNCTION_NAME \
  --region=$REGION \
  --gen2 \
  --project=$GCP_PROJECT \
  --format="value(serviceConfig.uri)"

echo ""
echo "⚙️ Next steps:"
echo "1. Copy the Function URL above"
echo "2. Set REMINDER_FUNCTION_URL in your .env file"
echo "3. Redeploy your main bot function"

