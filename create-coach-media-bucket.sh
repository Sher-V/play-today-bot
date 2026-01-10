#!/bin/bash

# Скрипт для создания bucket для медиа тренеров

BUCKET_NAME="play-today-coach-media"
PROJECT_ID=$(gcloud config get-value project)

echo "Создание bucket: ${BUCKET_NAME}"
echo "Проект: ${PROJECT_ID}"

# Создаем bucket
gsutil mb -p ${PROJECT_ID} -c STANDARD -l europe-west1 gs://${BUCKET_NAME}

# Настраиваем CORS для bucket (если нужно)
echo '[{"origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600}]' > cors-config.json
gsutil cors set cors-config.json gs://${BUCKET_NAME}
rm cors-config.json

# Устанавливаем права доступа (публичное чтение)
gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}

echo "Bucket создан успешно!"
echo "Добавьте в .env файл:"
echo "COACH_MEDIA_BUCKET=${BUCKET_NAME}"


