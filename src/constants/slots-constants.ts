import { TennisSiteId } from './tennis-constants';
import { PadelSiteId } from './padel-constants';

// Конфигурация для запросов к reservi.ru (Импульс, Спартак, ITC)
export interface SiteConfig {
  name: string;           // Название площадки для идентификации
  clubId: string;         // ID клуба
  clubTitle: string;      // Название клуба
  apiKey: string;         // API ключ площадки
  serviceId?: string;     // ID услуги (для Импульс)
  useSalonId?: boolean;   // Использовать salonId вместо service_id (для Спартак)
  daysAhead?: number;     // На сколько дней вперёд запрашивать (по умолчанию 7)
}

// Конфигурация для YClients API
export interface YClientsConfig {
  name: string;           // Название площадки
  locationId: number;     // ID локации в YClients
  authToken: string;      // Bearer токен для авторизации
  origin: string;         // Origin для CORS (например: https://b1044864.yclients.com)
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  slotDuration?: number;  // Длительность слота в минутах (по умолчанию 60)
  roomName?: string | null; // Название зала/корта (опционально)
  staffId?: number | null;  // staff_id для запроса (по умолчанию null)
  staffIds?: { [staffId: number]: string }; // Маппинг staff_id -> название корта (для нескольких кортов)
}

// Конфигурация для VivaCRM API (api.vivacrm.ru)
export interface VivaCrmConfig {
  name: string;           // Название площадки
  tenantId: string;       // ID тенанта в URL (например: ajV1T2)
  serviceId: string;      // ID услуги (master-service)
  origin: string;         // Origin для CORS
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
}

// Конфигурация для MoyKlass API (app.moyklass.com)
export interface MoyKlassConfig {
  name: string;           // Название площадки
  widgetId: string;       // ID виджета из URL
  origin: string;         // Origin для CORS (например: https://cooltennis.ru)
  weeksAhead?: number;    // На сколько недель вперёд (по умолчанию 2)
}

// Конфигурация для FindSport API (findsport.ru)
export interface FindSportConfig {
  name: string;           // Название площадки
  playgroundId: string;   // ID площадки в URL (например: 5154)
  courts: Record<string, string>;  // Маппинг ID корта -> название (например: { "9702": "Корт 2" })
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  cookie?: string;        // Cookie для авторизации (опционально)
}

