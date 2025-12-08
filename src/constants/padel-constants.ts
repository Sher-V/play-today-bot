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
  V_PADEL = "v-padel",
  KORTY_SETKI = "korty-setki",
  PADEL_VIDNOE = "padel-vidnoe",
  PADEL_HUB_NAGATINSKAYA = "padel-hub-nagatinskaya",
  PADEL_HUB_NAGATINSKAYA_PREMIUM = "padel-hub-nagatinskaya-premium",
  PADEL_HUB_TEREKHOVO = "padel-hub-terehovo",
  PADEL_HUB_YASENEVO = "padel-hub-yasenevo",
  PADEL_HUB_SKOLKOVO = "padel-hub-skolkovo",
  MOSCOW_PDL_LUZHNIKI = "moscow-pdl-luzhniki",
  PADEL_NOK_KRYLATSKOE = "padel-nok-krylatskoe",
  PARI_PADEL_SEVER = "pari-padel-sever",
  FIRST_PADEL_CLUB = "first-padel-club",
  ZARYAD_PADEL = "zaryad-padel",
  PADEL_LEND = "padel-lend"
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
  [PadelSiteId.V_PADEL]: "V Padel",
  [PadelSiteId.KORTY_SETKI]: "Корты-Сетки",
  [PadelSiteId.PADEL_VIDNOE]: "Падел Видное",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: "Падел Хаб Нагатинская",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: "Падел Хаб Нагатинская Премиум",
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: "Падел Хаб Терехово",
  [PadelSiteId.PADEL_HUB_YASENEVO]: "Падел Хаб Ясенево",
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: "Падел Хаб Сколково",
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: "Moscow PDL (Лужники)",
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: "Падел Нок Крылатское",
  [PadelSiteId.PARI_PADEL_SEVER]: "Пари Падел Север",
  [PadelSiteId.FIRST_PADEL_CLUB]: "First Padel Club",
  [PadelSiteId.ZARYAD_PADEL]: "Заряд Падел",
  [PadelSiteId.PADEL_LEND]: "Падел Ленд"
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
  [PadelSiteId.V_PADEL]: "https://v-padel.ru/",
  [PadelSiteId.KORTY_SETKI]: "https://korty-setki.ru/",
  [PadelSiteId.PADEL_VIDNOE]: "https://padelvidnoe.ru/",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: "https://padlhub.ru/padel_nagatinskaya",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: "https://padlhub.ru/padel_nagatinskayapremium",
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: "https://padlhub.ru/padel_terehovo",
  [PadelSiteId.PADEL_HUB_YASENEVO]: "https://padlhub.ru/padl_yas",
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: "https://padlhub.ru/skolkovo",
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: "https://moscowpdl.ru/#o6T6ej",
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: "https://padelnok.ru/#booking",
  [PadelSiteId.PARI_PADEL_SEVER]: "https://paripadel.ru/pari-padel-8-marta/#MQ5zOX",
  [PadelSiteId.FIRST_PADEL_CLUB]: "https://firstpadel.ru/",
  [PadelSiteId.ZARYAD_PADEL]: "https://zaryadpadel.ru/",
  [PadelSiteId.PADEL_LEND]: "https://pdlland.ru/"
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
  [PadelSiteId.V_PADEL]: "https://yandex.ru/maps/org/v_padel/54876592176/?indoorLevel=5&ll=37.407196%2C55.884969&z=16.96",
  [PadelSiteId.KORTY_SETKI]: "https://yandex.ru/maps/org/korty_setki/75670705497/?ll=37.823352%2C55.686999&z=16.96",
  [PadelSiteId.PADEL_VIDNOE]: "https://yandex.ru/maps/-/CLg~UT6~",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: "https://yandex.ru/maps/org/padlkhab/154806505713/?ll=37.632421%2C55.683666&z=16.85",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: "https://yandex.ru/maps/org/padlkhab/117487922561/?ll=37.627416%2C55.684889&z=16.67",
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: "https://yandex.ru/maps/org/padlkhab/53961082429/?ll=37.458532%2C55.743654&z=16.67",
  [PadelSiteId.PADEL_HUB_YASENEVO]: "https://yandex.ru/maps/org/padlkhab/164517780240/?ll=37.533416%2C55.601849&z=16.67",
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: "https://yandex.ru/maps/org/padlkhab/185911964164/?indoorLevel=1&ll=37.402181%2C55.704012&z=16.67",
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: "https://yandex.ru/maps/org/moscow_pdl/20374934949/?indoorLevel=1&ll=37.564221%2C55.712837&z=16.96",
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: "https://yandex.ru/maps/org/padel_nok/96119710948/?ll=37.355650%2C55.787938&z=16.96",
  [PadelSiteId.PARI_PADEL_SEVER]: "https://yandex.ru/maps/org/pari_padel/86395826761/?ll=37.632758%2C55.748933&z=12.5",
  [PadelSiteId.FIRST_PADEL_CLUB]: "https://yandex.ru/maps/org/first_padel_club/190481243881/?ll=37.725445%2C55.737824&z=11.38",
  [PadelSiteId.ZARYAD_PADEL]: "https://yandex.ru/maps/org/zaryad_padel/163039505344/?ll=37.476869%2C55.674996&z=16.96",
  [PadelSiteId.PADEL_LEND]: "https://yandex.ru/maps/org/padel_lend/210143639327/?indoorLevel=1&ll=37.395195%2C55.858943&z=16.96"
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
  [PadelSiteId.ROCKET_PADEL_CLUB]: "Мытищи",
  [PadelSiteId.KORTY_SETKI]: "Алексеевская",
  [PadelSiteId.PADEL_VIDNOE]: "Видное",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: "Нагатинская",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: "Нагатинская",
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: "Терехово",
  [PadelSiteId.PADEL_HUB_YASENEVO]: "Ясенево",
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: "Кунцевская",
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: "Воробьевы горы",
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: "Крылатское",
  [PadelSiteId.PARI_PADEL_SEVER]: "ТТК",
  [PadelSiteId.FIRST_PADEL_CLUB]: "",
  [PadelSiteId.ZARYAD_PADEL]: "Юго-Западная",
  [PadelSiteId.PADEL_LEND]: "Подмосковье"
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
  [PadelSiteId.ROCKET_PADEL_CLUB]: "Мытищи",
  [PadelSiteId.KORTY_SETKI]: "СВАО",
  [PadelSiteId.PADEL_VIDNOE]: "Видное",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: "ЮАО",
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: "ЮАО",
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: "ЗАО",
  [PadelSiteId.PADEL_HUB_YASENEVO]: "ЮЗАО",
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: "ЗАО",
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: "ЦАО",
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: "ЗАО",
  [PadelSiteId.PARI_PADEL_SEVER]: "СЗАО",
  [PadelSiteId.FIRST_PADEL_CLUB]: "ЮЗАО",
  [PadelSiteId.ZARYAD_PADEL]: "ЗАО",
  [PadelSiteId.PADEL_LEND]: "Подмосковье"
};

