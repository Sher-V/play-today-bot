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

// Конфигурация для Tennis77 API (tennis77.s20.online)
export interface Tennis77Config {
  name: string;           // Название площадки
  branchId: number;       // ID филиала (branch ID)
  authorization: string;   // Authorization токен
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  cookie?: string;        // Cookie для авторизации (опционально)
  referer?: string;        // Referer URL (опционально)
  roomNames?: Record<number, string>;  // Маппинг ID корта -> название (опционально)
}

// Конфигурация для Tennis.ru API (prilt.tennis.ru)
export interface TennisRuConfig {
  name: string;           // Название площадки
  clubId: string;         // ID клуба (UUID)
  authToken: string;      // Basic auth токен
  daysAhead?: number;     // На сколько дней вперёд (по умолчанию 14)
  courtIds?: string[];    // Список ID кортов для фильтрации (опционально, если не задан - берутся все)
  courtNames?: Record<string, string>;  // Маппинг courtId -> название корта (опционально)
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
  {
    name: TennisSiteId.SPORTVSEGDA_YANTAR,
    clubId: "7af39aae-6932-11f0-bb9a-14187753eeff",
    clubTitle: "Янтарь",
    serviceId: "0cb62d58-93ac-11f0-bb9c-14187753eeff",
    apiKey: "f6ae8b4b-165e-407f-90bc-e0f58c758760",
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
    name: TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA,
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffId: 2772203
  },
  {
    name: TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA,
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      2480431: "Корт 1",
      2535545: "Корт 2"
    }
  },
  {
    name: TennisSiteId.TENNIS_CAPITAL_YUZHNAYA,
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffIds: {
      3300652: "Корт 1",
      3057405: "Корт 2"
    }
  },
  {
    name: TennisSiteId.TENNIS_CAPITAL_VDNH,
    locationId: 818035,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b876619.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffId: 4841235
  },
  {
    name: TennisSiteId.REZIDENCYA,
    locationId: 1241053,
    authToken: "gtcwf654agufy25gsadh",
    origin: "https://b1365963.yclients.com",
    daysAhead: 14,
    slotDuration: 60,
    staffId: null
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

// ⬇️ КОНФИГУРАЦИИ RESERVI.RU (1C) - ПАДЕЛ ⬇️
export const SITE_PADEL_CONFIGS: SiteConfig[] = [
  {
    name: PadelSiteId.KORTY_SETKI,
    clubId: "2db37df2-20f6-11f0-872a-00505683cb0f",
    clubTitle: "КОРТЫ-СЕТКИ",
    serviceId: "71d50edc-24da-11f0-9586-00505683cb0f",
    apiKey: "fcc5fc45-cd9a-4725-91ef-f9775654a2d8",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_VIDNOE,
    clubId: "a66dd8e3-ada8-11f0-bb9c-14187753eeff",
    clubTitle: "Падел Арктика",
    serviceId: "277a0aff-a4e7-11f0-bb9c-14187753eeff",
    apiKey: "74cceffd-1f2f-4571-86cd-8bf1c8a38687",
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ VIVACRM (api.vivacrm.ru) - ТЕННИС ⬇️
export const VIVACRM_CONFIGS: VivaCrmConfig[] = [
  {
    name: TennisSiteId.LUZHNIKI_TENNIS,
    tenantId: "ajV1T2",
    serviceId: "77075a2c-873a-411f-8073-028a2051cf2d",
    origin: "https://tennis.luzhniki.ru",
    daysAhead: 14
  },
];

// ⬇️ КОНФИГУРАЦИИ VIVACRM (api.vivacrm.ru) - ПАДЕЛ ⬇️
export const VIVACRM_PADEL_CONFIGS: VivaCrmConfig[] = [
  {
    name: PadelSiteId.PADEL_HUB_NAGATINSKAYA,
    tenantId: "iSkq6G",
    serviceId: "22b928b2-1ba6-4491-bc43-756676fcd723",
    origin: "https://padlhub.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM,
    tenantId: "iSkq6G",
    serviceId: "1c54e3b4-0421-482e-8faf-0c1cd5fdaf3d",
    origin: "https://padlhub.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_HUB_TEREKHOVO,
    tenantId: "iSkq6G",
    serviceId: "2f4155ad-7bc0-4a15-a12c-da7fce15c37a",
    origin: "https://padlhub.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_HUB_YASENEVO,
    tenantId: "iSkq6G",
    serviceId: "d9a5061a-e027-4960-9029-4bf5ec8a0c64",
    origin: "https://padlhub.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_HUB_SKOLKOVO,
    tenantId: "iSkq6G",
    serviceId: "e2caa535-6660-479a-bd32-3638ba7f6b89",
    origin: "https://padlhub.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.MOSCOW_PDL_LUZHNIKI,
    tenantId: "wTksKv",
    serviceId: "08b5ef55-d1b4-4736-8152-4d5d5c52a4ab",
    origin: "https://moscowpdl.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_NOK_KRYLATSKOE,
    tenantId: "l8jvFs",
    serviceId: "cbbb9a75-810f-4801-98ac-f3030e272862",
    origin: "https://padelnok.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PARI_PADEL_SEVER,
    tenantId: "lhfQ7C",
    serviceId: "5bdeab67-be8d-4cc5-8292-2383552b601c",
    origin: "https://paripadel.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.FIRST_PADEL_CLUB,
    tenantId: "4yMzOR",
    serviceId: "ecccea4a-a342-4e75-a8ba-983dd51044ca",
    origin: "https://firstpadel.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.ZARYAD_PADEL,
    tenantId: "RZlKfH",
    serviceId: "79abb681-df51-4436-afa5-b2771d3c508d",
    origin: "https://zaryadpadel.ru",
    daysAhead: 14
  },
  {
    name: PadelSiteId.PADEL_LEND,
    tenantId: "MxQjPt",
    serviceId: "d2fce4fb-4456-40ce-b520-6f4fb055058f",
    origin: "https://pdlland.ru",
    daysAhead: 7
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
  {
    name: TennisSiteId.ENERGIYA_STADIUM,
    playgroundId: "2137",
    courts: {
      "1700": "Корт 1",
      "1702": "Корт 2"
    },
    daysAhead: 7,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; phpsession=cf6438fb8c534abc640608072d387832"
  },
  {
    name: TennisSiteId.LIGA_TENNIS,
    playgroundId: "3888",
    courts: {
      "7260": "Корт 1"
    },
    daysAhead: 14,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; _ym_uid=1763209980723118928; _ym_d=1764700585; phpsession=ad1f77ef528b752f58e6f49c67605d82; _ym_isad=2; _ym_visorc=w; cookieConsent=accepted"
  },
  {
    name: TennisSiteId.TENNISTIME,
    playgroundId: "4783",
    courts: {
      "9028": "Корт 1",
      "9029": "Корт 2",
      "9030": "Корт 3"
    },
    daysAhead: 14,
    cookie: "fs__fsm=4857157e7d42886255baa3216a7abdbf; fs_geo_requested_by_ip=1; _ym_uid=1763209980723118928; _ym_d=1764700585; phpsession=ad1f77ef528b752f58e6f49c67605d82; _ym_isad=2; _ym_visorc=w; cookieConsent=accepted"
  },
];

// ⬇️ КОНФИГУРАЦИИ TENNIS77 (tennis77.s20.online) ⬇️
export const TENNIS77_CONFIGS: Tennis77Config[] = [
  {
    name: TennisSiteId.TENNIS77_BELOKAMENNAYA,
    branchId: 19, // branch ID для Белокаменной
    authorization: "3cc05624dfa5820c5f967a654e51dbab",
    daysAhead: 14,
    cookie: "PHPSESSID=cdc4iar48qd67r2pc1729ulpla; _csrf=a4393f90f357b9f5c15e5cdd393e6f2d0aaa792c95e0c726e31d9ad16ad810ffa%3A2%3A%7Bi%3A0%3Bs%3A5%3A%22_csrf%22%3Bi%3A1%3Bs%3A32%3A%22Ako_u2HvQj_lG-MM0M94_qw76zvLWfSZ%22%3B%7D",
    referer: "https://tennis77.s20.online/common/1/online-schedule?data_pc=59CD90&data_locale=ru&showAvailableForEnroll=true&week_selected=51"
  },
  {
    name: TennisSiteId.TENNIS77_KURGANSKAYA,
    branchId: 10, // branch ID для Курганской
    authorization: "07973e99796377e6f5421a4bc379696e",
    daysAhead: 14,
    cookie: "PHPSESSID=cdc4iar48qd67r2pc1729ulpla; _csrf=a4393f90f357b9f5c15e5cdd393e6f2d0aaa792c95e0c726e31d9ad16ad810ffa%3A2%3A%7Bi%3A0%3Bs%3A5%3A%22_csrf%22%3Bi%3A1%3Bs%3A32%3A%22Ako_u2HvQj_lG-MM0M94_qw76zvLWfSZ%22%3B%7D",
    referer: "https://tennis77.s20.online/common/10/online-schedule?branch=10&locale=ru&pc=59CD90&crm=https://tennis77.s20.online&token=&appKey=07973e99796377e6f5421a4bc379696e"
  },
];

// ⬇️ КОНФИГУРАЦИИ TENNIS.RU (prilt.tennis.ru) ⬇️
export const TENNIS_RU_CONFIGS: TennisRuConfig[] = [
  {
    name: TennisSiteId.TENNIS_RU,
    clubId: "d4fc8381-e486-11ea-80c3-ac1f6bb3f7d3",
    authToken: "V2Vic2VydmljZTpyaGV1anZkaGZ1Yg==",
    daysAhead: 14,
    courtIds: [
      "39df27c8-eb55-11e9-9ab5-382c4a64b65a",
      "4f0b42a8-eb55-11e9-9ab5-382c4a64b65a",
      "58234368-eb55-11e9-9ab5-382c4a64b65a",
      "05e09479-574c-11ec-80d6-ac1f6bb3f7d2",
      "c3eae3fc-87b6-11e5-a889-382c4a64b65a",
      "2a518b48-8e3e-11e5-a934-382c4a64b65a",
      "33e088c0-8e3e-11e5-a934-382c4a64b65a",
      "3bfc30f0-8e3e-11e5-a934-382c4a64b65a",
      "710efc8a-797d-11ee-80c3-ac1f6bea5f2d"
    ]
  },
];

export const API_URL = 'https://reservi.ru/api-fit1c/json/v2/';

