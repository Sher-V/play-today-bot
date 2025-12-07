// Названия площадок для отображения (падел)
export const PADEL_COURT_NAMES: Record<string, string> = {
  "rocket-padel-club": "Rocket Padel Club",
  "padel-friends": "Padel Friends",
  "buenos-padel": "Buenos Padel",
  "padel-belozer": "Падел на Белозерской",
  "tennis-capital-padel-savelovskaya": "Tennis Capital Савеловская",
  "tennis-capital-padel-vdnh": "Tennis Capital ВДНХ",
  "up2-padel": "Up2 Padel",
  "bandehaarenaclub": "Bandeha Padel Arena",
  "orbita-tennis": "Орбита Падел",
  "v-padel": "V Padel"
};

// Ссылки на бронирование кортов (падел)
export const PADEL_COURT_LINKS: Record<string, string> = {
  "rocket-padel-club": "https://rocketpadel-club.ru/",
  "padel-friends": "https://padelfriends.ru/moscow",
  "buenos-padel": "https://buenospadel.ru/",
  "padel-belozer": "https://padel-tennis-msk.ru/",
  "tennis-capital-padel-savelovskaya": "https://tenniscapital.ru/padel-tennis",
  "tennis-capital-padel-vdnh": "https://tenniscapital.ru/padel-tennis",
  "up2-padel": "https://juzhnyj-1745398028.clients.site/?yclid=16571022320512532479&utm_content=17369921911&utm_source=geoadv_maps",
  "bandehaarenaclub": "https://bandehaarenaclub.ru/",
  "orbita-tennis": "https://orbitatennis.ru/",
  "v-padel": "https://v-padel.ru/"
};

// Ссылки на карты кортов (падел)
export const PADEL_COURT_MAPS: Record<string, string> = {
  "rocket-padel-club": "https://yandex.ru/maps/org/rocket_padel_club/209082414430/?ll=37.060725%2C55.532844&z=16.96",
  "padel-friends": "https://yandex.ru/maps/org/padel_friends/35837402005/?ll=37.552166%2C55.715677&z=16.96",
  "buenos-padel": "https://yandex.ru/maps/org/buenos_padel/67008877127/?indoorLevel=1&ll=37.592561%2C55.803768&z=16.67",
  "padel-belozer": "https://yandex.ru/maps/org/tennis_i_padel/124086428013/?ll=37.615136%2C55.895171&z=16.67",
  "tennis-capital-padel-savelovskaya": "https://yandex.ru/maps/org/padel_tennis_kepital/96963201111/?ll=37.591995%2C55.800454&z=16.67",
  "tennis-capital-padel-vdnh": "https://yandex.ru/maps/org/tennis_kepital/78859832801/?ll=37.613995%2C55.832212&z=16.67",
  "up2-padel": "https://yandex.ru/maps/org/up2_padel/166138496300/?indoorLevel=1&ll=37.611742%2C55.621719&z=16.96",
  "bandehaarenaclub": "https://yandex.ru/maps/org/bandeha_padel_arena/216192396141/?ll=37.389086%2C55.826837&z=16.96",
  "orbita-tennis": "https://yandex.ru/maps/org/orbita_padel/113012593244/?ll=37.395581%2C55.649413&z=13.19",
  "v-padel": "https://yandex.ru/maps/org/v_padel/54876592176/?indoorLevel=5&ll=37.407196%2C55.884969&z=16.96"
};

// Маппинг метро/города для кортов (падел)
export const PADEL_COURT_METRO: Record<string, string> = {
  "tennis-capital-padel-savelovskaya": "Савеловская",
  "tennis-capital-padel-vdnh": "ВДНХ",
  "padel-friends": "Сокольники",
  "buenos-padel": "Савеловская",
  "padel-belozer": "Белозерская",
  "up2-padel": "Южная",
  "bandehaarenaclub": "Октябрьское поле",
  "orbita-tennis": "Юго-Западная",
  "v-padel": "Петровско-Разумовская",
  "rocket-padel-club": "Мытищи"
};

// Маппинг округов/районов для кортов (падел)
export const PADEL_COURT_DISTRICTS: Record<string, string> = {
  "tennis-capital-padel-savelovskaya": "САО",
  "tennis-capital-padel-vdnh": "СВАО",
  "padel-friends": "ВАО",
  "buenos-padel": "САО",
  "padel-belozer": "СВАО",
  "up2-padel": "ЮАО",
  "bandehaarenaclub": "СЗАО",
  "orbita-tennis": "ЗАО",
  "v-padel": "САО",
  "rocket-padel-club": "Мытищи"
};

// Список кортов, где в метро указан город (не станция метро)
export const PADEL_COURT_IS_CITY: Record<string, boolean> = {
  "rocket-padel-club": true
};

// Маппинг кортов к локациям (падел)
export const PADEL_COURT_LOCATIONS: Record<string, string[]> = {
  "rocket-padel-club": ["moscow-region"],
  "padel-friends": ["center"],
  "buenos-padel": ["center"],
  "padel-belozer": ["south"],
  "tennis-capital-padel-savelovskaya": ["north"],
  "tennis-capital-padel-vdnh": ["north"],
  "up2-padel": ["south"],
  "bandehaarenaclub": ["west"],
  "orbita-tennis": ["west"],
  "v-padel": ["north"]
};

