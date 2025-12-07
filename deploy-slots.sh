#!/bin/bash

# Play Today Bot - Deploy Slots Fetcher to Google Cloud Functions
# ================================================================

set -e

# Загружаем .env если есть
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Проверяем gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "❌ Ошибка: gcloud CLI не установлен"
    echo "Установи: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION="europe-west1"
FUNCTION_NAME="slotsFetcher"
BUCKET_NAME="${PROJECT_ID}-slots"

# Создаём Cloud Storage bucket если не существует
echo "📦 Проверяем Cloud Storage bucket..."
if ! gsutil ls -b "gs://${BUCKET_NAME}" &>/dev/null; then
    echo "   Создаём bucket: ${BUCKET_NAME}"
    gsutil mb -l ${REGION} "gs://${BUCKET_NAME}"
else
    echo "   Bucket уже существует: ${BUCKET_NAME}"
fi

echo "📦 Сборка TypeScript..."
npm run build

echo "🚀 Деплой Slots Fetcher в Google Cloud Functions..."
echo "   Проект: $PROJECT_ID"
echo "   Регион: $REGION"
echo "   Функция: $FUNCTION_NAME"

gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --runtime=nodejs20 \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point=slotsFetcher \
    --set-env-vars "GCS_BUCKET=${BUCKET_NAME}" \
    --set-build-env-vars "GOOGLE_NODE_RUN_SCRIPTS=" \
    --region=$REGION \
    --source=. \
    --memory=256MB \
    --timeout=120s

# Получаем URL функции
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format='value(serviceConfig.uri)' 2>/dev/null)

echo ""
echo "✅ Деплой функции завершён!"
echo ""
echo "🔗 URL функции: $FUNCTION_URL"
echo ""
echo "📌 Теперь настрой Cloud Scheduler для запуска каждые 20 минут с 8:00 до 21:00 МСК:"
echo ""
echo "gcloud scheduler jobs create http slots-fetcher-job \\"
echo "    --location=$REGION \\"
echo "    --schedule='*/20 8-21 * * *' \\"
echo "    --time-zone='Europe/Moscow' \\"
echo "    --uri='$FUNCTION_URL' \\"
echo "    --http-method=POST \\"
echo "    --oidc-service-account-email=${PROJECT_ID}@appspot.gserviceaccount.com"
echo ""
echo "Или выполни следующую команду:"
echo ""

# Автоматически создаём или обновляем Cloud Scheduler job
read -p "Создать/обновить Cloud Scheduler job сейчас? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📅 Проверяем Cloud Scheduler job..."
    
    # Включаем Cloud Scheduler API если не включен
    gcloud services enable cloudscheduler.googleapis.com --quiet || true
    
    JOB_NAME="slots-fetcher-job"
    
    # Проверяем, существует ли job
    if gcloud scheduler jobs describe $JOB_NAME --location=$REGION &>/dev/null; then
        echo "   Job уже существует, обновляем..."
        gcloud scheduler jobs update http $JOB_NAME \
            --location=$REGION \
            --schedule='*/20 8-21 * * *' \
            --time-zone='Europe/Moscow' \
            --uri="$FUNCTION_URL" \
            --http-method=POST \
            --attempt-deadline=120s
        
        echo "✅ Cloud Scheduler job обновлён!"
        echo "   Расписание: каждые 20 минут с 8:00 до 21:00 МСК"
    else
        echo "   Job не существует, создаём новый..."
        gcloud scheduler jobs create http $JOB_NAME \
            --location=$REGION \
            --schedule='*/20 8-21 * * *' \
            --time-zone='Europe/Moscow' \
            --uri="$FUNCTION_URL" \
            --http-method=POST \
            --attempt-deadline=120s
        
        echo "✅ Cloud Scheduler job создан!"
        echo "   Расписание: каждые 20 минут с 8:00 до 21:00 МСК"
    fi
fi

echo ""
echo "🧪 Проверить работу функции:"
echo "   curl -X POST '$FUNCTION_URL'     # Запустить сбор"
echo "   curl '$FUNCTION_URL'              # Получить данные"

