/**
 * Скрипт для миграции конфигураций кортов в Cloud Storage
 * 
 * Использование:
 * COURT_CONFIG_STORAGE_PATH=court-configs npm run migrate-configs-to-storage
 */

import { Storage } from '@google-cloud/storage';
import * as path from 'path';

async function migrateConfigs() {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    console.error('❌ GCS_BUCKET не установлен в переменных окружения');
    process.exit(1);
  }
  
  const storagePath = process.env.COURT_CONFIG_STORAGE_PATH || 'court-configs';
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);
  
  // Импортируем константы
  const { 
    TENNIS_COURT_NAMES,
    TENNIS_COURT_LINKS,
    TENNIS_COURT_MAPS,
    TENNIS_COURT_METRO,
    TENNIS_COURT_DISTRICTS,
    TENNIS_COURT_IS_CITY,
    TENNIS_COURT_LOCATIONS
  } = await import('../src/constants/tennis-constants');
  
  const {
    PADEL_COURT_NAMES,
    PADEL_COURT_LINKS,
    PADEL_COURT_MAPS,
    PADEL_COURT_METRO,
    PADEL_COURT_DISTRICTS,
    PADEL_COURT_IS_CITY,
    PADEL_COURT_LOCATIONS
  } = await import('../src/padel-constants');
  
  // Подготавливаем данные для тенниса
  const tennisConfig = {
    courtNames: TENNIS_COURT_NAMES,
    courtLinks: TENNIS_COURT_LINKS,
    courtMaps: TENNIS_COURT_MAPS,
    courtMetro: TENNIS_COURT_METRO,
    courtDistricts: TENNIS_COURT_DISTRICTS,
    courtIsCity: TENNIS_COURT_IS_CITY,
    courtLocations: TENNIS_COURT_LOCATIONS
  };
  
  // Подготавливаем данные для падела
  const padelConfig = {
    courtNames: PADEL_COURT_NAMES,
    courtLinks: PADEL_COURT_LINKS,
    courtMaps: PADEL_COURT_MAPS,
    courtMetro: PADEL_COURT_METRO,
    courtDistricts: PADEL_COURT_DISTRICTS,
    courtIsCity: PADEL_COURT_IS_CITY,
    courtLocations: PADEL_COURT_LOCATIONS
  };
  
  try {
    // Сохраняем конфигурацию тенниса
    console.log(`Сохраняю конфигурацию теннисных кортов в gs://${bucketName}/${storagePath}/tennis-constants.json...`);
    const tennisFile = bucket.file(`${storagePath}/tennis-constants.json`);
    await tennisFile.save(JSON.stringify(tennisConfig, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'public, max-age=300',
      },
    });
    console.log('✅ Конфигурация тенниса сохранена');
    
    // Сохраняем конфигурацию падела
    console.log(`Сохраняю конфигурацию падел кортов в gs://${bucketName}/${storagePath}/padel-constants.json...`);
    const padelFile = bucket.file(`${storagePath}/padel-constants.json`);
    await padelFile.save(JSON.stringify(padelConfig, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'public, max-age=300',
      },
    });
    console.log('✅ Конфигурация падела сохранена');
    
    console.log('\n🎉 Миграция завершена успешно!');
    console.log('\nТеперь можно использовать Cloud Storage для хранения конфигураций.');
    console.log('Установите переменные окружения:');
    console.log('  COURT_CONFIG_STORAGE=storage');
    console.log(`  GCS_BUCKET=${bucketName}`);
    console.log(`  COURT_CONFIG_STORAGE_PATH=${storagePath}`);
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  }
}

migrateConfigs().catch(console.error);

