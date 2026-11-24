import {
  ArenaConfig,
  ComputedLbxStats,
  LbxCharacterPreset,
  LbxLoadout,
  LbxPaint,
  LbxPart,
  LbxWeapon,
  ModelStyle,
  PartSlot,
} from './types';

export const LBX_PARTS: LbxPart[] = [
  // HEADS
  {
    id: 'head_achilles',
    slot: 'head',
    style: 'achilles',
    name: 'Шлем Ахиллеса',
    series: 'Рыцарская рама',
    description: 'Сбалансированный шлем с алым плюмажем и высокой точностью визора.',
    hpBonus: 180,
    armorBonus: 4,
    speedBonus: 0.3,
    energyBonus: 15,
    attackBonus: 4,
  },
  {
    id: 'head_kunoichi',
    slot: 'head',
    style: 'kunoichi',
    name: 'Маска Куноичи',
    series: 'Стелс-серия',
    description: 'Сверхлёгкий сенсорный модуль с длинными антеннами обнаружения.',
    hpBonus: 130,
    armorBonus: 2,
    speedBonus: 0.8,
    energyBonus: 22,
    attackBonus: 6,
  },
  {
    id: 'head_emperor',
    slot: 'head',
    style: 'emperor',
    name: 'Шлем Ксенона',
    series: 'Тяжёлая рама',
    description: 'Усиленная броня головы Ксенона с защищённым боевым сканером.',
    hpBonus: 205,
    armorBonus: 5,
    speedBonus: -0.3,
    energyBonus: 10,
    attackBonus: 5,
  },
  {
    id: 'head_hunter',
    slot: 'head',
    style: 'hunter',
    name: 'Визор Охотника',
    series: 'Снайперская рама',
    description: 'Оптический прицельный комплекс для ведения дальнего огня.',
    hpBonus: 150,
    armorBonus: 3,
    speedBonus: 0.4,
    energyBonus: 6,
    attackBonus: 9,
  },
  {
    id: 'head_odin',
    slot: 'head',
    style: 'odin',
    name: 'Крылатый шлем Одина',
    series: 'Экспериментальная рама',
    description: 'Прототип нового поколения с улучшенным распределением энергии.',
    hpBonus: 210,
    armorBonus: 5,
    speedBonus: 0.7,
    energyBonus: 25,
    attackBonus: 10,
  },

  // TORSOS
  {
    id: 'torso_achilles',
    slot: 'torso',
    style: 'achilles',
    name: 'Корпус Ахиллеса',
    series: 'Рыцарская рама',
    description: 'Надёжный центральный блок со сбалансированным ядром D-реактора.',
    hpBonus: 380,
    armorBonus: 8,
    speedBonus: 0.2,
    energyBonus: 25,
    attackBonus: 5,
  },
  {
    id: 'torso_kunoichi',
    slot: 'torso',
    style: 'kunoichi',
    name: 'Корпус Куноичи',
    series: 'Стелс-серия',
    description: 'Облегчённая рама для стремительных рывков и уклонений.',
    hpBonus: 290,
    armorBonus: 4,
    speedBonus: 1.0,
    energyBonus: 35,
    attackBonus: 6,
  },
  {
    id: 'torso_emperor',
    slot: 'torso',
    style: 'emperor',
    name: 'Бронеядро Ксенона',
    series: 'Тяжёлая рама',
    description: 'Массивный нагрудник Ксенона из титанового композита с высокой прочностью.',
    hpBonus: 430,
    armorBonus: 10,
    speedBonus: -0.6,
    energyBonus: 18,
    attackBonus: 7,
  },
  {
    id: 'torso_hunter',
    slot: 'torso',
    style: 'hunter',
    name: 'Корпус Охотника',
    series: 'Снайперская рама',
    description: 'Оснащён конденсаторами для подпитки энергетического оружия.',
    hpBonus: 340,
    armorBonus: 6,
    speedBonus: 0.4,
    energyBonus: 10,
    attackBonus: 8,
  },
  {
    id: 'torso_odin',
    slot: 'torso',
    style: 'odin',
    name: 'Гиперкорпус Одина',
    series: 'Экспериментальная рама',
    description: 'Элитный корпус с двойным контуром охлаждения и высокой мощностью.',
    hpBonus: 430,
    armorBonus: 9,
    speedBonus: 0.8,
    energyBonus: 40,
    attackBonus: 11,
  },

  // ARMS
  {
    id: 'arms_achilles',
    slot: 'arms',
    style: 'achilles',
    name: 'Наплечники Ахиллеса',
    series: 'Рыцарская рама',
    description: 'Классические щитки плеч с сервоприводами высокой точности.',
    hpBonus: 200,
    armorBonus: 4,
    speedBonus: 0.2,
    energyBonus: 10,
    attackBonus: 8,
  },
  {
    id: 'arms_kunoichi',
    slot: 'arms',
    style: 'kunoichi',
    name: 'Рукава Куноичи',
    series: 'Стелс-серия',
    description: 'Сверхбыстрые запястные приводы, ускоряющие серию ударов.',
    hpBonus: 150,
    armorBonus: 2,
    speedBonus: 0.7,
    energyBonus: 15,
    attackBonus: 11,
  },
  {
    id: 'arms_emperor',
    slot: 'arms',
    style: 'emperor',
    name: 'Наплечники Ксенона',
    series: 'Тяжёлая рама',
    description: 'Широкие бронированные манипуляторы для сокрушительных атак молотом.',
    hpBonus: 230,
    armorBonus: 5,
    speedBonus: -0.4,
    energyBonus: 8,
    attackBonus: 11,
  },
  {
    id: 'arms_hunter',
    slot: 'arms',
    style: 'hunter',
    name: 'Стабилизаторы Охотника',
    series: 'Снайперская рама',
    description: 'Гасят отдачу при стрельбе и удерживают прицел в движении.',
    hpBonus: 175,
    armorBonus: 3,
    speedBonus: 0.3,
    energyBonus: 6,
    attackBonus: 13,
  },
  {
    id: 'arms_odin',
    slot: 'arms',
    style: 'odin',
    name: 'Крылья-руки Одина',
    series: 'Экспериментальная рама',
    description: 'Аэродинамические манипуляторы со встроенными энергоканалами.',
    hpBonus: 225,
    armorBonus: 5,
    speedBonus: 0.5,
    energyBonus: 18,
    attackBonus: 15,
  },

  // LEGS
  {
    id: 'legs_achilles',
    slot: 'legs',
    style: 'achilles',
    name: 'Поножи Ахиллеса',
    series: 'Рыцарская рама',
    description: 'Универсальное шасси с мягкой амортизацией после рывков.',
    hpBonus: 220,
    armorBonus: 4,
    speedBonus: 0.6,
    energyBonus: 12,
    attackBonus: 3,
  },
  {
    id: 'legs_kunoichi',
    slot: 'legs',
    style: 'kunoichi',
    name: 'Стопы Куноичи',
    series: 'Стелс-серия',
    description: 'Обеспечивают молниеносный спринт и резкую смену траектории.',
    hpBonus: 165,
    armorBonus: 2,
    speedBonus: 1.5,
    energyBonus: 20,
    attackBonus: 4,
  },
  {
    id: 'legs_emperor',
    slot: 'legs',
    style: 'emperor',
    name: 'Поножи Ксенона',
    series: 'Тяжёлая рама',
    description: 'Тяжёлые бронированные опоры, устойчивые к отбрасыванию.',
    hpBonus: 255,
    armorBonus: 5,
    speedBonus: -0.2,
    energyBonus: 10,
    attackBonus: 4,
  },
  {
    id: 'legs_hunter',
    slot: 'legs',
    style: 'hunter',
    name: 'Шасси Охотника',
    series: 'Снайперская рама',
    description: 'Двухсуставные ноги с высокой устойчивостью на любой поверхности.',
    hpBonus: 195,
    armorBonus: 3,
    speedBonus: 0.9,
    energyBonus: 6,
    attackBonus: 4,
  },
  {
    id: 'legs_odin',
    slot: 'legs',
    style: 'odin',
    name: 'Реактивные ноги Одина',
    series: 'Экспериментальная рама',
    description: 'Оснащены дополнительными стабилизаторами скольжения.',
    hpBonus: 245,
    armorBonus: 5,
    speedBonus: 1.3,
    energyBonus: 22,
    attackBonus: 5,
  },

  // BOOSTERS
  {
    id: 'booster_achilles',
    slot: 'booster',
    style: 'achilles',
    name: 'Плащ и ранец Ахиллеса',
    series: 'Рыцарская рама',
    description: 'Тканевый стабилизатор с парой сбалансированных микротурбин.',
    hpBonus: 40,
    armorBonus: 1,
    speedBonus: 0.5,
    energyBonus: 18,
    attackBonus: 2,
  },
  {
    id: 'booster_kunoichi',
    slot: 'booster',
    style: 'kunoichi',
    name: 'Шарф-ускоритель Синоби',
    series: 'Стелс-серия',
    description: 'Компактный турбоблок для серии мгновенных уклонений.',
    hpBonus: 25,
    armorBonus: 0,
    speedBonus: 1.0,
    energyBonus: 28,
    attackBonus: 3,
  },
  {
    id: 'booster_emperor',
    slot: 'booster',
    style: 'emperor',
    name: 'Мантия и ранец Ксенона',
    series: 'Тяжёлая рама',
    description: 'Бронированная мантия с мощными выхлопными блоками для прорыва дистанции.',
    hpBonus: 60,
    armorBonus: 2,
    speedBonus: 0.2,
    energyBonus: 18,
    attackBonus: 4,
  },
  {
    id: 'booster_hunter',
    slot: 'booster',
    style: 'hunter',
    name: 'Энергоблок Охотника',
    series: 'Снайперская рама',
    description: 'Дополнительный аккумулятор для затяжных перестрелок.',
    hpBonus: 45,
    armorBonus: 1,
    speedBonus: 0.4,
    energyBonus: 32,
    attackBonus: 4,
  },
  {
    id: 'booster_odin',
    slot: 'booster',
    style: 'odin',
    name: 'Крылья Одина (V-Jet)',
    series: 'Экспериментальная рама',
    description: 'Раскладной реактивный узел с максимальной тягой и регенерацией.',
    hpBonus: 60,
    armorBonus: 2,
    speedBonus: 1.1,
    energyBonus: 35,
    attackBonus: 6,
  },
];

