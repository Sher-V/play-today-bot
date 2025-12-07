// Enum для ID теннисных площадок
export enum TennisSiteId {
  IMPULS = "impuls",
  SPARTAK_GRUNT = "spartak-grunt",
  SPARTAK_HARD = "spartak-hard",
  ITC_TSARITSYNO = "itc-tsaritsyno",
  ITC_MYTISCHY = "itc-mytischy",
  VIDNYSPORT = "vidnyysport",
  PRO_TENNIS_KASHIRKA = "pro-tennis-kashirka",
  MEGASPORT_TENNIS = "megasport-tennis",
  GALLERY_CORT = "gallery-cort",
  TENNIS_CAPITAL = "tennis-capital",
  LUZHNIKI_TENNIS = "luzhniki-tennis",
  COOLTENNIS_BAUMANSKAYA = "cooltennis-baumanskaya",
  OLONETSKIY = "olonetskiy",
  SLICE_TENNIS = "slice-tennis"
}

// Названия площадок для отображения (теннис)
export const TENNIS_COURT_NAMES: Record<string, string> = {
  [TennisSiteId.IMPULS]: "Импульс",
  [TennisSiteId.SPARTAK_GRUNT]: "Спартак» — крытый грунт",
  [TennisSiteId.SPARTAK_HARD]: "Спартак» — хард",
  [TennisSiteId.ITC_TSARITSYNO]: "ITC by WeGym «Царицыно»",
  [TennisSiteId.ITC_MYTISCHY]: "ITC by WeGym «Мытищи»",
  [TennisSiteId.VIDNYSPORT]: "Видный Спорт",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "PRO TENNIS на Каширке",
  [TennisSiteId.MEGASPORT_TENNIS]: "Мегаспорт",
  [TennisSiteId.GALLERY_CORT]: "The Tennis Club Gallery",
  [TennisSiteId.TENNIS_CAPITAL]: "Tennis Capital",
  [TennisSiteId.LUZHNIKI_TENNIS]: "Лужники",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "CoolTennis Бауманская",
  [TennisSiteId.OLONETSKIY]: "Олонецкий",
  [TennisSiteId.SLICE_TENNIS]: "Slice"
};

// Ссылки на бронирование кортов (теннис)
export const TENNIS_COURT_LINKS: Record<string, string> = {
  [TennisSiteId.IMPULS]: "https://tennis-impuls.ru/schedule/",
  [TennisSiteId.SPARTAK_GRUNT]: "https://tenniscentre-spartak.ru/arenda/",
  [TennisSiteId.SPARTAK_HARD]: "https://tenniscentre-spartak.ru/arenda/",
  [TennisSiteId.ITC_TSARITSYNO]: "https://wegym.ru/tennis/tsaritsyno/",
  [TennisSiteId.ITC_MYTISCHY]: "https://tenniscentr.ru/schedule/?type=rent",
  [TennisSiteId.VIDNYSPORT]: "https://vidnyysport.ru/tennisclub/raspisanie?type=rent",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "https://myprotennis.ru/#rec848407151",
  [TennisSiteId.MEGASPORT_TENNIS]: "https://www.mstennis.ru/tennisnye-korty.aspx",
  [TennisSiteId.GALLERY_CORT]: "https://www.gltennis.ru/tennis",
  [TennisSiteId.TENNIS_CAPITAL]: "https://tenniscapital.ru/rent",
  [TennisSiteId.LUZHNIKI_TENNIS]: "https://tennis.luzhniki.ru/#courts",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "https://cooltennis.ru/timetable",
  [TennisSiteId.OLONETSKIY]: "https://findsport.ru/playground/5154",
  [TennisSiteId.SLICE_TENNIS]: "https://slicetennis-club.com/"
};

