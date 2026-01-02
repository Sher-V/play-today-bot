/**
 * Локальный скрипт для тестирования функции рассылки
 * 
 * Запуск: npx ts-node test-broadcast-local.ts
 * 
 * Или с параметрами:
 * npx ts-node test-broadcast-local.ts --testMode=false
 */

import 'dotenv/config';
import { broadcastMessage } from './src/functions/broadcast-message';
import type { IncomingMessage, ServerResponse } from 'http';

// Парсим аргументы командной строки
const args = process.argv.slice(2);
const testModeArg = args.find(arg => arg.startsWith('--testMode='));
const testMode = testModeArg ? testModeArg.split('=')[1] !== 'false' : true;

const testUserIdsArg = args.find(arg => arg.startsWith('--testUserIds='));
const testUserIds = testUserIdsArg 
  ? testUserIdsArg.split('=')[1].split(',').map(id => parseInt(id.trim(), 10))
  : [503391201, 500405387];

console.log('🧪 Локальное тестирование функции рассылки');
console.log(`   Test mode: ${testMode}`);
console.log(`   Test user IDs: ${testUserIds.join(', ')}`);
console.log('');

// Создаем mock request и response
const mockRequest = {
  method: 'POST',
  body: {
    testMode,
    testUserIds,
  },
} as unknown as IncomingMessage & {
  body: { testMode: boolean; testUserIds: number[] };
  method: string;
};

// Создаем mock response с правильной типизацией
const createMockResponse = () => {
  const response = {
    status: (code: number) => {
      console.log(`\n📊 Response status: ${code}`);
      return response;
    },
    send: (body: string) => {
      console.log(`📤 Response body: ${body}`);
      return response;
    },
    json: (body: unknown) => {
      console.log(`\n📋 Response JSON:`);
      console.log(JSON.stringify(body, null, 2));
      return response;
    },
    end: () => {
      return response;
    },
  };
  return response;
};

const mockResponse = createMockResponse() as any;

// Запускаем функцию
broadcastMessage(mockRequest, mockResponse)
  .then(() => {
    console.log('\n✅ Тест завершен');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  });