export const LBX_WEAPONS: LbxWeapon[] = [
  {
    id: 'weapon_lance',
    kind: 'lance',
    name: 'Копьё и Щит Ахиллеса',
    shortLabel: 'Копьё + Щит',
    description:
      'Классическое рыцарское вооружение: длинный выпад копьём и мощный щит, поглощающий до 70% урона в блоке.',
    damage: 115,
    range: 3.3,
    attackSpeed: 1.0,
    moveSpeedMod: 1.0,
    blockMitigation: 0.72,
    isRanged: false,
    specialName: 'Удар Грозы',
    specialDesc: 'Молниеносный штурмовой выпад с грозовым разрядом и электрической волной.',
    accentHex: '#38BDF8',
  },
  {
    id: 'weapon_kodachi',
    kind: 'kodachi',
    name: 'Парные клинки Кодати',
    shortLabel: 'Парные клинки',
    description:
      'Молниеносные комбинации ближнего боя и повышенная манёвренность. Идеальны для фланговых атак.',
    damage: 86,
    range: 2.55,
    attackSpeed: 1.38,
    moveSpeedMod: 1.12,
    blockMitigation: 0.52,
    isRanged: false,
    specialName: 'Быстрый как ветер',
    specialDesc: 'Серия молниеносных горизонтальных ударов с мощным выпадом снизу вверх, подбрасывающим врага.',
    accentHex: '#C084FC',
  },
  {
    id: 'weapon_hammer',
    kind: 'hammer',
    name: 'Молот Ксенона',
    shortLabel: 'Боевой молот',
    description:
      'Сокрушительный двуручный боевой молот Ксенона, пробивающий устойчивость и отбрасывающий врага.',
    damage: 134,
    range: 2.95,
    attackSpeed: 0.72,
    moveSpeedMod: 0.89,
    blockMitigation: 0.56,
    isRanged: false,
    specialName: 'Удар Ксенона',
    specialDesc: 'Вихревой прыжок с сокрушительным двуручным ударом молота о пол и двойной ударной волной.',
    accentHex: '#F59E0B',
  },
  {
    id: 'weapon_rifle',
    kind: 'rifle',
    name: 'Снайперская винтовка Охотника',
    shortLabel: 'Снайперская винтовка',
    description:
      'Дальнобойный высокоскоростной карабин с оптическим прицелом на ПКМ. Высокая скорость снаряда при умеренном базовом уроне.',
    damage: 78,
    range: 30.0,
    attackSpeed: 1.08,
    moveSpeedMod: 0.94,
    blockMitigation: 0.48,
    isRanged: true,
    specialName: 'Залп Стингера',
    specialDesc: 'Залп самонаводящихся ракет со спинных установок, преследующих цель.',
    accentHex: '#34D399',
  },
  {
    id: 'weapon_halberd',
    kind: 'halberd',
    name: 'Лучевой палаш Одина',
    shortLabel: 'Лучевой палаш',
    description:
      'Экспериментальный энергоклинок с увеличенной дальностью размаха и сбалансированной скоростью.',
    damage: 128,
    range: 3.55,
    attackSpeed: 1.08,
    moveSpeedMod: 1.05,
    blockMitigation: 0.65,
    isRanged: false,
    specialName: 'Разряд Гунгнира',
    specialDesc: 'Высвобождение плазменной дуги, поражающей всю область перед LBX.',
    accentHex: '#F97316',
  },
];

