/**
 * Скрипт для миграции конфигураций кортов в Firestore
 * 
 * Использование:
 * npm run migrate-configs-to-firestore
 */

import { Firestore } from '@google-cloud/firestore';
import * as path from 'path';
import * as fs from 'fs';

async function migrateConfigs() {
  const firestore = new Firestore();
  const collection = firestore.collection('court-configs');
  
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
    console.log('Сохраняю конфигурацию теннисных кортов...');
    await collection.doc('tennis').set(tennisConfig);
    console.log('✅ Конфигурация тенниса сохранена');
    
    // Сохраняем конфигурацию падела
    console.log('Сохраняю конфигурацию падел кортов...');
    await collection.doc('padel').set(padelConfig);
    console.log('✅ Конфигурация падела сохранена');
    
    console.log('\n🎉 Миграция завершена успешно!');
    console.log('\nТеперь можно использовать Firestore для хранения конфигураций.');
    console.log('Установите переменную окружения: COURT_CONFIG_STORAGE=firestore');
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  }
}

migrateConfigs().catch(console.error);