// ⬇️ КОНФИГУРАЦИИ ПЛОЩАДОК ⬇️
export const SITE_CONFIGS: SiteConfig[] = [
  {
    name: TennisSiteId.IMPULS,
    clubId: "944b2756-15b3-11ea-80c2-0025902e02c1",
    clubTitle: "ИМПУЛЬС",
    serviceId: "411cd3d2-1754-11ea-80c2-0025902e02c1",
    apiKey: "84aacea4-922c-4c13-b779-42b10b961d0f",
    daysAhead: 14
  },
  {
    name: TennisSiteId.SPARTAK_GRUNT,
    clubId: "5a810c4f-9f36-11ea-bbca-0050568bac88",
    clubTitle: "КРЫТЫЕ КОРТЫ ГРУНТ",
    apiKey: "81059286-b4a9-4069-9fe8-1420f6773265",
    useSalonId: true,
    daysAhead: 14
  },
  {
    name: TennisSiteId.SPARTAK_HARD,
    clubId: "53f148cf-9f36-11ea-bbca-0050568bac88",
    clubTitle: "КРЫТЫЕ КОРТЫ ХАРД",
    apiKey: "81059286-b4a9-4069-9fe8-1420f6773265",
    useSalonId: true,
    daysAhead: 14
  },
  {
    name: TennisSiteId.ITC_TSARITSYNO,
    clubId: "575773d6-2845-11ed-168d-0050568369e4",
    clubTitle: "ITC by WeGym Теннисный Центр Царицыно",
    serviceId: "4c590be8-284a-11ed-e888-0050568369e4",
    apiKey: "1362fca0-3747-46fb-894d-e6dc16b52608",
    daysAhead: 14
  },
  {
    name: TennisSiteId.ITC_MYTISCHY,
    clubId: "da3c3c8b-b4b0-11eb-bbf6-0050568342b3",
    clubTitle: "ITC by WeGym Теннисный Центр Мытищи",
    serviceId: "6732c6ae-b971-11eb-bbf6-0050568342b3",
    apiKey: "14d225bc-2d69-40c9-92be-f949252fd250",
    daysAhead: 14
  },
  {
    name: TennisSiteId.VIDNYSPORT,
    clubId: "b52ec86b-b7b5-11eb-80ed-ee78ef712c1b",
    clubTitle: 'Теннисный клуб "I Love Tennis"',
    apiKey: "f1177549-d4aa-4480-8f6e-3543a6c41005",
    useSalonId: true,  // Нет service_id, используем salonId формат
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ YCLIENTS (platform.yclients.com) - ТЕННИС ⬇️
export const YCLIENTS_CONFIGS: YClientsConfig[] = [
  {
    name: TennisSiteId.PRO_TENNIS_KASHIRKA,
    locationId: 967881,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1044864.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
  },
  {
    name: TennisSiteId.MEGASPORT_TENNIS,
    locationId: 852917,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b916289.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
  },
  {
    name: TennisSiteId.GALLERY_CORT,
    locationId: 693093,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b735517.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: null  // Этот корт использует staff_id: null
  },
  {
    name: TennisSiteId.TENNIS_CAPITAL,
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      2480431: "Корт 1",
      2535545: "Корт 2",
      3900730: "Корт 3",
      3900734: "Корт 4",
      2772203: "Корт 5",
      3300652: "Корт 6",
      3057405: "Корт 7"
    }
  },
];

// ⬇️ КОНФИГУРАЦИИ YCLIENTS (platform.yclients.com) - ПАДЕЛ ⬇️
export const YCLIENTS_PADEL_CONFIGS: YClientsConfig[] = [
  {
    name: PadelSiteId.ROCKET_PADEL_CLUB,
    locationId: 1478703,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1647756.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: PadelSiteId.PADEL_FRIENDS,
    locationId: 804153,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b861100.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: PadelSiteId.BUENOS_PADEL,
    locationId: 1457979,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1555275.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      4268232: "Корт 1",
      4486944: "Корт 2",
      4486947: "Корт 3",
      4486950: "Корт 4",
      4486953: "Корт 5",
      4486956: "Корт 6",
      4486965: "Корт 7",
      4486974: "Корт 8"
    }
  },
  {
    name: PadelSiteId.PADEL_BELOZER,
    locationId: 1583670,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1781322.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA,
    locationId: 1450185,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1776180.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH,
    locationId: 1553949,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1776180.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: PadelSiteId.UP2_PADEL,
    locationId: 1288180,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1422626.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: PadelSiteId.BANDEHAARENACLUB,
    locationId: 1449294,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1612373.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null
    // staffId не задан (undefined) - поле staff_id не будет включено в запрос
  },
  {
    name: PadelSiteId.ORBITA_TENNIS,
    locationId: 1066130,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1159028.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
  {
    name: PadelSiteId.V_PADEL,
    locationId: 1441312,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://n1602942.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    roomName: null,
    staffId: -1  // Используем staff_id: -1 как в примере запроса
  },
];

export const YCLIENTS_API_URL = 'https://platform.yclients.com/api/v1/b2c/booking/availability/search-timeslots';

// ⬇️ КОНФИГУРАЦИИ VIVACRM (api.vivacrm.ru) ⬇️
export const VIVACRM_CONFIGS: VivaCrmConfig[] = [
  {
    name: TennisSiteId.LUZHNIKI_TENNIS,
    tenantId: "ajV1T2",
    serviceId: "77075a2c-873a-411f-8073-028a2051cf2d",
    origin: "https://tennis.luzhniki.ru",
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ MOYKLASS (app.moyklass.com) ⬇️
export const MOYKLASS_CONFIGS: MoyKlassConfig[] = [
  {
    name: TennisSiteId.COOLTENNIS_BAUMANSKAYA,
    widgetId: "01RNDZfjBowzq7hT06oW4BJJi7TGoyMtovbx",
    origin: "https://cooltennis.ru",
    weeksAhead: 2
  },
];

// ⬇️ КОНФИГУРАЦИИ FINDSPORT (findsport.ru) ⬇️
export const FINDSPORT_CONFIGS: FindSportConfig[] = [
  {
    name: TennisSiteId.OLONETSKIY,
    playgroundId: "5154",
    courts: {
      "9702": "Корт 2",
      "9703": "Корт 3",
      "9704": "Корт 4",
      "9705": "Корт 5"
    },
    daysAhead: 7,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; phpsession=cf6438fb8c534abc640608072d387832"
  },
  {
    name: TennisSiteId.SLICE_TENNIS,
    playgroundId: "4749",
    courts: {
      "8958": "Корт 1",
      "8959": "Корт 2",
      "8960": "Корт 3",
      "8961": "Корт 4",
      "8962": "Корт 5"
    },
    daysAhead: 7,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; phpsession=cf6438fb8c534abc640608072d387832"
  },
];

export const API_URL = 'https://reservi.ru/api-fit1c/json/v2/';