export const LBX_PAINTS: LbxPaint[] = [
  {
    id: 'paint_achilles',
    name: 'Синий Ахиллес',
    primary: '#2563EB',
    secondary: '#F1F5F9',
    accent: '#F59E0B',
    frame: '#334155',
    visor: '#38BDF8',
  },
  {
    id: 'paint_emperor',
    name: 'Багровый Ксенон',
    primary: '#B91C1C',
    secondary: '#1E293B',
    accent: '#FBBF24',
    frame: '#1F2937',
    visor: '#F97316',
  },
  {
    id: 'paint_kunoichi',
    name: 'Ночной Синоби',
    primary: '#581C87',
    secondary: '#E2E8F0',
    accent: '#EC4899',
    frame: '#1E1B4B',
    visor: '#E879F9',
  },
  {
    id: 'paint_hunter',
    name: 'Тактический Сафари',
    primary: '#3F6212',
    secondary: '#D6D3D1',
    accent: '#F97316',
    frame: '#292524',
    visor: '#4ADE80',
  },
  {
    id: 'paint_odin',
    name: 'Белый Прототип',
    primary: '#E2E8F0',
    secondary: '#1E3A8A',
    accent: '#06B6D4',
    frame: '#334155',
    visor: '#22D3EE',
  },
  {
    id: 'paint_obsidian',
    name: 'Золотой Обсидиан',
    primary: '#18181B',
    secondary: '#3F3F46',
    accent: '#F59E0B',
    frame: '#09090B',
    visor: '#FACC15',
  },
];

