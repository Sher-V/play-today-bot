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
  TENNIS_CAPITAL_VOISKOVSKAYA = "tennis-capital-voiskovskaya",
  TENNIS_CAPITAL_SAVELOVSKAYA = "tennis-capital-savelovskaya",
  TENNIS_CAPITAL_YUZHNAYA = "tennis-capital-yuzhnaya",
  TENNIS_CAPITAL_VDNH = "tennis-capital-vdnh",
  LUZHNIKI_TENNIS = "luzhniki-tennis",
  COOLTENNIS_BAUMANSKAYA = "cooltennis-baumanskaya",
  OLONETSKIY = "olonetskiy",
  SLICE_TENNIS = "slice-tennis",
  SPORTVSEGDA_YANTAR = "sportvsegda-yantar",
  ENERGIYA_STADIUM = "energiya-stadium",
  TENNIS77_BELOKAMENNAYA = "tennis77-belokamennaya",
  TENNIS77_KURGANSKAYA = "tennis77-kurganskaya",
  LIGA_TENNIS = "liga-tennis",
  TENNISTIME = "tennistime",
  REZIDENCYA = "rezidenciya"
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
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: "Tennis Capital Войковская",
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: "Tennis Capital Савеловская",
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: "Tennis Capital Южная",
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: "Tennis Capital ВДНХ",
  [TennisSiteId.LUZHNIKI_TENNIS]: "Лужники",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "CoolTennis Бауманская",
  [TennisSiteId.OLONETSKIY]: "Чемпион",
  [TennisSiteId.SLICE_TENNIS]: "Slice",
  [TennisSiteId.SPORTVSEGDA_YANTAR]: "Теннис СпортВсегда Янтарь",
  [TennisSiteId.ENERGIYA_STADIUM]: "Стадион «Энергия»",
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: "Tennis77 Белокаменная",
  [TennisSiteId.TENNIS77_KURGANSKAYA]: "Tennis77 Курганская",
  [TennisSiteId.LIGA_TENNIS]: "Лига Теннис",
  [TennisSiteId.TENNISTIME]: "TennisTime (Lawn Tennis Club)",
  [TennisSiteId.REZIDENCYA]: "Теннисный центр Резиденция"
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
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: "https://tenniscapital.ru/rent",
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: "https://tenniscapital.ru/rent",
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: "https://tenniscapital.ru/rent",
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: "https://tenniscapital.ru/rent",
  [TennisSiteId.LUZHNIKI_TENNIS]: "https://tennis.luzhniki.ru/#courts",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "https://cooltennis.ru/timetable",
  [TennisSiteId.OLONETSKIY]: "https://findsport.ru/playground/5154",
  [TennisSiteId.SLICE_TENNIS]: "https://slicetennis-club.com/",
  [TennisSiteId.SPORTVSEGDA_YANTAR]: "https://tennisclubstrogino.ru/arenda/",
  [TennisSiteId.ENERGIYA_STADIUM]: "https://findsport.ru/playground/2137",
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: "https://tennis77.com/korty/belokamennaya/",
  [TennisSiteId.TENNIS77_KURGANSKAYA]: "https://tennis77.com/korty/kurganskaya/",
  [TennisSiteId.LIGA_TENNIS]: "https://findsport.ru/playground/3888",
  [TennisSiteId.TENNISTIME]: "https://findsport.ru/playground/4783",
  [TennisSiteId.REZIDENCYA]: "https://tennis-centre.ru/"
};

