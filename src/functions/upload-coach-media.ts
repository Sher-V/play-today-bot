/**
 * Cloud Function для фоновой загрузки медиа тренеров (фото и видео) в Cloud Storage
 */

import { HttpFunction } from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import TelegramBot from 'node-telegram-bot-api';

const storage = new Storage();
const firestore = new Firestore();
const COACH_MEDIA_BUCKET = process.env.COACH_MEDIA_BUCKET;
const USERS_COLLECTION = 'users';

interface MediaUploadRequest {
  fileId: string;
  userId: number;
  botToken: string;
  fileType: 'photo' | 'video';
}

interface CoachMediaItem {
  type: 'photo' | 'video';
  fileId: string;
  publicUrl?: string;
  uploadedAt: string;
}

interface UserProfile {
  coachMedia?: CoachMediaItem[];
  [key: string]: any;
}

/**
 * HTTP Cloud Function для загрузки медиа тренера (фото или видео)
 * Вызывается через Cloud Tasks
 */
export const uploadCoachMedia: HttpFunction = async (req, res) => {
  try {
    console.log('[uploadCoachMedia] Function invoked');
    
    // Проверяем метод запроса
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { fileId, userId, botToken, fileType }: MediaUploadRequest = req.body;

    // Валидация входных данных
    if (!fileId || !userId || !botToken || !fileType) {
      console.error('[uploadCoachMedia] Missing required fields');
      res.status(400).send('Missing required fields');
      return;
    }

    if (!COACH_MEDIA_BUCKET) {
      console.error('[uploadCoachMedia] COACH_MEDIA_BUCKET not set');
      res.status(500).send('Configuration error');
      return;
    }

    console.log(`[uploadCoachMedia] Processing ${fileType} for user ${userId}, fileId: ${fileId}`);

    // Создаем экземпляр бота для загрузки файла
    const bot = new TelegramBot(botToken, { polling: false });

    // Получаем информацию о файле
    const fileInfo = await bot.getFile(fileId);
    const filePath = fileInfo.file_path;
    
    if (!filePath) {
      console.error('[uploadCoachMedia] File path not found');
      res.status(400).send('File path not found');
      return;
    }

    console.log(`[uploadCoachMedia] File path: ${filePath}, size: ${fileInfo.file_size} bytes`);

    // Определяем параметры файла
    let extension: string;
    let contentType: string;
    
    if (fileType === 'video') {
      extension = filePath.split('.').pop()?.toLowerCase() || 'mp4';
      const videoTypes: Record<string, string> = {
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm'
      };
      contentType = videoTypes[extension] || 'video/mp4';
    } else {
      extension = filePath.split('.').pop()?.toLowerCase() || 'jpg';
      contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
    }
    
    const timestamp = Date.now();
    const destinationPath = `coaches/${userId}/${timestamp}.${extension}`;

    // Скачиваем файл через stream
    console.log(`[uploadCoachMedia] Downloading ${fileType} from Telegram...`);
    const fileStream = bot.getFileStream(fileId);
    const chunks: Buffer[] = [];
    let downloadedSize = 0;
    const totalFileSize = fileInfo.file_size || 0;
    
    // Таймер для логирования прогресса каждые 5 секунд (только для больших файлов)
    const startTime = Date.now();
    const progressInterval = totalFileSize > 5 * 1024 * 1024 ? setInterval(() => {
      if (totalFileSize > 0) {
        const progress = ((downloadedSize / totalFileSize) * 100).toFixed(1);
        const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
        const totalMB = (totalFileSize / 1024 / 1024).toFixed(2);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`[uploadCoachMedia] Download progress: ${progress}% (${downloadedMB}/${totalMB} MB) - ${elapsedSec}s elapsed`);
      } else {
        const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
        console.log(`[uploadCoachMedia] Downloaded ${downloadedMB} MB`);
      }
    }, 5000) : null;
    
    await new Promise<void>((resolve, reject) => {
      fileStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        downloadedSize += chunk.length;
      });
      
      fileStream.on('end', () => {
        if (progressInterval) clearInterval(progressInterval);
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const totalMB = (downloadedSize / 1024 / 1024).toFixed(2);
        console.log(`[uploadCoachMedia] ✅ Download complete: ${totalMB} MB in ${totalTime}s`);
        resolve();
      });
      
      fileStream.on('error', (error) => {
        if (progressInterval) clearInterval(progressInterval);
        console.error('[uploadCoachMedia] Download error:', error);
        reject(error);
      });
    });
    
    const buffer = Buffer.concat(chunks);
    const bufferMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`[uploadCoachMedia] Buffer created: ${bufferMB} MB`);

    // Загружаем в Cloud Storage
    console.log(`[uploadCoachMedia] ☁️ Uploading to GCS: ${destinationPath}`);
    const uploadStartTime = Date.now();
    const bucket = storage.bucket(COACH_MEDIA_BUCKET);
    const file = bucket.file(destinationPath);
    
    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          userId: userId.toString(),
          uploadedAt: new Date().toISOString(),
          fileType,
          telegramFileId: fileId,
          originalFileName: filePath.split('/').pop() || 'unknown'
        }
      }
    });

    const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
    const publicUrl = `https://storage.googleapis.com/${COACH_MEDIA_BUCKET}/${destinationPath}`;
    console.log(`[uploadCoachMedia] ✅ Upload complete in ${uploadTime}s! Public URL: ${publicUrl}`);

    // Обновляем профиль пользователя в Firestore
    console.log('[uploadCoachMedia] Updating user profile in Firestore...');
    const userDoc = await firestore.collection(USERS_COLLECTION).doc(userId.toString()).get();
    
    if (userDoc.exists) {
      const profile = userDoc.data() as UserProfile;
      if (profile && profile.coachMedia) {
        // Находим медиа-объект по fileId и добавляем publicUrl
        const mediaItem = profile.coachMedia.find(item => item.fileId === fileId);
        if (mediaItem) {
          mediaItem.publicUrl = publicUrl;
          await firestore.collection(USERS_COLLECTION).doc(userId.toString()).set(profile, { merge: true });
          console.log('[uploadCoachMedia] ✅ Profile updated with public URL');
        } else {
          console.warn('[uploadCoachMedia] ⚠️ Media item with fileId not found in profile');
        }
      } else {
        console.warn('[uploadCoachMedia] ⚠️ No coachMedia array in profile');
      }
    } else {
      console.warn('[uploadCoachMedia] ⚠️ User profile not found');
    }

    // Отправляем успешный ответ
    res.status(200).json({
      success: true,
      publicUrl,
      fileSize: buffer.length,
      fileType
    });

  } catch (error) {
    console.error('[uploadCoachMedia] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
