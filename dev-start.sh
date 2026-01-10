#!/bin/bash

# Скрипт для запуска полного dev-окружения
# Запускает бота и Cloud Function для загрузки видео

echo "🚀 Starting Play Today Bot Development Environment"
echo ""

# Проверяем, что npm модули установлены
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Собираем проект
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ Build complete!"
echo ""

# Функция для очистки процессов при выходе
cleanup() {
  echo ""
  echo "🛑 Stopping all processes..."
  kill $(jobs -p) 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

# Запускаем Cloud Function для загрузки видео на порту 8081
echo "📤 Starting uploadCoachVideo function on http://localhost:8081"
npx functions-framework --target=uploadCoachVideo --source=dist/functions.js --port=8081 &
UPLOAD_PID=$!

# Даем функции время запуститься
sleep 2

# Запускаем бота
echo "🤖 Starting Telegram bot..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Development environment is ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Upload function: http://localhost:8081"
echo "🤖 Bot: running in development mode"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

npm run dev:bot

# Если бот завершился, останавливаем все
cleanup