export const ARENAS: ArenaConfig[] = [
  {
    id: 'meadow',
    name: 'Изумрудная долина',
    subtitle: 'Открытая аниме-диорама LBX',
    description:
      'Огромная солнечная долина в стиле аниме LBX: многоярусные скальные утёсы, на которые можно залезать, древние руины с черепичной крышей, просторные поляны, озеро и сосновые рощи.',
    radius: 54,
    skyColor: '#6ec6f5',
    fogColor: '#cdeeff',
    floorPrimary: '#2d7822',
    floorSecondary: '#215c19',
    accentColor: '#34D399',
    obstacles: [
      // Юго-западная 3-ярусная ступенчатая скала (подъём до вершины)
      { id: 'm_mesa_sw_top', x: -18.0, z: 16.5, radius: 3.4, height: 3.85, kind: 'rock' },
      { id: 'm_mesa_sw_mid', x: -13.6, z: 15.0, radius: 2.2, height: 2.45, kind: 'rock' },
      { id: 'm_mesa_sw_low', x: -10.2, z: 13.5, radius: 1.65, height: 1.25, kind: 'rock' },

      // Северо-восточная 3-ярусная ступенчатая скала
      { id: 'm_mesa_ne_top', x: 18.0, z: -16.5, radius: 3.5, height: 3.95, kind: 'rock' },
      { id: 'm_mesa_ne_mid', x: 13.5, z: -15.0, radius: 2.2, height: 2.5, kind: 'rock' },
      { id: 'm_mesa_ne_low', x: 10.0, z: -13.4, radius: 1.65, height: 1.25, kind: 'rock' },

      // Северо-западный 3-ярусный горный массив (высокая снайперская позиция)
      { id: 'm_cliff_nw_top', x: -29.0, z: -22.0, radius: 3.4, height: 3.8, kind: 'rock' },
      { id: 'm_cliff_nw_mid', x: -24.5, z: -20.2, radius: 2.15, height: 2.4, kind: 'rock' },
      { id: 'm_cliff_nw_low', x: -20.9, z: -18.5, radius: 1.6, height: 1.2, kind: 'rock' },

      // Юго-восточный 3-ярусный горный массив
      { id: 'm_cliff_se_top', x: 29.0, z: 21.5, radius: 3.4, height: 3.75, kind: 'rock' },
      { id: 'm_cliff_se_mid', x: 24.5, z: 19.6, radius: 2.15, height: 2.35, kind: 'rock' },
      { id: 'm_cliff_se_low', x: 20.9, z: 18.0, radius: 1.6, height: 1.2, kind: 'rock' },

      // Западный и восточный скальные уступы со ступенькой
      { id: 'm_cliff_w_top', x: -36.5, z: 5.5, radius: 3.1, height: 2.85, kind: 'rock' },
      { id: 'm_cliff_w_low', x: -32.4, z: 4.4, radius: 1.85, height: 1.4, kind: 'rock' },
      { id: 'm_cliff_e_top', x: 36.0, z: -4.5, radius: 3.1, height: 2.8, kind: 'rock' },
      { id: 'm_cliff_e_low', x: 32.0, z: -3.6, radius: 1.85, height: 1.38, kind: 'rock' },

      // Дополнительные северный и южный скальные плато (обзор на центр долины)
      { id: 'm_cliff_n_top', x: -5.5, z: -36.5, radius: 3.0, height: 2.75, kind: 'rock' },
      { id: 'm_cliff_n_low', x: -3.8, z: -32.6, radius: 1.75, height: 1.35, kind: 'rock' },
      { id: 'm_cliff_s_top', x: 5.5, z: 36.5, radius: 3.0, height: 2.75, kind: 'rock' },
      { id: 'm_cliff_s_low', x: 3.8, z: 32.6, radius: 1.75, height: 1.35, kind: 'rock' },

      // Внешние валуны-трамплины (запрыгиваются с одного прыжка)
      { id: 'm_rock_sw', x: -33.0, z: 28.0, radius: 1.9, height: 1.7, kind: 'rock' },
      { id: 'm_rock_ne', x: 33.0, z: -28.0, radius: 1.9, height: 1.75, kind: 'rock' },
      { id: 'm_rock_s', x: 18.0, z: 33.5, radius: 1.95, height: 1.8, kind: 'rock' },
      { id: 'm_rock_n', x: -18.0, z: -33.5, radius: 1.95, height: 1.8, kind: 'rock' },

      // Центрально-левые руины: каменный храм с красно-коричневой крышей и обломки стены
      { id: 'm_shrine', x: -10.5, z: -5.5, radius: 2.05, height: 2.55, kind: 'ruin' },
      { id: 'm_wall_l', x: -13.8, z: -1.4, radius: 1.35, height: 1.38, kind: 'ruin' },
      { id: 'm_wall_b', x: -9.8, z: 2.4, radius: 1.35, height: 1.38, kind: 'ruin' },
      { id: 'm_wall_r', x: -5.2, z: 1.5, radius: 1.25, height: 1.32, kind: 'ruin' },

      // Разрушаемые деревянные ящики снабжения
      { id: 'm_c1', x: 8.5, z: 9.5, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 140 },
      { id: 'm_c2', x: -15.5, z: -10.5, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 140 },
      { id: 'm_c3', x: 20.5, z: 3.5, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 140 },
      { id: 'm_c4', x: -3.5, z: 23.0, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 140 },
      { id: 'm_c5', x: 3.5, z: -23.0, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 140 },
    ],
    interactables: [
      { id: 'm_heal', x: 1.2, z: -0.8, radius: 1.55, kind: 'repair_node' },
      { id: 'm_boost1', x: -24.0, z: -4.5, radius: 1.5, kind: 'boost_pad' },
      { id: 'm_boost2', x: 24.0, z: 4.5, radius: 1.5, kind: 'boost_pad' },
      { id: 'm_boost3', x: 0, z: 29.0, radius: 1.5, kind: 'boost_pad' },
      { id: 'm_boost4', x: 0, z: -29.0, radius: 1.5, kind: 'boost_pad' },
    ],
  },
  {
    id: 'cardboard',
    name: 'Картонная крепость DICE',
    subtitle: 'Магазин «Тайни Орбит»',
    description:
      'Просторный настольный полигон из гофрокартона с разрушаемыми баррикадами, тактическими блоками и точками подзарядки.',
    radius: 22.0,
    skyColor: '#131B2E',
    fogColor: '#131B2E',
    floorPrimary: '#C69C6D',
    floorSecondary: '#8C6239',
    accentColor: '#F59E0B',
    obstacles: [
      { id: 'cb1', x: -7.0, z: -5.4, radius: 1.25, height: 1.85, kind: 'block' },
      { id: 'cb2', x: 7.0, z: 5.4, radius: 1.25, height: 1.85, kind: 'block' },
      { id: 'cb3', x: -6.8, z: 6.4, radius: 1.1, height: 1.48, kind: 'block' },
      { id: 'cb4', x: 6.8, z: -6.4, radius: 1.1, height: 1.48, kind: 'block' },
      { id: 'cb5', x: 0, z: -6.8, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 120 },
      { id: 'cb6', x: 0, z: 6.8, radius: 1.0, height: 1.38, kind: 'crate', destructible: true, maxHp: 120 },
      { id: 'cb7', x: -13.0, z: 0, radius: 1.2, height: 1.75, kind: 'block' },
      { id: 'cb8', x: 13.0, z: 0, radius: 1.2, height: 1.75, kind: 'block' },
    ],
    interactables: [
      { id: 'cb_heal', x: 0, z: 0, radius: 1.4, kind: 'repair_node' },
      { id: 'cb_b1', x: -9.8, z: -11.0, radius: 1.3, kind: 'boost_pad' },
      { id: 'cb_b2', x: 9.8, z: 11.0, radius: 1.3, kind: 'boost_pad' },
    ],
  },
  {
    id: 'factory',
    name: 'Диорама «Склад №4»',
    subtitle: 'Индустриальный полигон',
    description:
      'Большой грузовой терминал с металлическими контейнерами, разрушаемыми ящиками снабжения и энерго-узлами.',
    radius: 23.0,
    skyColor: '#0E1522',
    fogColor: '#0E1522',
    floorPrimary: '#334155',
    floorSecondary: '#1E293B',
    accentColor: '#EAB308',
    obstacles: [
      { id: 'f1', x: 0, z: -8.2, radius: 1.35, height: 1.95, kind: 'crate' },
      { id: 'f2', x: 0, z: 8.2, radius: 1.35, height: 1.95, kind: 'crate' },
      { id: 'f3', x: -8.8, z: 0, radius: 1.3, height: 1.75, kind: 'crate' },
      { id: 'f4', x: 8.8, z: 0, radius: 1.3, height: 1.75, kind: 'crate' },
      { id: 'f5', x: -5.8, z: -5.8, radius: 1.0, height: 1.42, kind: 'block', destructible: true, maxHp: 130 },
      { id: 'f6', x: 5.8, z: 5.8, radius: 1.0, height: 1.42, kind: 'block', destructible: true, maxHp: 130 },
      { id: 'f7', x: -12.6, z: 7.8, radius: 1.2, height: 1.85, kind: 'crate' },
      { id: 'f8', x: 12.6, z: -7.8, radius: 1.2, height: 1.85, kind: 'crate' },
    ],
    interactables: [
      { id: 'f_heal', x: 0, z: 0, radius: 1.4, kind: 'repair_node' },
      { id: 'f_b1', x: -11.0, z: -10.5, radius: 1.3, kind: 'boost_pad' },
      { id: 'f_b2', x: 11.0, z: 10.5, radius: 1.3, kind: 'boost_pad' },
    ],
  },
  {
    id: 'canyon',
    name: 'Пустынные руины',
    subtitle: 'Отборочный этап Артемиды',
    description:
      'Обширная песчаная арена со скальными шпилями, руинами и тактическими укрытиями для затяжных дуэлей.',
    radius: 24.0,
    skyColor: '#1F1614',
    fogColor: '#1F1614',
    floorPrimary: '#B45309',
    floorSecondary: '#78350F',
    accentColor: '#FB923C',
    obstacles: [
      { id: 'c1', x: -7.8, z: -4.2, radius: 1.45, height: 2.25, kind: 'rock' },
      { id: 'c2', x: 7.8, z: 4.2, radius: 1.45, height: 2.25, kind: 'rock' },
      { id: 'c3', x: 4.4, z: -8.8, radius: 1.2, height: 1.75, kind: 'rock' },
      { id: 'c4', x: -4.4, z: 8.8, radius: 1.2, height: 1.75, kind: 'rock' },
      { id: 'c5', x: -13.0, z: 6.2, radius: 1.35, height: 2.05, kind: 'ruin' },
      { id: 'c6', x: 13.0, z: -6.2, radius: 1.35, height: 2.05, kind: 'ruin' },
      { id: 'c7', x: 0, z: -5.0, radius: 0.95, height: 1.35, kind: 'crate', destructible: true, maxHp: 120 },
      { id: 'c8', x: 0, z: 5.0, radius: 0.95, height: 1.35, kind: 'crate', destructible: true, maxHp: 120 },
    ],
    interactables: [
      { id: 'c_heal', x: 0, z: 0, radius: 1.4, kind: 'repair_node' },
      { id: 'c_b1', x: -12.4, z: -9.8, radius: 1.35, kind: 'boost_pad' },
      { id: 'c_b2', x: 12.4, z: 9.8, radius: 1.35, kind: 'boost_pad' },
    ],
  },
  {
    id: 'artemis',
    name: 'Колизей Артемиды',
    subtitle: 'Центральный финал',
    description:
      'Масштабная высокотехнологичная арена мирового турнира с энергетическими колоннами и зонами перегрузки.',
    radius: 25.0,
    skyColor: '#090D18',
    fogColor: '#090D18',
    floorPrimary: '#1E293B',
    floorSecondary: '#0F172A',
    accentColor: '#06B6D4',
    obstacles: [
      { id: 'a1', x: -8.6, z: -8.6, radius: 1.15, height: 2.75, kind: 'pillar' },
      { id: 'a2', x: 8.6, z: -8.6, radius: 1.15, height: 2.75, kind: 'pillar' },
      { id: 'a3', x: -8.6, z: 8.6, radius: 1.15, height: 2.75, kind: 'pillar' },
      { id: 'a4', x: 8.6, z: 8.6, radius: 1.15, height: 2.75, kind: 'pillar' },
      { id: 'a5', x: -14.6, z: 0, radius: 1.2, height: 2.25, kind: 'pillar' },
      { id: 'a6', x: 14.6, z: 0, radius: 1.2, height: 2.25, kind: 'pillar' },
      { id: 'a7', x: 0, z: -7.5, radius: 1.0, height: 1.42, kind: 'crate', destructible: true, maxHp: 140 },
      { id: 'a8', x: 0, z: 7.5, radius: 1.0, height: 1.42, kind: 'crate', destructible: true, maxHp: 140 },
    ],
    interactables: [
      { id: 'a_heal', x: 0, z: 0, radius: 1.5, kind: 'repair_node' },
      { id: 'a_b1', x: -13.0, z: -12.0, radius: 1.4, kind: 'boost_pad' },
      { id: 'a_b2', x: 13.0, z: 12.0, radius: 1.4, kind: 'boost_pad' },
    ],
  },
];