// Ссылки на карты кортов (теннис)
export const TENNIS_COURT_MAPS: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  [TennisSiteId.SPARTAK_HARD]: "https://yandex.ru/maps/org/tennisny_tsentr_spartak/109398270822/?ll=37.681559%2C55.801618&z=15.67",
  [TennisSiteId.ITC_TSARITSYNO]: "https://yandex.ru/maps/org/wegym/113604721914/?ll=37.648751%2C55.608562&z=16.67",
  [TennisSiteId.ITC_MYTISCHY]: "https://yandex.ru/maps/org/tennisny_tsentr_mytishchi/1069246291/?ll=37.777518%2C55.929636&z=16.96",
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: "https://yandex.ru/maps/-/CLsAr4le",
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: "https://yandex.ru/maps/-/CLsArFOC",
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: "https://yandex.ru/maps/-/CLsArJ~O",
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: "https://yandex.ru/maps/-/CLs4jNyK",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "https://yandex.ru/maps/org/protennis/120107923310/?indoorLevel=1&ll=37.642770%2C55.654482&z=16.96",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "https://yandex.ru/maps/org/cooltennis/191864026500?si=1c1bjdpvc13h2wtg1u9ybe8m1c",
  [TennisSiteId.MEGASPORT_TENNIS]: "https://yandex.ru/maps/org/megasport_tennis/1115449195/?ll=37.496299%2C55.651212&z=16.96",
  [TennisSiteId.LUZHNIKI_TENNIS]: "https://yandex.ru/maps/org/dvorets_tennisa_luzhniki/2495166648/?indoorLevel=1&ll=37.564221%2C55.712837&z=16.96",
  [TennisSiteId.SLICE_TENNIS]: "https://yandex.ru/maps/org/slays/146210327632/?ll=37.753802%2C55.667452&z=16.96",
  [TennisSiteId.GALLERY_CORT]: "https://yandex.ru/maps/org/galereya/1366934557/?ll=37.715830%2C55.680707&z=16.96",
  [TennisSiteId.OLONETSKIY]: "https://yandex.ru/maps/org/chempion/51651714906/?ll=37.662836%2C55.880622&z=16.67",
  [TennisSiteId.IMPULS]: "https://yandex.ru/maps/org/tsentr_tennisnykh_tekhnologiy_impuls/226524913148/?ll=37.753979%2C55.884070&z=16.67",
  [TennisSiteId.VIDNYSPORT]: "https://yandex.ru/maps/org/i_love_tennis/15458668670/?ll=37.665431%2C55.551756&z=12.59",
  [TennisSiteId.SPORTVSEGDA_YANTAR]: "https://yandex.ru/maps/-/CLsyYJyX",
  [TennisSiteId.ENERGIYA_STADIUM]: "https://yandex.ru/maps/-/CLsyaY10",
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: "https://yandex.ru/maps/-/CLs~A6Jz",
  [TennisSiteId.TENNIS77_KURGANSKAYA]: "https://yandex.ru/maps/-/CLs~QQKg",
  [TennisSiteId.LIGA_TENNIS]: "https://yandex.ru/maps/-/CLs~UMLZ",
  [TennisSiteId.TENNISTIME]: "https://yandex.ru/maps/-/CLwaMAYu",
  [TennisSiteId.REZIDENCYA]: "https://yandex.ru/maps/-/CLw8RPLm"
};

// Маппинг метро/города для кортов (теннис)
export const TENNIS_COURT_METRO: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "Сокольники",
  [TennisSiteId.SPARTAK_HARD]: "Сокольники",
  [TennisSiteId.ITC_TSARITSYNO]: "Кантемировская",
  [TennisSiteId.ITC_MYTISCHY]: "Мытищи",
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: "Войковская",
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: "Савеловская",
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: "Южная",
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: "ВДНХ",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "Каширская",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "Бауманская",
  [TennisSiteId.MEGASPORT_TENNIS]: "Беляево",
  [TennisSiteId.LUZHNIKI_TENNIS]: "Лужники",
  [TennisSiteId.SLICE_TENNIS]: "Братиславская",
  [TennisSiteId.GALLERY_CORT]: "Печатники",
  [TennisSiteId.OLONETSKIY]: "Медведково",
  [TennisSiteId.IMPULS]: "Мытищи",
  [TennisSiteId.VIDNYSPORT]: "Видное",
  [TennisSiteId.SPORTVSEGDA_YANTAR]: "Строгино",
  [TennisSiteId.ENERGIYA_STADIUM]: "Лефортово",
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: "Белокаменная",
  [TennisSiteId.TENNIS77_KURGANSKAYA]: "Щелковская",
  [TennisSiteId.LIGA_TENNIS]: "Калужская",
  [TennisSiteId.TENNISTIME]: "Чертановская",
  [TennisSiteId.REZIDENCYA]: "Троицк"
};

