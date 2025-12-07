// Названия площадок для отображения (теннис)
export const TENNIS_COURT_NAMES: Record<string, string> = {
  "impuls": "Импульс",
  "spartak-grunt": "Спартак» — крытый грунт",
  "spartak-hard": "Спартак» — хард",
  "itc-tsaritsyno": "ITC by WeGym «Царицыно»",
  "itc-mytischy": "ITC by WeGym «Мытищи»",
  "vidnyysport": "Видный Спорт",
  "pro-tennis-kashirka": "PRO TENNIS на Каширке",
  "megasport-tennis": "Мегаспорт",
  "gallery-cort": "The Tennis Club Gallery",
  "tennis-capital": "Tennis Capital",
  "luzhniki-tennis": "Лужники",
  "cooltennis-baumanskaya": "CoolTennis Бауманская",
  "olonetskiy": "Олонецкий",
  "slice-tennis": "Slice"
};

// Ссылки на бронирование кортов (теннис)
export const TENNIS_COURT_LINKS: Record<string, string> = {
  "impuls": "https://tennis-impuls.ru/schedule/",
  "spartak-grunt": "https://tenniscentre-spartak.ru/arenda/",
  "spartak-hard": "https://tenniscentre-spartak.ru/arenda/",
  "itc-tsaritsyno": "https://wegym.ru/tennis/tsaritsyno/",
  "itc-mytischy": "https://tenniscentr.ru/schedule/?type=rent",
  "vidnyysport": "https://vidnyysport.ru/tennisclub/raspisanie?type=rent",
  "pro-tennis-kashirka": "https://myprotennis.ru/#rec848407151",
  "megasport-tennis": "https://www.mstennis.ru/tennisnye-korty.aspx",
  "gallery-cort": "https://www.gltennis.ru/tennis",
  "tennis-capital": "https://tenniscapital.ru/rent",
  "luzhniki-tennis": "https://tennis.luzhniki.ru/#courts",
  "cooltennis-baumanskaya": "https://cooltennis.ru/timetable",
  "olonetskiy": "https://findsport.ru/playground/5154",
  "slice-tennis": "https://slicetennis-club.com/"
};

// Ссылки на карты кортов (теннис)
export const TENNIS_COURT_MAPS: Record<string, string> = {
  "spartak-grunt": "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  "spartak-hard": "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  "itc-tsaritsyno": "https://yandex.ru/maps/org/wegym/113604721914/?ll=37.648751%2C55.608562&z=16.67",
  "itc-mytischy": "https://yandex.ru/maps/org/tennisny_tsentr_mytishchi/1069246291/?ll=37.777518%2C55.929636&z=16.96",
  "tennis-capital": "https://yandex.ru/maps/org/tennis_capital/224212200985/?ll=37.496897%2C55.827879&z=14",
  "pro-tennis-kashirka": "https://yandex.ru/maps/org/protennis/120107923310/?indoorLevel=1&ll=37.642770%2C55.654482&z=16.96",
  "cooltennis-baumanskaya": "https://yandex.ru/maps/org/cooltennis/191864026500?si=1c1bjdpvc13h2wtg1u9ybe8m1c",
  "megasport-tennis": "https://yandex.ru/maps/org/megasport_tennis/1115449195/?ll=37.496299%2C55.651212&z=16.96",
  "luzhniki-tennis": "https://yandex.ru/maps/org/dvorets_tennisa_luzhniki/2495166648/?indoorLevel=1&ll=37.564221%2C55.712837&z=16.96",
  "slice-tennis": "https://yandex.ru/maps/org/slays/146210327632/?ll=37.753802%2C55.667452&z=16.96",
  "gallery-cort": "https://yandex.ru/maps/org/galereya/1366934557/?ll=37.715830%2C55.680707&z=16.96",
  "olonetskiy": "https://yandex.ru/maps/org/chempion/51651714906/?ll=37.662836%2C55.880622&z=16.67",
  "impuls": "https://yandex.ru/maps/org/tsentr_tennisnykh_tekhnologiy_impuls/226524913148/?ll=37.753979%2C55.884070&z=16.67",
  "vidnyysport": "https://yandex.ru/maps/org/i_love_tennis/15458668670/?ll=37.665431%2C55.551756&z=12.59"
};

// Маппинг метро/города для кортов (теннис)
export const TENNIS_COURT_METRO: Record<string, string> = {
  "spartak-grunt": "Сокольники",
  "spartak-hard": "Сокольники",
  "itc-tsaritsyno": "Кантемировская",
  "itc-mytischy": "Мытищи",
  "tennis-capital": "Войковская",
  "pro-tennis-kashirka": "Каширская",
  "cooltennis-baumanskaya": "Бауманская",
  "megasport-tennis": "Беляево",
  "luzhniki-tennis": "Лужники",
  "slice-tennis": "Братиславская",
  "gallery-cort": "Печатники",
  "olonetskiy": "Медведково",
  "impuls": "Мытищи",
  "vidnyysport": "Видное"
};

// Маппинг округов/районов для кортов (теннис)
export const TENNIS_COURT_DISTRICTS: Record<string, string> = {
  "spartak-grunt": "ВАО",
  "spartak-hard": "ВАО",
  "itc-tsaritsyno": "ЮАО",
  "itc-mytischy": "Мытищи",
  "tennis-capital": "САО",
  "pro-tennis-kashirka": "ЮАО",
  "cooltennis-baumanskaya": "ЦАО",
  "megasport-tennis": "ЮЗАО",
  "luzhniki-tennis": "ЦАО",
  "slice-tennis": "ЮВАО",
  "gallery-cort": "ЮВАО",
  "olonetskiy": "СВАО",
  "impuls": "Мытищи",
  "vidnyysport": "Видное"
};

// Список кортов, где в метро указан город (не станция метро)
export const TENNIS_COURT_IS_CITY: Record<string, boolean> = {
  "itc-mytischy": true,
  "impuls": true,
  "vidnyysport": true
};

// Маппинг кортов к локациям (теннис)
export const TENNIS_COURT_LOCATIONS: Record<string, string[]> = {
  "impuls": ["moscow-region"],
  "spartak-grunt": ["east"],
  "spartak-hard": ["east"],
  "itc-tsaritsyno": ["south"],
  "itc-mytischy": ["moscow-region"],
  "vidnyysport": ["moscow-region"],
  "pro-tennis-kashirka": ["south"],
  "megasport-tennis": ["south"],
  "gallery-cort": ["south"],
  "tennis-capital": ["north"],
  "luzhniki-tennis": ["center"],
  "cooltennis-baumanskaya": ["east"],
  "olonetskiy": ["north"],
  "slice-tennis": ["east"]
};