export const DEFAULT_PLAYER_LOADOUT: LbxLoadout = {
  name: 'Ахиллес Бан',
  characterId: 'achilles',
  headId: 'head_achilles',
  torsoId: 'torso_achilles',
  armsId: 'arms_achilles',
  legsId: 'legs_achilles',
  boosterId: 'booster_achilles',
  weaponId: 'weapon_lance',
  paintId: 'paint_achilles',
};

export const LBX_CHARACTERS: LbxCharacterPreset[] = [
  {
    id: 'achilles',
    name: 'Ахиллес',
    genitiveName: 'Ахиллеса',
    role: 'Рыцарь ближнего боя',
    description: 'Сбалансированный герой с длинным копьём, щитом и плащом.',
    accentHex: '#38BDF8',
    loadout: DEFAULT_PLAYER_LOADOUT,
    requiredPartIds: ['head_achilles', 'torso_achilles', 'weapon_lance'],
  },
  {
    id: 'hunter',
    name: 'Охотник',
    genitiveName: 'Охотника',
    role: 'Снайпер-стрелок',
    description:
      'Дальнобойный LBX без щита: компенсирует защиту высокой выносливостью, мощным рывком и сильным прыжком.',
    accentHex: '#4ADE80',
    loadout: {
      name: 'Охотник',
      characterId: 'hunter',
      headId: 'head_hunter',
      torsoId: 'torso_hunter',
      armsId: 'arms_hunter',
      legsId: 'legs_hunter',
      boosterId: 'booster_hunter',
      weaponId: 'weapon_rifle',
      paintId: 'paint_hunter',
    },
    requiredPartIds: ['head_hunter', 'torso_hunter', 'weapon_rifle'],
  },
  {
    id: 'kunoichi',
    name: 'Куноичи',
    genitiveName: 'Куноичи',
    role: 'Мастер скорости',
    description: 'Сверхлёгкий фланговый боец с парными клинками Кодати.',
    accentHex: '#E879F9',
    loadout: {
      name: 'Куноичи',
      characterId: 'kunoichi',
      headId: 'head_kunoichi',
      torsoId: 'torso_kunoichi',
      armsId: 'arms_kunoichi',
      legsId: 'legs_kunoichi',
      boosterId: 'booster_kunoichi',
      weaponId: 'weapon_kodachi',
      paintId: 'paint_kunoichi',
    },
    requiredPartIds: ['head_kunoichi', 'torso_kunoichi', 'weapon_kodachi'],
  },
  {
    id: 'emperor',
    name: 'Ксенон',
    genitiveName: 'Ксенона',
    role: 'Тяжёлый штурмовик',
    description: 'Мощная титановая броня с мантией и сокрушительный боевой молот.',
    accentHex: '#F59E0B',
    loadout: {
      name: 'Ксенон',
      characterId: 'emperor',
      headId: 'head_emperor',
      torsoId: 'torso_emperor',
      armsId: 'arms_emperor',
      legsId: 'legs_emperor',
      boosterId: 'booster_emperor',
      weaponId: 'weapon_hammer',
      paintId: 'paint_emperor',
    },
    requiredPartIds: ['head_emperor', 'torso_emperor'],
  },
  {
    id: 'odin',
    name: 'Один',
    genitiveName: 'Одина',
    role: 'Экспериментальный ас',
    description: 'Гипер-рама с реактивными крыльями и лучевым палашом.',
    accentHex: '#22D3EE',
    loadout: {
      name: 'Один Прототип',
      characterId: 'odin',
      headId: 'head_odin',
      torsoId: 'torso_odin',
      armsId: 'arms_odin',
      legsId: 'legs_odin',
      boosterId: 'booster_odin',
      weaponId: 'weapon_halberd',
      paintId: 'paint_odin',
    },
    requiredPartIds: ['head_odin', 'torso_odin'],
  },
];

