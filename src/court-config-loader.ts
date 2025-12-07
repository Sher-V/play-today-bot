/**
 * Модуль для загрузки конфигураций кортов из Google Cloud
 * 
 * Поддерживает два варианта:
 * 1. Firestore (рекомендуется) - удобное редактирование через UI
 * 2. Cloud Storage - простой вариант с JSON файлами
 */

import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import * as path from 'path';
import * as fs from 'fs';

// Типы для конфигурации кортов
export interface CourtConfig {
  courtNames: Record<string, string>;
  courtLinks: Record<string, string>;
  courtMaps: Record<string, string>;
  courtMetro: Record<string, string>;
  courtDistricts: Record<string, string>;
  courtIsCity: Record<string, boolean>;
  courtLocations: Record<string, string[]>;
}

// Тип хранилища
type StorageType = 'firestore' | 'storage' | 'local';

// Кэш для конфигураций
let cachedConfigs: {
  tennis?: CourtConfig;
  padel?: CourtConfig;
} = {};
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Определяем тип хранилища из переменных окружения
const STORAGE_TYPE: StorageType = (process.env.COURT_CONFIG_STORAGE as StorageType) || 'local';
const FIRESTORE_COLLECTION = process.env.FIRESTORE_COLLECTION || 'court-configs';
const STORAGE_BUCKET = process.env.GCS_BUCKET;
const STORAGE_CONFIG_PATH = process.env.COURT_CONFIG_STORAGE_PATH || 'court-configs';

/**
 * Загрузка конфигурации из Firestore
 */
async function loadFromFirestore(sport: 'tennis' | 'padel'): Promise<CourtConfig | null> {
  try {
    const firestore = new Firestore();
    const doc = await firestore.collection(FIRESTORE_COLLECTION).doc(sport).get();
    
    if (!doc.exists) {
      console.warn(`Конфигурация для ${sport} не найдена в Firestore`);
      return null;
    }
    
    return doc.data() as CourtConfig;
  } catch (error) {
    console.error(`Ошибка загрузки конфигурации из Firestore для ${sport}:`, error);
    return null;
  }
}

/**
 * Загрузка конфигурации из Cloud Storage
 */
async function loadFromStorage(sport: 'tennis' | 'padel'): Promise<CourtConfig | null> {
  try {
    if (!STORAGE_BUCKET) {
      throw new Error('GCS_BUCKET не установлен в переменных окружения');
    }
    
    const storage = new Storage();
    const bucket = storage.bucket(STORAGE_BUCKET);
    const file = bucket.file(`${STORAGE_CONFIG_PATH}/${sport}-constants.json`);
    
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`Файл конфигурации для ${sport} не найден в Cloud Storage`);
      return null;
    }
    
    const [contents] = await file.download();
    return JSON.parse(contents.toString()) as CourtConfig;
  } catch (error) {
    console.error(`Ошибка загрузки конфигурации из Cloud Storage для ${sport}:`, error);
    return null;
  }
}

/**
 * Загрузка конфигурации из локальных файлов (fallback)
 */
