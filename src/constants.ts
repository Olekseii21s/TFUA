/** Тексти кнопок. Обробники реагують саме на ці рядки, тож змінюйте обережно. */
export const BTN = {
    search: "🔥 Шукати тімейтів",
    profile: "👤 Моя анкета",
    createProfile: "📝 Створити анкету",
    requests: "📨 Запити",
    teammates: "🤝 Мої тімейти",
    filters: "⚙️ Фільтри пошуку",
    bug: "🐞 Повідомити про проблему",
    back: "🔙 Назад",
    done: "✅ Готово",
    myGames: "🎮 Мої ігри",
    anyRank: "Будь-який ранг",
    noRank: "🤷 Без рангу",
    skip: "⏭ Пропустити",
    male: "👨 Чоловік",
    female: "👩 Жінка",
    anyGender: "🌍 Будь-яка",
    anyAge: "🎂 Будь-який вік",
    editName: "📝 Ім'я",
    editAge: "🎂 Вік",
    editGender: "👤 Стать",
    editAbout: "📄 Про себе",
    editGames: "🎮 Ігри та ранги",
    deleteProfile: "🗑 Видалити анкету",
    pauseProfile: "⏸ Приховати анкету",
    resumeProfile: "▶️ Показати анкету",
    // Кнопки старих версій бота, які ще можуть лишатися в чатах користувачів.
    legacyEditProfile: "✏️ Редагувати анкету",
    legacyEditSearch: "✏️ Редагувати пошук"
} as const;

export const BANNED_TEXT = "⛔ Ваш акаунт заблоковано адміністрацією.";
export const LIMIT_TEXT = "⏳ Забагато спроб. Спробуйте пізніше.";

export const NAME_MAX_LENGTH = 32;
export const ABOUT_MAX_LENGTH = 500;
export const CUSTOM_RANK_MAX_LENGTH = 30;
export const REPORT_MAX_LENGTH = 1000;
export const MAX_PROFILE_GAMES = 5;

export const MIN_AGE = 14;
export const MAX_AGE = 99;
export const ADULT_AGE = 18;

/** Скільки днів не показувати пропущену анкету. */
export const SKIP_HIDE_DAYS = 3;

/** Гравців, які не заходили довше, не показуємо в пошуку і не надсилаємо їм сповіщень. */
export const INACTIVE_DAYS = 30;

/** Гравці, активні за останні N днів, показуються в пошуку першими. */
export const RECENT_DAYS = 3;

/** Через скільки днів запрошення без відповіді згорає. */
export const REQUEST_TTL_DAYS = 7;

/** Через скільки днів забувати незавершений діалог або видачу пошуку. */
export const SESSION_TTL_DAYS = 7;

export const GENDERS: string[] = [BTN.male, BTN.female];

export const GAMES = [
    "CS2",
    "Valorant",
    "League of Legends",
    "Dota 2",
    "Rainbow Six Siege",
    "Apex Legends",
    "Fortnite",
    "Overwatch 2",
    "Dead by Daylight",
    "PUBG",
    "Rocket League",
    "Marvel Rivals",
    "World of Tanks",
    "War Thunder",
    "Rust",
    "Escape from Tarkov",
    "Minecraft"
];

export const GAME_RANKS: Record<string, string[]> = {
    "CS2": [
        "1 lvl", "2 lvl", "3 lvl", "4 lvl", "5 lvl",
        "6 lvl", "7 lvl", "8 lvl", "9 lvl", "10 lvl"
    ],

    "Valorant": [
        "Iron 1", "Iron 2", "Iron 3",
        "Bronze 1", "Bronze 2", "Bronze 3",
        "Silver 1", "Silver 2", "Silver 3",
        "Gold 1", "Gold 2", "Gold 3",
        "Platinum 1", "Platinum 2", "Platinum 3",
        "Diamond 1", "Diamond 2", "Diamond 3",
        "Ascendant 1", "Ascendant 2", "Ascendant 3",
        "Immortal 1", "Immortal 2", "Immortal 3",
        "Radiant"
    ],

    "League of Legends": [
        "Iron IV", "Iron III", "Iron II", "Iron I",
        "Bronze IV", "Bronze III", "Bronze II", "Bronze I",
        "Silver IV", "Silver III", "Silver II", "Silver I",
        "Gold IV", "Gold III", "Gold II", "Gold I",
        "Platinum IV", "Platinum III", "Platinum II", "Platinum I",
        "Emerald IV", "Emerald III", "Emerald II", "Emerald I",
        "Diamond IV", "Diamond III", "Diamond II", "Diamond I",
        "Master", "Grandmaster", "Challenger"
    ],

    "Dota 2": [
        "Herald 1", "Herald 2", "Herald 3", "Herald 4", "Herald 5",
        "Guardian 1", "Guardian 2", "Guardian 3", "Guardian 4", "Guardian 5",
        "Crusader 1", "Crusader 2", "Crusader 3", "Crusader 4", "Crusader 5",
        "Archon 1", "Archon 2", "Archon 3", "Archon 4", "Archon 5",
        "Legend 1", "Legend 2", "Legend 3", "Legend 4", "Legend 5",
        "Ancient 1", "Ancient 2", "Ancient 3", "Ancient 4", "Ancient 5",
        "Divine 1", "Divine 2", "Divine 3", "Divine 4", "Divine 5",
        "Immortal"
    ]
};
