/**
 * Интеграция с ЮKassa API v3 для создания платежей.
 * Переменные окружения: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY.
 * Опционально: YOOKASSA_RETURN_URL — куда вернуть пользователя после оплаты.
 */

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

export interface YooKassaPaymentResult {
  paymentId: string;
  confirmationUrl: string;
}

/**
 * Создаёт платёж в ЮKassa и возвращает ссылку на оплату.
 * @param amountRub Сумма в рублях (число)
 * @param description Описание платежа (отображается пользователю)
 * @param idempotenceKey Уникальный ключ (например reservationId), чтобы не создавать дубликаты
 * @param metadata Метаданные для вебхука (reservation_id и т.д.)
 * @param returnUrl URL, куда вернуть пользователя после оплаты (опционально)
 */
export async function createYooKassaPayment(
  amountRub: number,
  description: string,
  idempotenceKey: string,
  metadata: Record<string, string> = {},
  returnUrl?: string
): Promise<YooKassaPaymentResult | null> {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    console.error('[yookassa] YOOKASSA_SHOP_ID or YOOKASSA_SECRET_KEY not set');
    return null;
  }

  const value = amountRub.toFixed(2);
  const url = returnUrl || process.env.YOOKASSA_RETURN_URL || 'https://t.me/play_today_bot';

  const body = {
    amount: { value, currency: 'RUB' },
    description,
    metadata: { ...metadata, reservation_id: idempotenceKey },
    confirmation: { type: 'redirect' as const, return_url: url },
    capture: true,
  };

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  try {
    const response = await fetch(YOOKASSA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[yookassa] API error', response.status, text);
      return null;
    }

    const data = (await response.json()) as {
      id?: string;
      status?: string;
      confirmation?: { confirmation_url?: string };
    };
    const confirmationUrl = data.confirmation?.confirmation_url;
    if (!data.id || !confirmationUrl) {
      console.error('[yookassa] No id or confirmation_url in response', data);
      return null;
    }
    return { paymentId: data.id, confirmationUrl };
  } catch (error) {
    console.error('[yookassa] createPayment error', error);
    return null;
  }
}
