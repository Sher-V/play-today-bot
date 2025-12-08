// Enum для ID падел площадок
export enum PadelSiteId {
  ROCKET_PADEL_CLUB = "rocket-padel-club",
  PADEL_FRIENDS = "padel-friends",
  BUENOS_PADEL = "buenos-padel",
  PADEL_BELOZER = "padel-belozer",
  TENNIS_CAPITAL_PADEL_SAVELOVSKAYA = "tennis-capital-padel-savelovskaya",
  TENNIS_CAPITAL_PADEL_VDNH = "tennis-capital-padel-vdnh",
  UP2_PADEL = "up2-padel",
  BANDEHAARENACLUB = "bandehaarenaclub",
  ORBITA_TENNIS = "orbita-tennis",
  V_PADEL = "v-padel"
}

// Названия площадок для отображения (падел)
export const PADEL_COURT_NAMES: Record<string, string> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: "Rocket Padel Club",
  [PadelSiteId.PADEL_FRIENDS]: "Padel Friends",
  [PadelSiteId.BUENOS_PADEL]: "Buenos Padel",
  [PadelSiteId.PADEL_BELOZER]: "Падел на Белозерской",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: "Tennis Capital Савеловская",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: "Tennis Capital ВДНХ",
  [PadelSiteId.UP2_PADEL]: "Up2 Padel",
  [PadelSiteId.BANDEHAARENACLUB]: "Bandeha Padel Arena",
  [PadelSiteId.ORBITA_TENNIS]: "Орбита Падел",
  [PadelSiteId.V_PADEL]: "V Padel"
};

// Ссылки на бронирование кортов (падел)
export const PADEL_COURT_LINKS: Record<string, string> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: "https://rocketpadel-club.ru/",
  [PadelSiteId.PADEL_FRIENDS]: "https://padelfriends.ru/moscow",
  [PadelSiteId.BUENOS_PADEL]: "https://buenospadel.ru/",
  [PadelSiteId.PADEL_BELOZER]: "https://padel-tennis-msk.ru/",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: "https://tenniscapital.ru/padel-tennis",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: "https://tenniscapital.ru/padel-tennis",
  [PadelSiteId.UP2_PADEL]: "https://juzhnyj-1745398028.clients.site/?yclid=16571022320512532479&utm_content=17369921911&utm_source=geoadv_maps",
  [PadelSiteId.BANDEHAARENACLUB]: "https://bandehaarenaclub.ru/",
  [PadelSiteId.ORBITA_TENNIS]: "https://orbitatennis.ru/",
  [PadelSiteId.V_PADEL]: "https://v-padel.ru/"
};

// Ссылки на карты кортов (падел)
export const PADEL_COURT_MAPS: Record<string, string> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: "https://yandex.ru/maps/org/rocket_padel_club/209082414430/?ll=37.060725%2C55.532844&z=16.96",
  [PadelSiteId.PADEL_FRIENDS]: "https://yandex.ru/maps/org/padel_friends/35837402005/?ll=37.552166%2C55.715677&z=16.96",
  [PadelSiteId.BUENOS_PADEL]: "https://yandex.ru/maps/org/buenos_padel/67008877127/?indoorLevel=1&ll=37.592561%2C55.803768&z=16.67",
  [PadelSiteId.PADEL_BELOZER]: "https://yandex.ru/maps/org/tennis_i_padel/124086428013/?ll=37.615136%2C55.895171&z=16.67",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: "https://yandex.ru/maps/org/padel_tennis_kepital/96963201111/?ll=37.591995%2C55.800454&z=16.67",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: "https://yandex.ru/maps/org/tennis_kepital/78859832801/?ll=37.613995%2C55.832212&z=16.67",
  [PadelSiteId.UP2_PADEL]: "https://yandex.ru/maps/org/up2_padel/166138496300/?indoorLevel=1&ll=37.611742%2C55.621719&z=16.96",
  [PadelSiteId.BANDEHAARENACLUB]: "https://yandex.ru/maps/org/bandeha_padel_arena/216192396141/?ll=37.389086%2C55.826837&z=16.96",
  [PadelSiteId.ORBITA_TENNIS]: "https://yandex.ru/maps/org/orbita_padel/113012593244/?ll=37.395581%2C55.649413&z=13.19",
  [PadelSiteId.V_PADEL]: "https://yandex.ru/maps/org/v_padel/54876592176/?indoorLevel=5&ll=37.407196%2C55.884969&z=16.96"
};

// Маппинг метро/города для кортов (падел)
export const PADEL_COURT_METRO: Record<string, string> = {
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: "Савеловская",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: "ВДНХ",
  [PadelSiteId.PADEL_FRIENDS]: "Сокольники",
  [PadelSiteId.BUENOS_PADEL]: "Савеловская",
  [PadelSiteId.PADEL_BELOZER]: "Белозерская",
  [PadelSiteId.UP2_PADEL]: "Южная",
  [PadelSiteId.BANDEHAARENACLUB]: "Мякинино",
  [PadelSiteId.ORBITA_TENNIS]: "Юго-Западная",
  [PadelSiteId.V_PADEL]: "Петровско-Разумовская",
  [PadelSiteId.ROCKET_PADEL_CLUB]: "Мытищи"
};

// Маппинг округов/районов для кортов (падел)
export const PADEL_COURT_DISTRICTS: Record<string, string> = {
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: "САО",
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: "СВАО",
  [PadelSiteId.PADEL_FRIENDS]: "ВАО",
  [PadelSiteId.BUENOS_PADEL]: "САО",
  [PadelSiteId.PADEL_BELOZER]: "СВАО",
  [PadelSiteId.UP2_PADEL]: "ЮАО",
  [PadelSiteId.BANDEHAARENACLUB]: "СЗАО",
  [PadelSiteId.ORBITA_TENNIS]: "ЗАО",
  [PadelSiteId.V_PADEL]: "САО",
  [PadelSiteId.ROCKET_PADEL_CLUB]: "Мытищи"
};

// Список кортов, где в метро указан город (не станция метро)
export const PADEL_COURT_IS_CITY: Record<string, boolean> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: true
};

// Маппинг кортов к локациям (падел)
export const PADEL_COURT_LOCATIONS: Record<string, string[]> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: ["moscow-region"],
  [PadelSiteId.PADEL_FRIENDS]: ["center"],
  [PadelSiteId.BUENOS_PADEL]: ["north"],
  [PadelSiteId.PADEL_BELOZER]: ["south"],
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: ["north"],
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: ["north"],
  [PadelSiteId.UP2_PADEL]: ["south"],
  [PadelSiteId.BANDEHAARENACLUB]: ["west"],
  [PadelSiteId.ORBITA_TENNIS]: ["west"],
  [PadelSiteId.V_PADEL]: ["north"]
};

