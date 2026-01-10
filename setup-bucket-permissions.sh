#!/bin/bash

# Скрипт для настройки публичного доступа к bucket с uniform bucket-level access

BUCKET_NAME="play-today-coach-media"

echo "Настройка публичного доступа для bucket: ${BUCKET_NAME}"

# Даем всем пользователям право на чтение объектов
gcloud storage buckets add-iam-policy-binding gs://${BUCKET_NAME} \
  --member=allUsers \
  --role=roles/storage.objectViewer

echo "Публичный доступ настроен!"
echo "Все файлы в bucket будут доступны по URL: https://storage.googleapis.com/${BUCKET_NAME}/путь/к/файлу"