// Ссылки на карты кортов (теннис)
export const TENNIS_COURT_MAPS: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  [TennisSiteId.SPARTAK_HARD]: "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  [TennisSiteId.ITC_TSARITSYNO]: "https://yandex.ru/maps/org/wegym/113604721914/?ll=37.648751%2C55.608562&z=16.67",
  [TennisSiteId.ITC_MYTISCHY]: "https://yandex.ru/maps/org/tennisny_tsentr_mytishchi/1069246291/?ll=37.777518%2C55.929636&z=16.96",
  [TennisSiteId.TENNIS_CAPITAL]: "https://yandex.ru/maps/org/tennis_capital/224212200985/?ll=37.496897%2C55.827879&z=14",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "https://yandex.ru/maps/org/protennis/120107923310/?indoorLevel=1&ll=37.642770%2C55.654482&z=16.96",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "https://yandex.ru/maps/org/cooltennis/191864026500?si=1c1bjdpvc13h2wtg1u9ybe8m1c",
  [TennisSiteId.MEGASPORT_TENNIS]: "https://yandex.ru/maps/org/megasport_tennis/1115449195/?ll=37.496299%2C55.651212&z=16.96",
  [TennisSiteId.LUZHNIKI_TENNIS]: "https://yandex.ru/maps/org/dvorets_tennisa_luzhniki/2495166648/?indoorLevel=1&ll=37.564221%2C55.712837&z=16.96",
  [TennisSiteId.SLICE_TENNIS]: "https://yandex.ru/maps/org/slays/146210327632/?ll=37.753802%2C55.667452&z=16.96",
  [TennisSiteId.GALLERY_CORT]: "https://yandex.ru/maps/org/galereya/1366934557/?ll=37.715830%2C55.680707&z=16.96",
  [TennisSiteId.OLONETSKIY]: "https://yandex.ru/maps/org/chempion/51651714906/?ll=37.662836%2C55.880622&z=16.67",
  [TennisSiteId.IMPULS]: "https://yandex.ru/maps/org/tsentr_tennisnykh_tekhnologiy_impuls/226524913148/?ll=37.753979%2C55.884070&z=16.67",
  [TennisSiteId.VIDNYSPORT]: "https://yandex.ru/maps/org/i_love_tennis/15458668670/?ll=37.665431%2C55.551756&z=12.59"
};

// Маппинг метро/города для кортов (теннис)
export const TENNIS_COURT_METRO: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "Сокольники",
  [TennisSiteId.SPARTAK_HARD]: "Сокольники",
  [TennisSiteId.ITC_TSARITSYNO]: "Кантемировская",
  [TennisSiteId.ITC_MYTISCHY]: "Мытищи",
  [TennisSiteId.TENNIS_CAPITAL]: "Войковская",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "Каширская",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "Бауманская",
  [TennisSiteId.MEGASPORT_TENNIS]: "Беляево",
  [TennisSiteId.LUZHNIKI_TENNIS]: "Лужники",
  [TennisSiteId.SLICE_TENNIS]: "Братиславская",
  [TennisSiteId.GALLERY_CORT]: "Печатники",
  [TennisSiteId.OLONETSKIY]: "Медведково",
  [TennisSiteId.IMPULS]: "Мытищи",
  [TennisSiteId.VIDNYSPORT]: "Видное"
};

// Маппинг округов/районов для кортов (теннис)
export const TENNIS_COURT_DISTRICTS: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "ВАО",
  [TennisSiteId.SPARTAK_HARD]: "ВАО",
  [TennisSiteId.ITC_TSARITSYNO]: "ЮАО",
  [TennisSiteId.ITC_MYTISCHY]: "Мытищи",
  [TennisSiteId.TENNIS_CAPITAL]: "САО",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "ЮАО",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "ЦАО",
  [TennisSiteId.MEGASPORT_TENNIS]: "ЮЗАО",
  [TennisSiteId.LUZHNIKI_TENNIS]: "ЦАО",
  [TennisSiteId.SLICE_TENNIS]: "ЮВАО",
  [TennisSiteId.GALLERY_CORT]: "ЮВАО",
  [TennisSiteId.OLONETSKIY]: "СВАО",
  [TennisSiteId.IMPULS]: "Мытищи",
  [TennisSiteId.VIDNYSPORT]: "Видное"
};

// Список кортов, где в метро указан город (не станция метро)
export const TENNIS_COURT_IS_CITY: Record<string, boolean> = {
  [TennisSiteId.ITC_MYTISCHY]: true,
  [TennisSiteId.IMPULS]: true,
  [TennisSiteId.VIDNYSPORT]: true
};

// Маппинг кортов к локациям (теннис)
export const TENNIS_COURT_LOCATIONS: Record<string, string[]> = {
  [TennisSiteId.IMPULS]: ["moscow-region"],
  [TennisSiteId.SPARTAK_GRUNT]: ["east"],
  [TennisSiteId.SPARTAK_HARD]: ["east"],
  [TennisSiteId.ITC_TSARITSYNO]: ["south"],
  [TennisSiteId.ITC_MYTISCHY]: ["moscow-region"],
  [TennisSiteId.VIDNYSPORT]: ["moscow-region"],
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: ["south"],
  [TennisSiteId.MEGASPORT_TENNIS]: ["south"],
  [TennisSiteId.GALLERY_CORT]: ["south"],
  [TennisSiteId.TENNIS_CAPITAL]: ["north"],
  [TennisSiteId.LUZHNIKI_TENNIS]: ["center"],
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: ["east"],
  [TennisSiteId.OLONETSKIY]: ["north"],
  [TennisSiteId.SLICE_TENNIS]: ["east"]
};