async function loadFromLocal(sport: 'tennis' | 'padel'): Promise<CourtConfig | null> {
  try {
    const configFile = path.join(process.cwd(), `src/${sport}-constants.ts`);
    
    // В production лучше использовать JSON файлы
    const jsonFile = path.join(process.cwd(), `${sport}-constants.json`);
    
    if (fs.existsSync(jsonFile)) {
      const contents = fs.readFileSync(jsonFile, 'utf-8');
      return JSON.parse(contents) as CourtConfig;
    }
    
    // Fallback на TypeScript константы (для dev режима)
    if (fs.existsSync(configFile)) {
      // В dev режиме импортируем напрямую
      if (sport === 'tennis') {
        const { 
          TENNIS_COURT_NAMES,
          TENNIS_COURT_LINKS,
          TENNIS_COURT_MAPS,
          TENNIS_COURT_METRO,
          TENNIS_COURT_DISTRICTS,
          TENNIS_COURT_IS_CITY,
          TENNIS_COURT_LOCATIONS
        } = await import('./constants/tennis-constants');
        
        return {
          courtNames: TENNIS_COURT_NAMES,
          courtLinks: TENNIS_COURT_LINKS,
          courtMaps: TENNIS_COURT_MAPS,
          courtMetro: TENNIS_COURT_METRO,
          courtDistricts: TENNIS_COURT_DISTRICTS,
          courtIsCity: TENNIS_COURT_IS_CITY,
          courtLocations: TENNIS_COURT_LOCATIONS
        };
      } else {
        const {
          PADEL_COURT_NAMES,
          PADEL_COURT_LINKS,
          PADEL_COURT_MAPS,
          PADEL_COURT_METRO,
          PADEL_COURT_DISTRICTS,
          PADEL_COURT_IS_CITY,
          PADEL_COURT_LOCATIONS
        } = await import('./constants/padel-constants');
        
        return {
          courtNames: PADEL_COURT_NAMES,
          courtLinks: PADEL_COURT_LINKS,
          courtMaps: PADEL_COURT_MAPS,
          courtMetro: PADEL_COURT_METRO,
          courtDistricts: PADEL_COURT_DISTRICTS,
          courtIsCity: PADEL_COURT_IS_CITY,
          courtLocations: PADEL_COURT_LOCATIONS
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Ошибка загрузки локальной конфигурации для ${sport}:`, error);
    return null;
  }
}

/**
 * Получение конфигурации кортов с кэшированием
 */
export async function getCourtConfigs(sport: 'tennis' | 'padel'): Promise<CourtConfig | null> {
  const now = Date.now();
  
  // Проверяем кэш
  if (cachedConfigs[sport] && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedConfigs[sport]!;
  }
  
  // Загружаем из выбранного хранилища
  let config: CourtConfig | null = null;
  
  switch (STORAGE_TYPE) {
    case 'firestore':
      config = await loadFromFirestore(sport);
      break;
    case 'storage':
      config = await loadFromStorage(sport);
      break;
    case 'local':
    default:
      config = await loadFromLocal(sport);
      break;
  }
  
  // Если загрузка не удалась, пробуем fallback на локальные файлы
  if (!config && STORAGE_TYPE !== 'local') {
    console.warn(`Не удалось загрузить конфигурацию из ${STORAGE_TYPE}, пробую локальные файлы...`);
    config = await loadFromLocal(sport);
  }
  
  if (config) {
    cachedConfigs[sport] = config;
    cacheTimestamp = now;
  }
  
  return config;
}

/**
 * Очистка кэша (полезно при обновлении конфигурации)
 */
export function clearConfigCache(sport?: 'tennis' | 'padel'): void {
  if (sport) {
    delete cachedConfigs[sport];
  } else {
    cachedConfigs = {};
  }
  cacheTimestamp = 0;
}

/**
 * Сохранение конфигурации в Firestore
 */
export async function saveCourtConfigsToFirestore(
  sport: 'tennis' | 'padel',
  config: CourtConfig
): Promise<void> {
  try {
    const firestore = new Firestore();
    await firestore.collection(FIRESTORE_COLLECTION).doc(sport).set(config);
    clearConfigCache(sport);
    console.log(`Конфигурация для ${sport} успешно сохранена в Firestore`);
  } catch (error) {
    console.error(`Ошибка сохранения конфигурации в Firestore для ${sport}:`, error);
    throw error;
  }
}

/**
 * Сохранение конфигурации в Cloud Storage
 */
export async function saveCourtConfigsToStorage(
  sport: 'tennis' | 'padel',
  config: CourtConfig
): Promise<void> {
  try {
    if (!STORAGE_BUCKET) {
      throw new Error('GCS_BUCKET не установлен в переменных окружения');
    }
    
    const storage = new Storage();
    const bucket = storage.bucket(STORAGE_BUCKET);
    const file = bucket.file(`${STORAGE_CONFIG_PATH}/${sport}-constants.json`);
    
    await file.save(JSON.stringify(config, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'public, max-age=300', // 5 минут
      },
    });
    
    clearConfigCache(sport);
    console.log(`Конфигурация для ${sport} успешно сохранена в Cloud Storage`);
  } catch (error) {
    console.error(`Ошибка сохранения конфигурации в Cloud Storage для ${sport}:`, error);
    throw error;
  }
}

