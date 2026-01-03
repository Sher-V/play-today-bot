// Тесты для matchTennisCourtSiteId
// Запуск: npx ts-node src/utils/court-matcher.test.ts

import { matchTennisCourtSiteId } from './court-matcher';
import { TENNIS_COURT_NAMES, TennisSiteId } from '../constants/tennis-constants';

interface TestCase {
  input: string;
  expectedSiteId: TennisSiteId;
  description?: string;
}

// Тестовые случаи для каждого корта
const testCases: TestCase[] = [
  // Импульс
  { input: 'Импульс', expectedSiteId: TennisSiteId.IMPULS },
  { input: 'импульс', expectedSiteId: TennisSiteId.IMPULS },
  { input: 'ИМПУЛЬС', expectedSiteId: TennisSiteId.IMPULS },
  
  // Спартак — крытый грунт
  { input: 'Спартак грунт', expectedSiteId: TennisSiteId.SPARTAK_GRUNT },
  { input: 'спартак крытый грунт', expectedSiteId: TennisSiteId.SPARTAK_GRUNT },
  { input: 'Спартак — крытый грунт', expectedSiteId: TennisSiteId.SPARTAK_GRUNT },
  
  // Спартак — хард
  { input: 'Спартак хард', expectedSiteId: TennisSiteId.SPARTAK_HARD },
  { input: 'Спартак', expectedSiteId: TennisSiteId.SPARTAK_HARD },
  { input: 'спартак хард', expectedSiteId: TennisSiteId.SPARTAK_HARD },
  { input: 'Спартак — хард', expectedSiteId: TennisSiteId.SPARTAK_HARD },
  
  // ITC by WeGym «Царицыно»
  { input: 'ITC Царицыно', expectedSiteId: TennisSiteId.ITC_TSARITSYNO },
  { input: 'itc царицыно', expectedSiteId: TennisSiteId.ITC_TSARITSYNO },
  { input: 'ITC by WeGym Царицыно', expectedSiteId: TennisSiteId.ITC_TSARITSYNO },
  { input: 'WeGym Царицыно', expectedSiteId: TennisSiteId.ITC_TSARITSYNO },
  
  // ITC by WeGym «Мытищи»
  { input: 'ITC Мытищи', expectedSiteId: TennisSiteId.ITC_MYTISCHY },
  { input: 'itc мытищи', expectedSiteId: TennisSiteId.ITC_MYTISCHY },
  { input: 'ITC by WeGym Мытищи', expectedSiteId: TennisSiteId.ITC_MYTISCHY },
  { input: 'WeGym Мытищи', expectedSiteId: TennisSiteId.ITC_MYTISCHY },
  
  // Видный Спорт
  { input: 'Видный Спорт', expectedSiteId: TennisSiteId.VIDNYSPORT },
  { input: 'видный спорт', expectedSiteId: TennisSiteId.VIDNYSPORT },
  { input: 'ВидныйСпорт', expectedSiteId: TennisSiteId.VIDNYSPORT },
  { input: 'Видный', expectedSiteId: TennisSiteId.VIDNYSPORT },
  
  // PRO TENNIS на Каширке
  { input: 'PRO TENNIS Каширка', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  { input: 'про теннис Каширка', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  { input: 'про теннис', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  { input: 'pro tennis каширка', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  { input: 'PRO TENNIS на Каширке', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  { input: 'Каширка', expectedSiteId: TennisSiteId.PRO_TENNIS_KASHIRKA },
  
  // Мегаспорт
  { input: 'Мегаспорт', expectedSiteId: TennisSiteId.MEGASPORT_TENNIS },
  { input: 'мегаспорт', expectedSiteId: TennisSiteId.MEGASPORT_TENNIS },
  { input: 'МЕГАСПОРТ', expectedSiteId: TennisSiteId.MEGASPORT_TENNIS },
  
  // The Tennis Club Gallery
  { input: 'Gallery', expectedSiteId: TennisSiteId.GALLERY_CORT },
  { input: 'Галерея', expectedSiteId: TennisSiteId.GALLERY_CORT },
  { input: 'Галлерея', expectedSiteId: TennisSiteId.GALLERY_CORT },
  { input: 'gallery', expectedSiteId: TennisSiteId.GALLERY_CORT },
  { input: 'The Tennis Club Gallery', expectedSiteId: TennisSiteId.GALLERY_CORT },
  
  // Tennis Capital Войковская
  { input: 'Tennis Capital Войковская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA },
  { input: 'теннис капитал войковская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA },
  { input: 'Теннис Капитал Войковская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA },
  { input: 'Войковская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VOISKOVSKAYA },
  
  // Tennis Capital Савеловская
  { input: 'Tennis Capital Савеловская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA },
  { input: 'теннис капитал савеловская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA },
  { input: 'Теннис Капитал Савеловская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA },
  { input: 'Савеловская', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_SAVELOVSKAYA },
  
  // Tennis Capital Южная
  { input: 'Tennis Capital Южная', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_YUZHNAYA },
  { input: 'теннис капитал южная', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_YUZHNAYA },
  { input: 'Теннис Капитал Южная', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_YUZHNAYA },
  { input: 'Южная', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_YUZHNAYA },
  
  // Tennis Capital ВДНХ
  { input: 'Tennis Capital ВДНХ', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VDNH },
  { input: 'теннис капитал вднх', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VDNH },
  { input: 'Теннис Капитал ВДНХ', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VDNH },
  { input: 'ВДНХ', expectedSiteId: TennisSiteId.TENNIS_CAPITAL_VDNH },
  
  // Лужники
  { input: 'Лужники', expectedSiteId: TennisSiteId.LUZHNIKI_TENNIS },
  { input: 'лужники', expectedSiteId: TennisSiteId.LUZHNIKI_TENNIS },
  { input: 'ЛУЖНИКИ', expectedSiteId: TennisSiteId.LUZHNIKI_TENNIS },
  
  // CoolTennis Бауманская
  { input: 'CoolTennis Бауманская', expectedSiteId: TennisSiteId.COOLTENNIS_BAUMANSKAYA },
  { input: 'cooltennis бауманская', expectedSiteId: TennisSiteId.COOLTENNIS_BAUMANSKAYA },
  { input: 'cooltennis', expectedSiteId: TennisSiteId.COOLTENNIS_BAUMANSKAYA },
  { input: 'Бауманская', expectedSiteId: TennisSiteId.COOLTENNIS_BAUMANSKAYA },
  
  // Чемпион
  { input: 'Чемпион', expectedSiteId: TennisSiteId.OLONETSKIY },
  { input: 'чемпион', expectedSiteId: TennisSiteId.OLONETSKIY },
  { input: 'ЧЕМПИОН', expectedSiteId: TennisSiteId.OLONETSKIY },
  
  // Slice
  { input: 'Slice', expectedSiteId: TennisSiteId.SLICE_TENNIS },
  { input: 'slice', expectedSiteId: TennisSiteId.SLICE_TENNIS },
  { input: 'SLICE', expectedSiteId: TennisSiteId.SLICE_TENNIS },
  
  // Теннис СпортВсегда Янтарь
  { input: 'СпортВсегда Янтарь', expectedSiteId: TennisSiteId.SPORTVSEGDA_YANTAR },
  { input: 'спортвсегда янтарь', expectedSiteId: TennisSiteId.SPORTVSEGDA_YANTAR },
  { input: 'Теннис СпортВсегда Янтарь', expectedSiteId: TennisSiteId.SPORTVSEGDA_YANTAR },
  { input: 'Янтарь', expectedSiteId: TennisSiteId.SPORTVSEGDA_YANTAR },
  
  // Стадион «Энергия»
  { input: 'Стадион Энергия', expectedSiteId: TennisSiteId.ENERGIYA_STADIUM },
  { input: 'стадион энергия', expectedSiteId: TennisSiteId.ENERGIYA_STADIUM },
  { input: 'Энергия', expectedSiteId: TennisSiteId.ENERGIYA_STADIUM },
  
  // Tennis77 Белокаменная
  { input: 'Tennis77 Белокаменная', expectedSiteId: TennisSiteId.TENNIS77_BELOKAMENNAYA },
  { input: 'tennis77 белокаменная', expectedSiteId: TennisSiteId.TENNIS77_BELOKAMENNAYA },
  { input: 'Белокаменная', expectedSiteId: TennisSiteId.TENNIS77_BELOKAMENNAYA },
  
  // Tennis77 Курганская
  { input: 'Tennis77 Курганская', expectedSiteId: TennisSiteId.TENNIS77_KURGANSKAYA },
  { input: 'tennis77 курганская', expectedSiteId: TennisSiteId.TENNIS77_KURGANSKAYA },
  { input: 'Курганская', expectedSiteId: TennisSiteId.TENNIS77_KURGANSKAYA },
  
  // Лига Теннис
  { input: 'Лига Теннис', expectedSiteId: TennisSiteId.LIGA_TENNIS },
  { input: 'лига теннис', expectedSiteId: TennisSiteId.LIGA_TENNIS },
  { input: 'Лига', expectedSiteId: TennisSiteId.LIGA_TENNIS },
  
  // TennisTime (Lawn Tennis Club)
  { input: 'TennisTime', expectedSiteId: TennisSiteId.TENNISTIME },
  { input: 'tennistime', expectedSiteId: TennisSiteId.TENNISTIME },
  { input: 'TennisTime Lawn Tennis Club', expectedSiteId: TennisSiteId.TENNISTIME },
  
  // Теннисный центр Резиденция
  { input: 'Резиденция', expectedSiteId: TennisSiteId.REZIDENCYA },
  { input: 'резиденция', expectedSiteId: TennisSiteId.REZIDENCYA },
  { input: 'Теннисный центр Резиденция', expectedSiteId: TennisSiteId.REZIDENCYA },
  
  // Tennis.ru
  { input: 'Tennis.ru', expectedSiteId: TennisSiteId.TENNIS_RU },
  { input: 'tennis.ru', expectedSiteId: TennisSiteId.TENNIS_RU },
  { input: 'теннис ру', expectedSiteId: TennisSiteId.TENNIS_RU },
  { input: 'Теннис.ру', expectedSiteId: TennisSiteId.TENNIS_RU },
  { input: 'tennis ru', expectedSiteId: TennisSiteId.TENNIS_RU },
  
  // Спорт Станция
  { input: 'Спорт Станция', expectedSiteId: TennisSiteId.SPORT_STANCIYA },
  { input: 'спорт станция', expectedSiteId: TennisSiteId.SPORT_STANCIYA },
  { input: 'СпортСтанция', expectedSiteId: TennisSiteId.SPORT_STANCIYA },
  
  // Fly Tennis
  { input: 'Fly Tennis', expectedSiteId: TennisSiteId.FLY_TENNIS },
  { input: 'fly tennis', expectedSiteId: TennisSiteId.FLY_TENNIS },
  { input: 'флай теннис', expectedSiteId: TennisSiteId.FLY_TENNIS },
  { input: 'Флай Теннис', expectedSiteId: TennisSiteId.FLY_TENNIS },
  { input: 'флайтеннис', expectedSiteId: TennisSiteId.FLY_TENNIS },
  
  // Эйс
  { input: 'Эйс', expectedSiteId: TennisSiteId.ACE },
  { input: 'эйс', expectedSiteId: TennisSiteId.ACE },
  { input: 'Ace', expectedSiteId: TennisSiteId.ACE },
  { input: 'ace', expectedSiteId: TennisSiteId.ACE },
  
  // Будь Здоров
  { input: 'Будь Здоров', expectedSiteId: TennisSiteId.BUD_ZOROV },
  { input: 'будь здоров', expectedSiteId: TennisSiteId.BUD_ZOROV },
  { input: 'БудьЗдоров', expectedSiteId: TennisSiteId.BUD_ZOROV },
  
  // Легион
  { input: 'Легион', expectedSiteId: TennisSiteId.LEGION },
  { input: 'легион', expectedSiteId: TennisSiteId.LEGION },
  { input: 'ЛЕГИОН', expectedSiteId: TennisSiteId.LEGION },
  
  // Плэй Парк
  { input: 'Плэй Парк', expectedSiteId: TennisSiteId.PLAY_PARK },
  { input: 'плэй парк', expectedSiteId: TennisSiteId.PLAY_PARK },
  { input: 'Play Park', expectedSiteId: TennisSiteId.PLAY_PARK },
  { input: 'play park', expectedSiteId: TennisSiteId.PLAY_PARK },
  
  // Авантаж
  { input: 'Авантаж', expectedSiteId: TennisSiteId.AVANTAGE },
  { input: 'авантаж', expectedSiteId: TennisSiteId.AVANTAGE },
  { input: 'Avantage', expectedSiteId: TennisSiteId.AVANTAGE },
  { input: 'avantage', expectedSiteId: TennisSiteId.AVANTAGE },
  
  // Одинцово 40 love
  { input: 'Одинцово 40 love', expectedSiteId: TennisSiteId.ODINTSOVO_40_LOVE },
  { input: 'одинцово 40 love', expectedSiteId: TennisSiteId.ODINTSOVO_40_LOVE },
  { input: '40 love', expectedSiteId: TennisSiteId.ODINTSOVO_40_LOVE },
  { input: '40 love одинцово', expectedSiteId: TennisSiteId.ODINTSOVO_40_LOVE },
  
  // Ракетлон
  { input: 'Ракетлон', expectedSiteId: TennisSiteId.RAKETLON },
  { input: 'ракетлон', expectedSiteId: TennisSiteId.RAKETLON },
  { input: 'Raketlon', expectedSiteId: TennisSiteId.RAKETLON },
  { input: 'raketlon', expectedSiteId: TennisSiteId.RAKETLON },
  
  // Теннис Арт
  { input: 'Теннис Арт', expectedSiteId: TennisSiteId.TENNIS_ART },
  { input: 'теннис арт', expectedSiteId: TennisSiteId.TENNIS_ART },
  { input: 'Tennis Art', expectedSiteId: TennisSiteId.TENNIS_ART },
  { input: 'tennis art', expectedSiteId: TennisSiteId.TENNIS_ART },
  
  // Теннис Парк
  { input: 'Теннис Парк', expectedSiteId: TennisSiteId.TENNIS_PARK },
  { input: 'теннис парк', expectedSiteId: TennisSiteId.TENNIS_PARK },
  { input: 'Tennis Park', expectedSiteId: TennisSiteId.TENNIS_PARK },
  { input: 'tennis park', expectedSiteId: TennisSiteId.TENNIS_PARK },
  
  // ВТБ Арена (Динамо)
  { input: 'ВТБ Арена', expectedSiteId: TennisSiteId.VTB_ARENA },
  { input: 'втб арена', expectedSiteId: TennisSiteId.VTB_ARENA },
  { input: 'Динамо', expectedSiteId: TennisSiteId.VTB_ARENA },
  { input: 'динамо', expectedSiteId: TennisSiteId.VTB_ARENA },
  { input: 'ВТБ Арена Динамо', expectedSiteId: TennisSiteId.VTB_ARENA },
];

// Функция для запуска тестов
function runTests() {
  console.log('🧪 Запуск тестов для matchTennisCourtSiteId\n');
  
  let passed = 0;
  let failed = 0;
  const failures: Array<{ input: string; expected: string; got: string | null }> = [];
  
  for (const testCase of testCases) {
    const result = matchTennisCourtSiteId(testCase.input, TENNIS_COURT_NAMES);
    const expected = testCase.expectedSiteId;
    
    // Обрабатываем результат (может быть string, null или MatchDebug)
    const resultSiteId = typeof result === 'object' && result !== null && 'siteId' in result 
      ? result.siteId 
      : result as string | null;
    
    if (resultSiteId === expected) {
      passed++;
      console.log(`✅ "${testCase.input}" -> ${expected}`);
    } else {
      failed++;
      failures.push({
        input: testCase.input,
        expected,
        got: resultSiteId
      });
      console.log(`❌ "${testCase.input}" -> ожидалось: ${expected}, получено: ${resultSiteId || 'null'}`);
    }
  }
  
  console.log(`\n📊 Результаты: ${passed} прошло, ${failed} провалено из ${testCases.length}`);
  
  if (failures.length > 0) {
    console.log('\n❌ Проваленные тесты:');
    failures.forEach(f => {
      console.log(`  "${f.input}" -> ожидалось: ${f.expected}, получено: ${f.got || 'null'}`);
    });
  }
  
  return failed === 0;
}

// Запуск тестов
runTests();

export { runTests, testCases };

