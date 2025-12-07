/**
 * Скрипт для создания BigQuery dataset вручную
 * Запуск: node create-dataset.js
 */

const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'play-today-479819';
const DATASET_ID = 'telegram_bot_analytics';
const LOCATION = 'europe-west1'; // Belgium

async function createDataset() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  try {
    console.log(`🔍 Проверяю существование dataset ${DATASET_ID}...`);
    
    const [datasets] = await bigquery.getDatasets();
    const exists = datasets.some(ds => (ds.id || '').includes(DATASET_ID));
    
    if (exists) {
      console.log(`✅ Dataset ${DATASET_ID} уже существует`);
      return;
    }

    console.log(`📦 Создаю dataset ${DATASET_ID} в локации ${LOCATION}...`);
    
    await bigquery.createDataset(DATASET_ID, {
      location: LOCATION,
      description: 'Telegram bot analytics dataset',
    });

    console.log(`✅ Dataset ${DATASET_ID} успешно создан!`);
    console.log(`📋 Теперь таблица button_clicks создастся автоматически при первом клике на кнопку.`);
  } catch (error) {
    console.error('❌ Ошибка при создании dataset:', error.message);
    if (error.message.includes('permission')) {
      console.error('💡 Проверь права Service Account на BigQuery');
      console.error('   Выполни: ./setup-bigquery-permissions.sh');
    }
    process.exit(1);
  }
}

createDataset();