export const INITIAL_UNLOCKED_PARTS: string[] = [
  'head_achilles',
  'torso_achilles',
  'arms_achilles',
  'legs_achilles',
  'booster_achilles',
  'head_hunter',
  'torso_hunter',
  'arms_hunter',
  'legs_hunter',
  'booster_hunter',
  'head_kunoichi',
  'torso_kunoichi',
  'arms_kunoichi',
  'legs_kunoichi',
  'booster_kunoichi',
  'weapon_lance',
  'weapon_rifle',
  'weapon_kodachi',
];

export function getCharacterById(id: ModelStyle): LbxCharacterPreset {
  return LBX_CHARACTERS.find((c) => c.id === id) ?? LBX_CHARACTERS[0];
}

export function getLoadoutCharacterId(loadout: LbxLoadout): ModelStyle {
  if (loadout.characterId) return loadout.characterId;
  const torso = LBX_PARTS.find((p) => p.id === loadout.torsoId);
  if (torso) return torso.style;
  const head = LBX_PARTS.find((p) => p.id === loadout.headId);
  return head?.style ?? 'achilles';
}

export function getPartById(id: string): LbxPart {
  return LBX_PARTS.find((p) => p.id === id) ?? LBX_PARTS[0];
}

export function getPartsBySlot(slot: PartSlot): LbxPart[] {
  return LBX_PARTS.filter((p) => p.slot === slot);
}