// Маппинг округов/районов для кортов (теннис)
export const TENNIS_COURT_DISTRICTS: Record<string, string> = {
  [TennisSiteId.SPARTAK_GRUNT]: "ВАО",
  [TennisSiteId.SPARTAK_HARD]: "ВАО",
  [TennisSiteId.ITC_TSARITSYNO]: "ЮАО",
  [TennisSiteId.ITC_MYTISCHY]: "Мытищи",
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: "СЗАО",
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: "САО",
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: "ЮАО",
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: "СВАО",
  [TennisSiteId.PRO_TENNIS_KASHIRKA]: "ЮАО",
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: "ЦАО",
  [TennisSiteId.MEGASPORT_TENNIS]: "ЮЗАО",
  [TennisSiteId.LUZHNIKI_TENNIS]: "ЦАО",
  [TennisSiteId.SLICE_TENNIS]: "ЮВАО",
  [TennisSiteId.GALLERY_CORT]: "ЮВАО",
  [TennisSiteId.OLONETSKIY]: "СВАО",
  [TennisSiteId.IMPULS]: "Мытищи",
  [TennisSiteId.VIDNYSPORT]: "Видное",
  [TennisSiteId.SPORTVSEGDA_YANTAR]: "СЗАО",
  [TennisSiteId.ENERGIYA_STADIUM]: "ЮВАО",
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: "ВАО",
  [TennisSiteId.TENNIS77_KURGANSKAYA]: "ВАО",
  [TennisSiteId.LIGA_TENNIS]: "ЮВАО",
  [TennisSiteId.TENNISTIME]: "ЮАО",
  [TennisSiteId.REZIDENCYA]: "Троицк"
};

// Список кортов, где в метро указан город (не станция метро)
export const TENNIS_COURT_IS_CITY: Record<string, boolean> = {
  [TennisSiteId.ITC_MYTISCHY]: true,
  [TennisSiteId.IMPULS]: true,
  [TennisSiteId.VIDNYSPORT]: true,
  [TennisSiteId.REZIDENCYA]: true
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
  [TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA]: ["north", "west"],
  [TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA]: ["north"],
  [TennisSiteId.TENNIS_CAPITAL_YUZHNAYA]: ["south"],
  [TennisSiteId.TENNIS_CAPITAL_VDNH]: ["north", "east"],
  [TennisSiteId.LUZHNIKI_TENNIS]: ["center"],
  [TennisSiteId.COOLTENNIS_BAUMANSKAYA]: ["east"],
  [TennisSiteId.OLONETSKIY]: ["north"],
  [TennisSiteId.SLICE_TENNIS]: ["east"],
  [TennisSiteId.SPORTVSEGDA_YANTAR]: ["north", "west"],
  [TennisSiteId.ENERGIYA_STADIUM]: ["east", "south"],
  [TennisSiteId.TENNIS77_BELOKAMENNAYA]: ["east"],
  [TennisSiteId.TENNIS77_KURGANSKAYA]: ["east"],
  [TennisSiteId.LIGA_TENNIS]: ["south", "east"],
  [TennisSiteId.TENNISTIME]: ["south"],
  [TennisSiteId.REZIDENCYA]: ["moscow-region"]
};

/**
 * Подсчитывает количество кортов по регионам на основе маппинга локаций
 * @param courtLocations Маппинг кортов к их локациям
 * @returns Маппинг количества кортов по каждому региону
 */
function calculateCourtCountsByRegion(
  courtLocations: Record<string, string[]>
): Record<string, number> {
  const counts: Record<string, number> = {};
  
  // Проходим по всем кортам и их локациям
  Object.values(courtLocations).forEach((locations) => {
    locations.forEach((location) => {
      counts[location] = (counts[location] || 0) + 1;
    });
  });
  
  return counts;
}

// Маппинг количества кортов по регионам (теннис)
// Автоматически вычисляется на основе TENNIS_COURT_LOCATIONS
export const TENNIS_COURT_COUNTS_BY_REGION: Record<string, number> = 
  calculateCourtCountsByRegion(TENNIS_COURT_LOCATIONS);

