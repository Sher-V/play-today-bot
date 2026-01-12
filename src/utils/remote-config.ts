import * as admin from 'firebase-admin';

// Кэш для значений Remote Config
let remoteConfigCache: { [key: string]: any } | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Флаг для отслеживания инициализации
let isInitialized = false;
let initializationError: Error | null = null;

/**
 * Инициализирует Firebase Admin SDK с правильной настройкой quota project
 */
function initializeFirebaseAdmin(): void {
  if (isInitialized) {
    return;
  }

  if (!admin.apps.length) {
    try {
      // В Google Cloud Functions инициализация происходит автоматически
      // Но для Remote Config нужен явный вызов initializeApp с правильными настройками
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
      
      if (projectId) {
        admin.initializeApp({
          projectId: projectId,
        });
        console.log(`[remote-config] Firebase Admin initialized with project: ${projectId}`);
      } else {
        // Пробуем инициализировать без явного указания проекта (для Cloud Functions)
        admin.initializeApp();
        const detectedProjectId = admin.app().options.projectId;
        if (detectedProjectId) {
          console.log(`[remote-config] Firebase Admin initialized (auto-detected project: ${detectedProjectId})`);
        } else {
          console.warn(`[remote-config] Firebase Admin initialized but project ID not detected. Set GOOGLE_CLOUD_PROJECT for Remote Config to work.`);
        }
      }
      
      isInitialized = true;
      initializationError = null;
    } catch (error) {
      const err = error as Error;
      // Если уже инициализирован, игнорируем ошибку
      if (err.message.includes('already exists')) {
        isInitialized = true;
        initializationError = null;
      } else {
        initializationError = err;
        console.error('[remote-config] Error initializing Firebase Admin:', err);
      }
    }
  } else {
    isInitialized = true;
  }
}

/**
 * Получает значение из Firebase Remote Config
 * @param key - ключ параметра
 * @param defaultValue - значение по умолчанию
 * @returns значение параметра
 */
export async function getRemoteConfigValue(key: string, defaultValue: boolean = false): Promise<boolean> {
  console.log(`[remote-config] Getting value for '${key}' (default: ${defaultValue})`);
  
  try {
    initializeFirebaseAdmin();
    
    // Если была ошибка инициализации, возвращаем значение по умолчанию
    if (initializationError) {
      console.error(`[remote-config] Initialization error:`, initializationError);
      console.warn(`[remote-config] Using default value for ${key} due to initialization error`);
      return defaultValue;
    }
    
    console.log(`[remote-config] Firebase Admin initialized successfully`);
    
    // Проверяем кэш
    const now = Date.now();
    if (remoteConfigCache && (now - cacheTimestamp) < CACHE_TTL) {
      const cachedValue = remoteConfigCache[key];
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    }
    
    // Получаем Remote Config
    console.log(`[remote-config] Getting Remote Config instance...`);
    const remoteConfig = admin.remoteConfig();
    console.log(`[remote-config] Remote Config instance obtained`);
    
    console.log(`[remote-config] Fetching template...`);
    const template = await remoteConfig.getTemplate();
    console.log(`[remote-config] Template fetched successfully`);
    
    console.log(`[remote-config] Template version: ${template.version?.versionNumber || 'N/A'}`);
    console.log(`[remote-config] Available parameters: ${Object.keys(template.parameters || {}).join(', ') || 'none'}`);
    
    // Извлекаем значение параметра
    const parameter = template.parameters?.[key];
    let value: boolean = defaultValue;
    
    if (!parameter) {
      console.warn(`[remote-config] Parameter '${key}' not found in Remote Config template`);
      console.warn(`[remote-config] Available parameters: ${Object.keys(template.parameters || {}).join(', ') || 'none'}`);
    } else {
      console.log(`[remote-config] Parameter '${key}' found:`, JSON.stringify(parameter, null, 2));
      
      if (parameter.defaultValue) {
        // Remote Config возвращает объект с defaultValue
        // Преобразуем в строку и затем в boolean
        const defaultValueObj = parameter.defaultValue as any;
        console.log(`[remote-config] defaultValue object:`, JSON.stringify(defaultValueObj, null, 2));
        
        // Пробуем разные способы извлечения значения
        let rawValue: any = null;
        
        if (typeof defaultValueObj === 'string') {
          rawValue = defaultValueObj;
        } else if (defaultValueObj?.value !== undefined) {
          rawValue = defaultValueObj.value;
        } else if (defaultValueObj?.useInAppDefault !== undefined) {
          // Если используется значение по умолчанию из приложения, используем defaultValue
          rawValue = null;
        } else {
          rawValue = defaultValueObj;
        }
        
        // Преобразуем в boolean
        if (rawValue !== null && rawValue !== undefined) {
          // Если уже boolean
          if (typeof rawValue === 'boolean') {
            value = rawValue;
          } 
          // Если строка
          else if (typeof rawValue === 'string') {
            const lowerValue = rawValue.toLowerCase().trim();
            value = lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
          }
          // Если число
          else if (typeof rawValue === 'number') {
            value = rawValue === 1 || rawValue > 0;
          }
          // Иначе пробуем преобразовать в строку
          else {
            const stringValue = String(rawValue).toLowerCase().trim();
            value = stringValue === 'true' || stringValue === '1' || stringValue === 'yes';
          }
        }
        
        console.log(`[remote-config] Raw value: ${JSON.stringify(rawValue)}, Parsed boolean: ${value}`);
      } else {
        console.warn(`[remote-config] Parameter '${key}' has no defaultValue`);
      }
    }
    
    // Обновляем кэш
    if (!remoteConfigCache) {
      remoteConfigCache = {};
    }
    remoteConfigCache[key] = value;
    cacheTimestamp = now;
    
    console.log(`[remote-config] Final value for ${key}: ${value} (default was: ${defaultValue})`);
    return value;
  } catch (error) {
    const err = error as Error;
    
    console.error(`[remote-config] Error getting value for '${key}':`, err);
    console.error(`[remote-config] Error message:`, err.message);
    console.error(`[remote-config] Error stack:`, err.stack);
    
    // Специальная обработка ошибки quota project
    if (err.message.includes('quota project')) {
      console.error(`[remote-config] ==========================================`);
      console.error(`[remote-config] QUOTA PROJECT NOT SET`);
      console.error(`[remote-config] ==========================================`);
      console.error(`[remote-config] Для локальной разработки нужно настроить quota project:`);
      console.error(`[remote-config] 1. Установите GOOGLE_CLOUD_PROJECT в .env файле`);
      console.error(`[remote-config] 2. Или выполните: gcloud auth application-default set-quota-project YOUR_PROJECT_ID`);
      console.error(`[remote-config] Подробнее: LOCAL_REMOTE_CONFIG_SETUP.md`);
      console.error(`[remote-config] ==========================================`);
    }
    
    console.warn(`[remote-config] Using default value for ${key}: ${defaultValue}`);
    
    // В случае ошибки возвращаем значение по умолчанию
    return defaultValue;
  }
}

/**
 * Очищает кэш Remote Config (для принудительного обновления)
 */
export function clearRemoteConfigCache(): void {
  remoteConfigCache = null;
  cacheTimestamp = 0;
}