// Список кортов, где в метро указан город (не станция метро)
export const PADEL_COURT_IS_CITY: Record<string, boolean> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: true,
  [PadelSiteId.PADEL_VIDNOE]: true,
  [PadelSiteId.PADEL_LEND]: true
};

// Маппинг кортов к локациям (падел)
export const PADEL_COURT_LOCATIONS: Record<string, string[]> = {
  [PadelSiteId.ROCKET_PADEL_CLUB]: ["moscow-region"],
  [PadelSiteId.PADEL_FRIENDS]: ["center", "south"],
  [PadelSiteId.BUENOS_PADEL]: ["north"],
  [PadelSiteId.PADEL_BELOZER]: ["north"],
  [PadelSiteId.TENNIS_CAPITAL_PADEL_SAVELOVSKAYA]: ["north"],
  [PadelSiteId.TENNIS_CAPITAL_PADEL_VDNH]: ["north", "east"],
  [PadelSiteId.UP2_PADEL]: ["south"],
  [PadelSiteId.BANDEHAARENACLUB]: ["west", "north"],
  [PadelSiteId.ORBITA_TENNIS]: ["west"],
  [PadelSiteId.V_PADEL]: ["north"],
  [PadelSiteId.KORTY_SETKI]: ["north", 'east'],
  [PadelSiteId.PADEL_VIDNOE]: ["moscow-region"],
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA]: ["south"],
  [PadelSiteId.PADEL_HUB_NAGATINSKAYA_PREMIUM]: ["south"],
  [PadelSiteId.PADEL_HUB_TEREKHOVO]: ["west"],
  [PadelSiteId.PADEL_HUB_YASENEVO]: ["south"],
  [PadelSiteId.PADEL_HUB_SKOLKOVO]: ["west"],
  [PadelSiteId.MOSCOW_PDL_LUZHNIKI]: ["center"],
  [PadelSiteId.PADEL_NOK_KRYLATSKOE]: ["west"],
  [PadelSiteId.PARI_PADEL_SEVER]: ["north", "west"],
  [PadelSiteId.FIRST_PADEL_CLUB]: ["south", "west"],
  [PadelSiteId.ZARYAD_PADEL]: ["west", "south"],
  [PadelSiteId.PADEL_LEND]: ["moscow-region"]
};

