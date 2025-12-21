#!/bin/bash

# Play Today Bot - Create Separate Schedulers for Tennis and Padel
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

# Получаем URL функции
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --gen2 --format='value(serviceConfig.uri)' 2>/dev/null)

if [ -z "$FUNCTION_URL" ]; then
    echo "❌ Ошибка: Не удалось получить URL функции $FUNCTION_NAME"
    echo "Убедитесь, что функция развёрнута: npm run deploy:slots"
    exit 1
fi

echo "🔗 URL функции: $FUNCTION_URL"
echo ""

# Включаем Cloud Scheduler API если не включен
echo "📅 Включаем Cloud Scheduler API..."
gcloud services enable cloudscheduler.googleapis.com --quiet || true

# Создаём или обновляем scheduler для тенниса
TENNIS_JOB_NAME="slots-fetcher-tennis-job"
echo ""
echo "🎾 Настраиваем scheduler для тенниса..."

if gcloud scheduler jobs describe $TENNIS_JOB_NAME --location=$REGION &>/dev/null; then
    echo "   Job уже существует, обновляем..."
    gcloud scheduler jobs update http $TENNIS_JOB_NAME \
        --location=$REGION \
        --schedule='*/20 8-21 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"tennis"}' \
        --update-headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для тенниса обновлён!"
else
    echo "   Job не существует, создаём новый..."
    gcloud scheduler jobs create http $TENNIS_JOB_NAME \
        --location=$REGION \
        --schedule='*/20 8-21 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"tennis"}' \
        --headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для тенниса создан!"
fi

# Создаём или обновляем scheduler для падела (ближайшая неделя, раз в час)
PADEL_WEEK1_JOB_NAME="slots-fetcher-padel-week1-job"
echo ""
echo "🏓 Настраиваем scheduler для падела (ближайшая неделя, раз в час)..."

if gcloud scheduler jobs describe $PADEL_WEEK1_JOB_NAME --location=$REGION &>/dev/null; then
    echo "   Job уже существует, обновляем..."
    gcloud scheduler jobs update http $PADEL_WEEK1_JOB_NAME \
        --location=$REGION \
        --schedule='0 8-21 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"padel","startDay":0,"endDay":7}' \
        --update-headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для падела (неделя 1) обновлён!"
else
    echo "   Job не существует, создаём новый..."
    gcloud scheduler jobs create http $PADEL_WEEK1_JOB_NAME \
        --location=$REGION \
        --schedule='0 8-21 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"padel","startDay":0,"endDay":7}' \
        --headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для падела (неделя 1) создан!"
fi

# Создаём или обновляем scheduler для падела (вторая неделя, раз в сутки)
PADEL_WEEK2_JOB_NAME="slots-fetcher-padel-week2-job"
echo ""
echo "🏓 Настраиваем scheduler для падела (вторая неделя, раз в сутки)..."

if gcloud scheduler jobs describe $PADEL_WEEK2_JOB_NAME --location=$REGION &>/dev/null; then
    echo "   Job уже существует, обновляем..."
    gcloud scheduler jobs update http $PADEL_WEEK2_JOB_NAME \
        --location=$REGION \
        --schedule='0 8 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"padel","startDay":7,"endDay":14}' \
        --update-headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для падела (неделя 2) обновлён!"
else
    echo "   Job не существует, создаём новый..."
    gcloud scheduler jobs create http $PADEL_WEEK2_JOB_NAME \
        --location=$REGION \
        --schedule='0 8 * * *' \
        --time-zone='Europe/Moscow' \
        --uri="$FUNCTION_URL" \
        --http-method=POST \
        --message-body='{"sport":"padel","startDay":7,"endDay":14}' \
        --headers="Content-Type=application/json" \
        --attempt-deadline=120s
    
    echo "✅ Cloud Scheduler job для падела (неделя 2) создан!"
fi

echo ""
echo "📋 Список всех scheduler jobs:"
gcloud scheduler jobs list --location=$REGION

echo ""
echo "✅ Готово! Теперь у вас настроены scheduler'ы:"
echo "   🎾 $TENNIS_JOB_NAME - для тенниса (каждые 20 минут, 8-21 МСК)"
echo "   🏓 $PADEL_WEEK1_JOB_NAME - для падела, ближайшая неделя (раз в час, 8-21 МСК)"
echo "   🏓 $PADEL_WEEK2_JOB_NAME - для падела, вторая неделя (раз в сутки, 8:00 МСК)"
echo ""
echo "💡 Если хотите удалить старый scheduler (slots-fetcher-job), выполните:"
echo "   gcloud scheduler jobs delete slots-fetcher-job --location=$REGION"

