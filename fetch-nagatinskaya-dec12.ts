import * as fs from 'fs';
import * as path from 'path';
import { VIVACRM_PADEL_CONFIGS } from './src/constants/slots-constants';
import { PadelSiteId } from './src/constants/padel-constants';
import { fetchVivaCrmSlotsForDay } from './src/functions/slots-fetcher/vivacrm-fetcher';

async function main() {
  // Находим конфигурацию для Падел Хаб Нагатинская
  const config = VIVACRM_PADEL_CONFIGS.find(
    c => c.name === PadelSiteId.PADEL_HUB_NAGATINSKAYA
  );

  if (!config) {
    console.error('❌ Конфигурация для Падел Хаб Нагатинская не найдена');
    process.exit(1);
  }

  // Дата: 12 декабря 2025
  const targetDate = '2025-12-12';

  console.log(`🔍 Получаю слоты для: ${config.name}`);
  console.log(`📅 Дата: ${targetDate}`);
  console.log('');

  try {
    // Получаем слоты за конкретную дату
    const slots = await fetchVivaCrmSlotsForDay(config, targetDate);

    // Формируем результат
    const result = {
      lastUpdated: new Date().toISOString(),
      siteName: config.name,
      date: targetDate,
      siteConfig: {
        tenantId: config.tenantId,
        serviceId: config.serviceId,
        origin: config.origin
      },
      slots: slots,
      totalSlots: slots.length
    };

    // Сохраняем в JSON файл
    const outputPath = path.join(process.cwd(), 'reson.json');
    const jsonData = JSON.stringify(result, null, 2);
    fs.writeFileSync(outputPath, jsonData, 'utf-8');

    console.log('');
    console.log(`✅ Успешно получено ${slots.length} слотов за ${targetDate}`);
    console.log(`💾 Сохранено в: ${outputPath}`);
    console.log('');

    // Группируем по кортам
    const byCourt: Record<string, typeof slots> = {};
    for (const slot of slots) {
      const courtName = slot.roomName || 'Неизвестный корт';
      if (!byCourt[courtName]) {
        byCourt[courtName] = [];
      }
      byCourt[courtName].push(slot);
    }

    console.log('📊 Статистика по кортам:');
    for (const [courtName, courtSlots] of Object.entries(byCourt)) {
      console.log(`  ${courtName}: ${courtSlots.length} слотов`);
    }

    console.log('');
    console.log('🕐 Доступные слоты:');
    console.log('');
    
    // Сортируем слоты по времени
    const sortedSlots = [...slots].sort((a, b) => a.time.localeCompare(b.time));
    
    // Группируем по времени для удобного вывода
    const byTime: Record<string, typeof slots> = {};
    for (const slot of sortedSlots) {
      if (!byTime[slot.time]) {
        byTime[slot.time] = [];
      }
      byTime[slot.time].push(slot);
    }

    for (const [time, timeSlots] of Object.entries(byTime).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ⏰ ${time}:`);
      for (const slot of timeSlots) {
        const priceStr = slot.price ? `${slot.price}₽` : 'цена не указана';
        console.log(`     - ${slot.roomName} (${priceStr})`);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка при получении слотов:', error);
    process.exit(1);
  }
}

main();

