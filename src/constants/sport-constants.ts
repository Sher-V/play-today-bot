// Типы спорта
export enum SportType {
  TENNIS = 'tennis',
  PADEL = 'padel'
}

// Тип для использования в функциях
export type Sport = SportType.TENNIS | SportType.PADEL;