export function getWeaponById(id: string): LbxWeapon {
  return LBX_WEAPONS.find((w) => w.id === id) ?? LBX_WEAPONS[0];
}

export function getPaintById(id: string): LbxPaint {
  return LBX_PAINTS.find((p) => p.id === id) ?? LBX_PAINTS[0];
}

export function getArenaById(id: string): ArenaConfig {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}

export function computeLoadoutStats(loadout: LbxLoadout): ComputedLbxStats {
  const parts = [
    getPartById(loadout.headId),
    getPartById(loadout.torsoId),
    getPartById(loadout.armsId),
    getPartById(loadout.legsId),
    getPartById(loadout.boosterId),
  ];
  const weapon = getWeaponById(loadout.weaponId);

  const hpSum = parts.reduce((acc, p) => acc + p.hpBonus, 0);
  const armorSum = parts.reduce((acc, p) => acc + p.armorBonus, 0);
  const speedSum = parts.reduce((acc, p) => acc + p.speedBonus, 0);
  const energySum = parts.reduce((acc, p) => acc + p.energyBonus, 0);
  const attackSum = parts.reduce((acc, p) => acc + p.attackBonus, 0);

  const charId = getLoadoutCharacterId(loadout);
  const isHunter = charId === 'hunter';

  const baseMoveSpeed = 5.6;
  const moveSpeed = Math.max(4.2, (baseMoveSpeed + speedSum * 0.65) * weapon.moveSpeedMod);
  const baseDashSpeed = moveSpeed * 2.45;
  const dashSpeed = isHunter ? baseDashSpeed * 1.08 : baseDashSpeed;
  const dashDuration = isHunter ? 0.25 : 0.24;
  const baseJumpPower = 10.35 + Math.max(0, moveSpeed - 8) * 0.18;
  const jumpPower = isHunter ? baseJumpPower * 1.12 : baseJumpPower;
  const maxEnergy = Math.round(60 + energySum + (isHunter ? -18 : 0));
  const energyRegen = Number((18 + energySum * 0.14 + (isHunter ? -3.6 : 0)).toFixed(1));

  return {
    maxHp: Math.round(hpSum * 2.45),
    armor: Math.min(44, Math.max(8, Math.round(armorSum * 1.18))),
    moveSpeed: Number(moveSpeed.toFixed(2)),
    dashSpeed: Number(dashSpeed.toFixed(2)),
    dashDuration,
    jumpPower: Number(jumpPower.toFixed(2)),
    maxEnergy,
    energyRegen,
    attackPower: Math.round(100 + attackSum * 1.4),
    canGuard: !isHunter,
  };
}
