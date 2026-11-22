// Має бути першим імпортом: .env потрібен ще до підключення бази (DB_PATH).
import "dotenv/config";

import { Telegraf, Markup } from "telegraf";

import { deleteUser } from "./database/deleteUser";



import {
    banUser,
    unbanUser,
    isBanned
} from "./database/bans";


import {
    hideProfile,
    isHidden
} from "./database/hiddenProfiles";


import {
    saveUser,
    getUser,
    getAllUsers,
    updateField,
    UserRecord
} from "./database/users";

import {
    addUserGame,
    getUserGames,
    deleteUserGames
} from "./database/userGames";

import {
    saveSearchPreferences,
    getSearchPreferences,
    deleteSearchPreferences
} from "./database/searchPreferences";


import {
    createRequest,
    getRequests,
    getPendingRequest,
    updateRequestStatus
} from "./database/requests";

import {
    createMatch,
    hasMatch
} from "./database/matches";




import { registrationState } from "./database/registration";

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        console.error(`❌ Не задано змінну ${name} у файлі .env (див. .env.example)`);
        process.exit(1);
    }

    return value;
}

const BOT_TOKEN = requireEnv("BOT_TOKEN");

const ADMIN_ID = Number(requireEnv("ADMIN_ID"));

const channelIdRaw = requireEnv("CHANNEL_ID");

// Числовий ID (-100...) або @username каналу.
const CHANNEL_ID: number | string =
    /^-?\d+$/.test(channelIdRaw) ? Number(channelIdRaw) : channelIdRaw;

if (!Number.isInteger(ADMIN_ID)) {
    console.error("❌ ADMIN_ID у .env має бути числом");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const BANNED_TEXT = "⛔ Ваш акаунт заблоковано адміністрацією.";

// Бан перевіряється для БУДЬ-якої дії: повідомлень, кнопок меню та inline-кнопок.
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (userId && userId !== ADMIN_ID && isBanned(userId)) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(BANNED_TEXT);
        } else if (ctx.chat?.type === "private") {
            await ctx.reply(BANNED_TEXT);
        }

        return;
    }

    return next();
});

// ===== Валідація введених даних =====

const NAME_MAX_LENGTH = 32;
const ABOUT_MAX_LENGTH = 500;
const CUSTOM_RANK_MAX_LENGTH = 30;
const REPORT_MAX_LENGTH = 1000;

const MIN_AGE = 14;
const MAX_AGE = 99;

const GENDERS = ["👨 Чоловік", "👩 Жінка"];
const ANY_GENDER = "🌍 Будь-яка";

function parseAge(text: string): number | null {
    const age = Number(text.trim());

    if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
        return null;
    }

    return age;
}

const AGE_ERROR = `❌ Вік має бути цілим числом від ${MIN_AGE} до ${MAX_AGE}`;

function validateText(text: string, maxLength: number, label: string): string | null {
    const value = text.trim();

    if (!value) {
        return `❌ ${label} не може бути порожнім`;
    }

    if (value.length > maxLength) {
        return `❌ ${label}: максимум ${maxLength} символів (зараз ${value.length})`;
    }

    return null;
}

function formatGames(telegramId: number): string {
    const userGames: any[] = getUserGames(telegramId) as any[];

    return userGames.length
        ? userGames.map((g: any) => `🎮 ${g.game} — ${g.rank}`).join("\n")
        : "🎮 Ігри не вказані";
}

/** Текст анкети. Username показуємо лише після взаємної згоди (матчу). */
function formatProfile(profile: UserRecord, title?: string): string {
    const header = title ? `${title}\n\n` : "";

    return `${header}👤 ${profile.name}

${formatGames(profile.telegram_id)}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}

📝 ${profile.about}`;
}

function clearStateKey(telegramId: number, key: string) {
    const state = registrationState.get(telegramId);

    if (!state) return;

    const { [key]: _removed, ...rest } = state;

    if (Object.keys(rest).length) {
        registrationState.set(telegramId, rest);
    } else {
        registrationState.delete(telegramId);
    }
}

const GAMES = [
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

const GAME_RANKS: Record<string, string[]> = {
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


const reportedProfiles = new Map<number, number[]>();

const broadcastState =
    new Set<number>();


bot.start(async (ctx) => {

    await ctx.reply(
        `🎮 Вітаємо в Team Finder!

Тут ти можеш знайти тімейтів для улюблених ігор, переглядати анкети інших гравців та надсилати запити на спільну гру.

📋 Щоб почати:
• Створи свою анкету через кнопку «👤 Моя анкета»
• Обери ігри, в які граєш
• Додай свій ранг та короткий опис
• Шукай нових тімейтів та збирай команду

⚠️ Важливо:
Зараз бот знаходиться на ранній стадії розробки (Beta). Можливі помилки або некоректна робота окремих функцій.

💡 Якщо помітиш проблему або маєш ідею для покращення — обов'язково повідомляй. Завдяки вашим відгукам бот буде ставати кращим з кожним оновленням.

Бажаємо знайти чудову команду та гарної гри! 🎯`,

        Markup.keyboard([
            ["👤 Моя анкета"],
            ["✏️ Редагувати анкету"],
            ["🔥 Шукати тімейтів"],
            ["🐞 Повідомити про проблему"]
        ]).resize()
    );
});


function buildRankKeyboard(game: string) {
    const ranks = GAME_RANKS[game];

    if (!ranks) {
        return Markup.keyboard([
            ["🔙 Назад"]
        ]).resize();
    }

    const rows: string[][] = [];

    for (let i = 0; i < ranks.length; i += 2) {
        rows.push(ranks.slice(i, i + 2));
    }

    rows.push(["🔙 Назад"]);

    return Markup.keyboard(rows).resize();
}

function buildSearchRankKeyboard(game: string) {
    const ranks = GAME_RANKS[game] || [];
    const rows: string[][] = [];
    for (let i = 0; i < ranks.length; i += 2) rows.push(ranks.slice(i, i + 2));
    rows.push(["Будь-який ранг"]);
    return Markup.keyboard(rows).resize();
}

function parseRankFilters(value: unknown): Record<string, string> {
    if (typeof value !== "string" || !value) return {};
    try { return JSON.parse(value); } catch { return {}; }
}

function matchesSearchGames(user: any, games: string[], rankFilters: Record<string, string>) {
    const userGames: any[] = getUserGames(user.telegram_id) as any[];
    return games.some((game) => {
        const requiredRank = rankFilters[game];
        if (!requiredRank) return String(user.games || "").split(",").map((g: string) => g.trim()).includes(game);
        return userGames.some((entry) => entry.game === game && entry.rank === requiredRank);
    });
}

interface SearchFilters {
    gender: string;
    minAge: number;
    maxAge: number;
}

function findProfiles(
    telegramId: number,
    games: string[],
    rankFilters: Record<string, string>,
    filters: SearchFilters
): UserRecord[] {
    return getAllUsers()
        .filter((user) => {
            if (user.telegram_id === telegramId) return false;

            // Заблоковані користувачі не показуються в пошуку.
            if (isBanned(user.telegram_id)) return false;

            if (!matchesSearchGames(user, games, rankFilters)) return false;

            if (filters.gender !== ANY_GENDER && user.gender !== filters.gender) {
                return false;
            }

            const age = Number(user.age);

            return age >= filters.minAge && age <= filters.maxAge;
        })
        .sort(() => Math.random() - 0.5);
}

bot.hears("👤 Моя анкета", async (ctx) => {

    const telegramId = ctx.from.id;

    const profile: any = getUser(telegramId);

    if (!profile) {
        registrationState.set(telegramId, {
            step: "name"
        });

        return ctx.reply("Введіть своє ім'я:");
    }
    const userGames: any[] =
        getUserGames(telegramId) as any[];

    const gamesText =
        userGames.length
            ? userGames
                .map(
                    (g: any) =>
                        `🎮 ${g.game} — ${g.rank}`
                )
                .join("\n")
            : "🎮 Ігри не вказані";

    return ctx.reply(
        `✅ Анкету оновлено

👤 ${profile.name}

${gamesText}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}

📝 ${profile.about}`,
        Markup.keyboard([
            ["👤 Моя анкета"],
            ["✏️ Редагувати анкету"],
            ["🔥 Шукати тімейтів"],
            ["📨 Запити"]
        ]).resize()
    );
});


bot.command("ban", async (ctx) => {

    if (ctx.from.id !== ADMIN_ID) {
        return;
    }

    const args =
        ctx.message.text.split(" ");

    const userId =
        Number(args[1]);

    if (!userId) {

        return ctx.reply(
            "Приклад:\n/ban 123456789"
        );

    }

    banUser(userId);

    await ctx.reply(
        `✅ Користувач ${userId} заблокований`
    );

});


bot.command("unban", async (ctx) => {

    if (ctx.from.id !== ADMIN_ID) {
        return;
    }

    const args =
        ctx.message.text.split(" ");

    const userId =
        Number(args[1]);

    if (!userId) {

        return ctx.reply(
            "Приклад:\n/unban 123456789"
        );

    }

    unbanUser(userId);

    await ctx.reply(
        `✅ Користувач ${userId} розблокований`
    );

});


bot.command("admin", async (ctx) => {

    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply(
            "⛔ У вас немає доступу."
        );
    }

    await ctx.reply(
        "🛠 Адмін-панель",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "📊 Статистика",
                    "admin_stats"
                )
            ],
            [
                Markup.button.callback(
                    "🐞 Скарги",
                    "admin_reports"
                )
            ],
            [
                Markup.button.callback(
                    "📢 Розсилка",
                    "admin_broadcast"
                )
            ],
            [
                Markup.button.callback(
                    "👥 Користувачі",
                    "admin_users"
                )
            ]
        ])
    );

});

bot.action(
    "admin_stats",
    async (ctx) => {

        if (ctx.from.id !== ADMIN_ID) {
            return;
        }

        const users: any[] =
            getAllUsers() as any[];

        await ctx.reply(
            `📊 Статистика

👥 Користувачів: ${users.length}`
        );

        await ctx.answerCbQuery();

    }
);

bot.action(
    "admin_users",
    async (ctx) => {

        if (ctx.from.id !== ADMIN_ID) {
            return;
        }

        const users =
            getAllUsers();

        const lastUsers =
            users
                .slice(-10)
                .reverse();

        const text =
            lastUsers.map(
                (u: any) =>
                    `👤 ${u.name}
🆔 ${u.telegram_id}`
            ).join("\n\n");

        await ctx.reply(
            `👥 Останні користувачі

${text}`
        );

        await ctx.answerCbQuery();

    }
);

bot.action(
    "admin_reports",
    async (ctx) => {

        if (ctx.from.id !== ADMIN_ID) {
            return;
        }

        await ctx.reply(
            `🐞 Скарги переглядайте у каналі

${CHANNEL_ID}`
        );

        await ctx.answerCbQuery();

    }
);


bot.action(
    "admin_broadcast",
    async (ctx) => {

        if (ctx.from.id !== ADMIN_ID) {
            return;
        }

        broadcastState.add(
            ctx.from.id
        );

        await ctx.reply(
            "📢 Введіть текст розсилки:"
        );

        await ctx.answerCbQuery();

    }
);


bot.hears("✏️ Редагувати анкету", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply(
            "❌ Спочатку створіть анкету через кнопку 👤 Моя анкета"
        );
    }

    await ctx.reply(
        "Що хочете змінити?",
        Markup.keyboard([
            ["📝 Ім'я"],
            ["🎮 Ігри та ранги"],
            ["🎂 Вік"],
            ["👤 Стать"],
            ["📄 Про себе"],
            ["🗑 Видалити анкету"],
            ["🔙 Назад"]
        ]).resize()
    );
});

bot.hears("🗑 Видалити анкету", async (ctx) => {

    return ctx.reply(
        "⚠️ Ви впевнені, що хочете повністю видалити анкету?",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Так",
                    "delete_profile"
                )
            ],
            [
                Markup.button.callback(
                    "❌ Ні",
                    "cancel_delete"
                )
            ]
        ])
    );

});

bot.action("cancel_delete", async (ctx) => {

    await ctx.answerCbQuery();

    return ctx.editMessageText(
        "❌ Видалення скасовано."
    );

});


bot.action("delete_profile", async (ctx) => {

    const telegramId =
        ctx.from.id;

    deleteUser(
        telegramId
    );

    deleteSearchPreferences(
        telegramId
    );

    registrationState.delete(
        telegramId
    );

    await ctx.answerCbQuery();

    await ctx.reply(
        "✅ Анкету успішно видалено."
    );

    return ctx.reply(
        "Для створення нової анкети натисніть /start",
        Markup.removeKeyboard()
    );

});

bot.hears("📝 Ім'я", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply("❌ Спочатку створіть анкету");
    }

    registrationState.set(ctx.from.id, {
        editField: "name"
    });

    return ctx.reply("📝 Введіть нове ім'я:");
});

bot.hears("🎂 Вік", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply("❌ Спочатку створіть анкету");
    }

    registrationState.set(ctx.from.id, {
        editField: "age"
    });

    return ctx.reply("🎂 Введіть новий вік:");
});

bot.hears("👤 Стать", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply("❌ Спочатку створіть анкету");
    }

    registrationState.set(ctx.from.id, {
        editField: "gender"
    });

    return ctx.reply(
        "👤 Оберіть стать:",
        Markup.keyboard([
            ["👨 Чоловік"],
            ["👩 Жінка"],
            ["🔙 Назад"]
        ]).resize()
    );
});

bot.hears("📄 Про себе", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply("❌ Спочатку створіть анкету");
    }

    registrationState.set(ctx.from.id, {
        editField: "about"
    });

    return ctx.reply("📝 Введіть новий опис:");
});







bot.hears("🎮 Ігри та ранги", async (ctx) => {

    const profile: any = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply(
            "❌ Спочатку створіть анкету"
        );
    }

    registrationState.set(ctx.from.id, {
        editField: "games",
        games: []
    });

    await ctx.reply(
        "🎮 Оберіть ігри заново, а після цього бот попросить вибрати ранг для кожної гри:",
        Markup.keyboard([
            ["CS2", "Valorant"],
            ["League of Legends", "Dota 2"],
            ["Rainbow Six Siege", "Apex Legends"],
            ["Fortnite", "Overwatch 2"],
            ["Dead by Daylight", "PUBG"],
            ["Rocket League", "Marvel Rivals"],
            ["World of Tanks", "War Thunder"],
            ["Rust", "Escape from Tarkov"],
            ["Minecraft"],
            ["✅ Готово"],
            ["🔙 Назад"]
        ]).resize()
    );

});





bot.hears("🔙 Назад", async (ctx) => {

    registrationState.delete(
        ctx.from.id
    );

    await ctx.reply(
        "🏠 Головне меню",
        Markup.keyboard([
            ["👤 Моя анкета"],
            ["✏️ Редагувати анкету"],
            ["🔥 Шукати тімейтів"],
            ["🐞 Повідомити про проблему"]
        ]).resize()
    );

});


bot.hears(
    "🐞 Повідомити про проблему",
    async (ctx) => {

        registrationState.set(
            ctx.from.id,
            {
                reportBug: true
            }
        );

        await ctx.reply(
            "🐞 Опишіть проблему або запропонуйте покращення 👇"
        );

    }
);







bot.hears("🔥 Шукати тімейтів", async (ctx) => {
    const telegramId = ctx.from.id;
    const profile: any = getUser(telegramId);

    if (!profile) {
        return ctx.reply("❌ Спочатку створіть анкету через кнопку 👤 Моя анкета");
    }

    const saved: any = getSearchPreferences(telegramId);

    if (!saved) {
        registrationState.set(telegramId, {
            searchStep: "games",
            selectedGames: [],
            rankFilters: {},
            filters: {}
        });

        return ctx.reply(
            "🎮 Оберіть одну або декілька ігор для пошуку:",
            Markup.keyboard([
                ["CS2", "Valorant"],
                ["League of Legends", "Dota 2"],
                ["Rainbow Six Siege", "Apex Legends"],
                ["Fortnite", "Overwatch 2"],
                ["Dead by Daylight", "PUBG"],
                ["Rocket League", "Marvel Rivals"],
                ["World of Tanks", "War Thunder"],
                ["Rust", "Escape from Tarkov"],
                ["Minecraft"],
                ["✅ Готово"],
                ["🔙 Назад"]
            ]).resize()
        );
    }

    const selectedGames = String(saved.games || "")
        .split(",")
        .map((game: string) => game.trim())
        .filter(Boolean);
    const rankFilters = parseRankFilters(saved.rank_filters);

    const filters = {
        gender: saved.gender,
        minAge: Number(saved.min_age),
        maxAge: Number(saved.max_age)
    };

    const profiles = findProfiles(telegramId, selectedGames, rankFilters, filters);

    if (!profiles.length) {
        return ctx.reply(
            "😔 Нікого не знайдено за збереженими критеріями.",
            Markup.keyboard([
                ["✏️ Редагувати пошук"],
                ["🔥 Шукати тімейтів"],
                ["👤 Моя анкета"]
            ]).resize()
        );
    }

    registrationState.set(telegramId, {
        searchResults: profiles,
        currentIndex: 0
    });

    const profileToShow = profiles[0];
    const userGames: any[] = getUserGames(profileToShow.telegram_id) as any[];
    const gamesText = userGames.length
        ? userGames.map((g: any) => `🎮 ${g.game} — ${g.rank}`).join("\n")
        : "🎮 Ігри не вказані";

    return ctx.reply(
        `👤 ${profileToShow.name}\n\n${gamesText}\n🎂 Вік: ${profileToShow.age}\n👤 Стать: ${profileToShow.gender}\n\n📝 ${profileToShow.about}`,
        Markup.inlineKeyboard([
            [Markup.button.callback("🎮 Запросити в гру", `like_${profileToShow.telegram_id}`)],
            [Markup.button.callback("⚠️ Поскаржитись", `report_user_${profileToShow.telegram_id}`)],
            [Markup.button.callback("⏭ Пропустити", "skip")]
        ])
    );
});

bot.hears("✏️ Редагувати пошук", async (ctx) => {
    const telegramId = ctx.from.id;
    const saved: any = getSearchPreferences(telegramId);

    if (!saved) {
        return ctx.reply(
            "❌ Збережених критеріїв пошуку ще немає. Натисніть 🔥 Шукати тімейтів, щоб налаштувати пошук."
        );
    }

    registrationState.set(telegramId, {
        searchStep: "games",
        selectedGames: [],
        rankFilters: {},
        filters: {}
    });

    return ctx.reply(
        `✏️ Редагування пошуку\n\n🎮 Ігри: ${saved.games}\n👤 Стать: ${saved.gender}\n🎂 Вік: ${saved.min_age}-${saved.max_age}\n\n🎮 Оберіть ігри заново:`,
        Markup.keyboard([
            ["CS2", "Valorant"],
            ["League of Legends", "Dota 2"],
            ["Rainbow Six Siege", "Apex Legends"],
            ["Fortnite", "Overwatch 2"],
            ["Dead by Daylight", "PUBG"],
            ["Rocket League", "Marvel Rivals"],
            ["World of Tanks", "War Thunder"],
            ["Rust", "Escape from Tarkov"],
            ["Minecraft"],
            ["✅ Готово"],
            ["🔙 Назад"]
        ]).resize()
    );
});

    bot.on("text", async (ctx) => {


        if (
            ctx.message.text === "🔥 Шукати тімейтів" ||
            ctx.message.text === "👤 Моя анкета"
        ) {
            return;
        }

        const telegramId = ctx.from.id;

        const state = registrationState.get(telegramId);

        if (state?.reportBug) {

            const error = validateText(ctx.message.text, REPORT_MAX_LENGTH, "Повідомлення");

            if (error) {
                return ctx.reply(error);
            }

            registrationState.delete(
                telegramId
            );

            try {
                await bot.telegram.sendMessage(
                    CHANNEL_ID,
                    `🐞 Нова проблема

👤 ${ctx.from.first_name}
🆔 ${ctx.from.id}
📱 ${ctx.from.username ? "@" + ctx.from.username : "Без username"}

━━━━━━━━━━

${ctx.message.text.trim()}`
                );
            } catch (err) {
                console.error("Не вдалося надіслати повідомлення про проблему в канал:", err);

                return ctx.reply(
                    "⚠️ Не вдалося надіслати повідомлення. Спробуйте пізніше."
                );
            }

            return ctx.reply(
                "✅ Дякуємо! Ваше повідомлення відправлено адміністратору."
            );
        }


        if (
            broadcastState.has(
                telegramId
            )
        ) {

            broadcastState.delete(
                telegramId
            );

            const users = getAllUsers();

            let delivered = 0;

            for (const user of users) {

                try {

                    await bot.telegram.sendMessage(
                        user.telegram_id,
                        `📢 Оголошення

${ctx.message.text}`
                    );

                    delivered++;

                } catch {
                    // Користувач заблокував бота або видалив акаунт.
                }

                // Telegram обмежує ~30 повідомлень/сек — не перевищуємо ліміт.
                await new Promise((resolve) => setTimeout(resolve, 50));

            }

            return ctx.reply(
                `✅ Розсилку доставлено ${delivered} з ${users.length} користувачів`
            );

        }

        if (state?.reportPlayer) {

            const reportedId: number = state.reportPlayer;

            const error = validateText(ctx.message.text, REPORT_MAX_LENGTH, "Причина скарги");

            if (error) {
                return ctx.reply(error);
            }

            // Стан скарги очищаємо одразу, щоб наступні повідомлення не йшли як нові скарги.
            clearStateKey(telegramId, "reportPlayer");

            const reportedUser = getUser(reportedId);

            if (!reportedUser) {
                return ctx.reply("❌ Цю анкету вже видалено.");
            }

            try {
                await bot.telegram.sendMessage(
                    CHANNEL_ID,
                    `🚨 Нова скарга

👤 Скаржник:
${ctx.from.first_name}
🆔 ${ctx.from.id}

━━━━━━━━━━

🎮 Анкета:
🆔 ${reportedUser.telegram_id}

${formatProfile(reportedUser)}

━━━━━━━━━━

📝 Причина:

${ctx.message.text.trim()}`
                );
            } catch (err) {
                console.error("Не вдалося надіслати скаргу в канал:", err);

                return ctx.reply(
                    "⚠️ Не вдалося надіслати скаргу. Спробуйте пізніше."
                );
            }

            const reports = reportedProfiles.get(telegramId) || [];

            reports.push(reportedId);

            reportedProfiles.set(telegramId, reports);

            return ctx.reply(
                "✅ Скаргу надіслано. Дякуємо, адміністратор її перегляне."
            );
        }

        if (!state) return;



        if (
            state.editField &&
            state.editField !== "games"
        ) {


            let value = ctx.message.text.trim();

            if (state.editField === "gender" && !GENDERS.includes(value)) {
                return ctx.reply("❌ Оберіть стать кнопкою");
            }

            if (state.editField === "age") {
                const age = parseAge(value);

                if (age === null) {
                    return ctx.reply(AGE_ERROR);
                }

                value = String(age);
            }

            if (state.editField === "name" || state.editField === "about") {
                const error = state.editField === "name"
                    ? validateText(value, NAME_MAX_LENGTH, "Ім'я")
                    : validateText(value, ABOUT_MAX_LENGTH, "Опис");

                if (error) {
                    return ctx.reply(error);
                }
            }

            updateField(
                telegramId,
                state.editField,
                value
            );

            registrationState.delete(
                telegramId
            );

            const profile: any =
                getUser(telegramId);

            return ctx.reply(
                `✅ Анкету оновлено

👤 ${profile.name}

🎮 Ігри: ${profile.games}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}

📝 ${profile.about}`,
                Markup.keyboard([
                    ["👤 Моя анкета"],
                    ["✏️ Редагувати анкету"],
                    ["🔥 Шукати тімейтів"],
                    ["📨 Запити"]
                ]).resize()
            );
        }

        const gameButtons = GAMES;

        if (state.step === "name") {

            const error = validateText(ctx.message.text, NAME_MAX_LENGTH, "Ім'я");

            if (error) {
                return ctx.reply(error);
            }

            registrationState.set(
                telegramId,
                {
                    step: "games",
                    games: [],
                    name: ctx.message.text.trim()
                }
            );

            return ctx.reply(
                "🎮 Оберіть одну або декілька ігор:",
                Markup.keyboard([
                    ["CS2", "Valorant"],
                    ["League of Legends", "Dota 2"],
                    ["Rainbow Six Siege", "Apex Legends"],
                    ["Fortnite", "Overwatch 2"],
                    ["Dead by Daylight", "PUBG"],
                    ["Rocket League", "Marvel Rivals"],
                    ["World of Tanks", "War Thunder"],
                    ["Rust", "Escape from Tarkov"],
                    ["Minecraft"],
                    ["✅ Готово"],
                    ["🔙 Назад"]
                ]).resize()
            );
        }

        if (
            gameButtons.includes(ctx.message.text) &&
            (
                state.step === "games" ||
                state.editField === "games"
            )
        )

        {

            if (!state.games) {
                state.games = [];
            }

            if (!state.games.includes(ctx.message.text)) {
                state.games.push(
                    ctx.message.text
                );
            }

            registrationState.set(
                telegramId,
                state
            );

            return ctx.reply(
                `✅ Обрано:\n${state.games.join(", ")}`
            );
        }



        if (
            state?.searchStep === "games" &&
            GAMES.includes(ctx.message.text)
        ) {

            if (!state.selectedGames) {
                state.selectedGames = [];
            }

            if (
                !state.selectedGames.includes(
                    ctx.message.text
                )
            ) {

                state.selectedGames.push(
                    ctx.message.text
                );

            }

            registrationState.set(
                telegramId,
                state
            );

            return ctx.reply(
                `✅ Обрано:\n${state.selectedGames.join(", ")}`
            );
        }

        if (
            state?.searchStep === "games" &&
            ctx.message.text === "✅ Готово"
        ) {

            if (!state.selectedGames?.length) {

                return ctx.reply(
                    "❌ Оберіть хоча б одну гру"
                );

            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    searchStep: "rank",
                    currentRankGameIndex: 0,
                    rankFilters: {}
                }
            );

            return ctx.reply(
                `🏆 Оберіть бажаний ранг для ${state.selectedGames[0]} або будь-який ранг:`,
                buildSearchRankKeyboard(state.selectedGames[0])
            );
        }

        if (state?.searchStep === "rank") {
            const game = state.selectedGames[state.currentRankGameIndex];
            const ranks = GAME_RANKS[game];
            if (ctx.message.text !== "Будь-який ранг" && !ranks?.includes(ctx.message.text)) {
                return ctx.reply(`Оберіть ранг зі списку для ${game}:`, buildSearchRankKeyboard(game));
            }
            if (ctx.message.text !== "Будь-який ранг") state.rankFilters[game] = ctx.message.text;
            state.currentRankGameIndex++;
            while (state.currentRankGameIndex < state.selectedGames.length && !GAME_RANKS[state.selectedGames[state.currentRankGameIndex]]) {
                state.currentRankGameIndex++;
            }
            if (state.currentRankGameIndex < state.selectedGames.length) {
                const nextGame = state.selectedGames[state.currentRankGameIndex];
                registrationState.set(telegramId, state);
                return ctx.reply(`🏆 Оберіть бажаний ранг для ${nextGame} або будь-який ранг:`, buildSearchRankKeyboard(nextGame));
            }
            registrationState.set(telegramId, { ...state, searchStep: "gender" });
            return ctx.reply("👤 Оберіть стать:", Markup.keyboard([
                ["👨 Чоловік"], ["👩 Жінка"], ["🌍 Будь-яка"]
            ]).resize());
        }


        if (state?.searchStep === "gender") {

            if (![...GENDERS, ANY_GENDER].includes(ctx.message.text)) {
                return ctx.reply(
                    "❌ Оберіть стать кнопкою",
                    Markup.keyboard([
                        ["👨 Чоловік"], ["👩 Жінка"], [ANY_GENDER]
                    ]).resize()
                );
            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    searchStep: "minAge",
                    filters: {
                        ...state.filters,
                        gender: ctx.message.text
                    }
                }
            );

            return ctx.reply(
                "🎂 Введіть мінімальний вік:",
                Markup.keyboard([
                    ["👤 Моя анкета"],
                    ["✏️ Редагувати анкету"],
                    ["🔥 Шукати тімейтів"],
                    ["🐞 Повідомити про проблему"]
                ]).resize()
            );
        }

        if (state?.searchStep === "minAge") {

            const age = parseAge(ctx.message.text);

            if (age === null) {
                return ctx.reply(AGE_ERROR);
            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    searchStep: "maxAge",
                    filters: {
                        ...state.filters,
                        minAge: age
                    }
                }
            );

            return ctx.reply(
                "🎂 Введіть максимальний вік:"
            );
        }


        if (state?.searchStep === "maxAge") {


            const maxAge = parseAge(ctx.message.text);

            if (maxAge === null) {
                return ctx.reply(AGE_ERROR);
            }

            if (
                maxAge <
                state.filters.minAge
            ) {

                return ctx.reply(
                    "❌ Максимальний вік не може бути меншим за мінімальний"
                );

            }

            const filters = {
                ...state.filters,
                maxAge
            };

            saveSearchPreferences(
                telegramId,
                state.selectedGames,
                filters.gender,
                filters.minAge,
                filters.maxAge,
                state.rankFilters || {}
            );

            const profiles = findProfiles(
                telegramId,
                state.selectedGames,
                state.rankFilters || {},
                filters
            );



            registrationState.delete(
                telegramId
            );

            if (!profiles.length) {

                return ctx.reply(
                    "😔 Нікого не знайдено."
                );

            }

            registrationState.set(
                telegramId,
                {
                    searchResults: profiles,
                    currentIndex: 0
                }
            );
            const profile = profiles[0];

            const userGames: any[] =
                getUserGames(profile.telegram_id) as any[];

            const gamesText =
                userGames.length
                    ? userGames
                        .map(
                            (g: any) =>
                                `🎮 ${g.game} — ${g.rank}`
                        )
                        .join("\n")
                    : "🎮 Ігри не вказані";

            return ctx.reply(
                `👤 ${profile.name}

${gamesText}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}

📝 ${profile.about}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "🎮 Запросити в гру",
                            `like_${profile.telegram_id}`
                        )
                    ],
                    [
                        Markup.button.callback(
                            "⚠️ Поскаржитись",
                            `report_user_${profile.telegram_id}`
                        )
                    ],
                    [
                        Markup.button.callback(
                            "⏭ Пропустити",
                            "skip"
                        )
                    ]
                ])
            );
        }

        if (ctx.message.text === "✅ Готово") {

            if (!state?.games?.length) {
                return ctx.reply("❌ Оберіть хоча б одну гру");
            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    step: "rank_per_game",
                    currentGameIndex: 0,
                    gameRanks: {}
                }
            );

            const firstGame = state.games[0];

            if (GAME_RANKS[firstGame]) {
                return ctx.reply(
                    `🏆 Оберіть ранг для ${firstGame}:`,
                    buildRankKeyboard(firstGame)
                );
            }

            return ctx.reply(
                `🏆 Введіть ранг для ${firstGame}:`,
                Markup.keyboard([
                    ["🔙 Назад"]
                ]).resize()
            );
        }


        if (state.step === "rank_per_game") {

            const currentGame =
                state.games[state.currentGameIndex];

            const availableRanks =
                GAME_RANKS[currentGame];

            if (availableRanks) {
                if (!availableRanks.includes(ctx.message.text)) {
                    return ctx.reply(
                        `❌ Оберіть ранг для ${currentGame} кнопкою`,
                        buildRankKeyboard(currentGame)
                    );
                }
            } else {
                const error = validateText(ctx.message.text, CUSTOM_RANK_MAX_LENGTH, "Ранг");

                if (error) {
                    return ctx.reply(error);
                }
            }

            state.gameRanks[currentGame] =
                ctx.message.text.trim();

            state.currentGameIndex++;

            if (state.currentGameIndex < state.games.length) {
                const nextGame =
                    state.games[state.currentGameIndex];

                registrationState.set(
                    telegramId,
                    state
                );

                if (GAME_RANKS[nextGame]) {
                    return ctx.reply(
                        `🏆 Оберіть ранг для ${nextGame}:`,
                        buildRankKeyboard(nextGame)
                    );
                }

                return ctx.reply(
                    `🏆 Введіть ранг для ${nextGame}:`,
                    Markup.keyboard([
                        ["🔙 Назад"]
                    ]).resize()
                );
            }

            // ===== РЕДАГУВАННЯ АНКЕТИ =====
            if (state.editField === "games") {

                deleteUserGames(telegramId);

                for (const [game, rank] of Object.entries(state.gameRanks)) {
                    addUserGame(
                        telegramId,
                        game,
                        rank as string
                    );
                }

                updateField(
                    telegramId,
                    "games",
                    state.games.join(", ")
                );

                registrationState.delete(telegramId);

                return ctx.reply(
                    "✅ Ігри та ранги оновлено!",
                    Markup.keyboard([
                        ["👤 Моя анкета"],
                        ["✏️ Редагувати анкету"],
                        ["🔥 Шукати тімейтів"],
                        ["📨 Запити"]
                    ]).resize()
                );
            }

            // ===== СТВОРЕННЯ НОВОЇ АНКЕТИ =====
            registrationState.set(
                telegramId,
                {
                    ...state,
                    step: "age"
                }
            );

            return ctx.reply(
                "🎂 Введіть свій вік:"
            );
        }



        if (state.step === "age") {

            const age = parseAge(ctx.message.text);

            if (age === null) {
                return ctx.reply(AGE_ERROR);
            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    step: "gender",
                    age: String(age)
                }
            );

            return ctx.reply(
                "👤 Оберіть стать:",
                Markup.keyboard([
                    ["👨 Чоловік"],
                    ["👩 Жінка"]
                ]).resize()
            );
        }

        if (state.step === "gender") {

            if (!GENDERS.includes(ctx.message.text)) {
                return ctx.reply(
                    "❌ Оберіть стать кнопкою",
                    Markup.keyboard([
                        ["👨 Чоловік"],
                        ["👩 Жінка"]
                    ]).resize()
                );
            }

            registrationState.set(
                telegramId,
                {
                    ...state,
                    step: "about",
                    gender: ctx.message.text
                }
            );

            return ctx.reply(
                "📝 Коротко про себе:"
            );
        }

        if (state.step === "about") {

            const aboutError = validateText(ctx.message.text, ABOUT_MAX_LENGTH, "Опис");

            if (aboutError) {
                return ctx.reply(aboutError);
            }

            deleteUserGames(
                telegramId
            );

            for (
                const [game, rank]
                of Object.entries(
                state.gameRanks
            )
                ) {

                addUserGame(
                    telegramId,
                    game,
                    rank as string
                );

            }

            saveUser(
                telegramId,
                ctx.from.username || "",
                state.name,
                state.games.join(", "),
                state.age,
                state.gender,
                ctx.message.text.trim()
            );



            registrationState.delete(
                telegramId
            );

            return ctx.reply(
                "✅ Анкету створено!",
                Markup.keyboard([
                    ["👤 Моя анкета"],
                    ["✏️ Редагувати анкету"],
                    ["🔥 Шукати тімейтів"],
                    ["📨 Запити"]
                ]).resize()
            );
        }

    });


/**
 * Показує вхідний запит з кнопками «Прийняти / Відмовити».
 * Username відправника НЕ показується, доки запит не прийнято.
 */
async function showIncomingRequest(ctx: any, senderId: number): Promise<void> {

    const request = getPendingRequest(senderId, ctx.from.id);

    if (!request) {
        await ctx.answerCbQuery("Цей запит уже оброблено");
        return;
    }

    const senderProfile = getUser(senderId);

    if (!senderProfile) {
        updateRequestStatus(request.id, "rejected");
        await ctx.answerCbQuery("❌ Користувач видалив анкету");
        return;
    }

    await ctx.reply(
        formatProfile(senderProfile, "🎮 Запит на гру"),
        Markup.inlineKeyboard([
            [
                Markup.button.callback("✅ Хочу грати", `accept_${senderId}`),
                Markup.button.callback("❌ Відмовити", `reject_${senderId}`)
            ],
            [
                Markup.button.callback("⚠️ Поскаржитись", `report_user_${senderId}`)
            ]
        ])
    );

    await ctx.answerCbQuery();
}

/** Прибирає inline-кнопки з повідомлення, щоб їх не натискали повторно. */
async function removeButtons(ctx: any): Promise<void> {
    try {
        await ctx.editMessageReplyMarkup(undefined);
    } catch {
        // Повідомлення застаре або вже без кнопок — це не помилка.
    }
}

bot.action(/^like_(\d+)$/, async (ctx) => {

    const targetId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    if (targetId === currentUserId) {
        await ctx.answerCbQuery("❌ Не можна запросити самого себе");
        return;
    }

    if (!getUser(currentUserId)) {
        await ctx.answerCbQuery("❌ Спочатку створіть анкету");
        return;
    }

    if (!getUser(targetId) || isBanned(targetId)) {
        await ctx.answerCbQuery("❌ Ця анкета більше недоступна");
        return;
    }

    const existingMatch = hasMatch(currentUserId, targetId);

    if (existingMatch) {
        await ctx.answerCbQuery("🎉 У вас уже є матч із цим користувачем");
        return;
    }

    // Ця людина вже запросила нас — пропонуємо одразу прийняти її запит.
    if (getPendingRequest(targetId, currentUserId)) {
        await showIncomingRequest(ctx, targetId);
        return;
    }

    const existingRequest = getPendingRequest(currentUserId, targetId);

    if (existingRequest) {
        await ctx.answerCbQuery("⚠️ Ви вже відправили запит цій людині");
        return;
    }

    createRequest(
        currentUserId,
        targetId
    );

    try {
        await bot.telegram.sendMessage(
            targetId,
            "🔔 У вас новий запит на гру!",
            Markup.inlineKeyboard([
                [Markup.button.callback("👀 Переглянути", `request_from_${currentUserId}`)]
            ])
        );
    } catch {
        // Отримувач заблокував бота — запит лишається в розділі «📨 Запити».
    }

    await ctx.answerCbQuery("✅ Запит відправлено!");
    await ctx.reply("✅ Запит відправлено! Коли гравець прийме його, ви отримаєте контакт.");

});

bot.action(/^request_from_(\d+)$/, async (ctx) => {
    await showIncomingRequest(ctx, Number(ctx.match[1]));
});

    // Залишено для кнопок у старих повідомленнях.
    bot.action("continue_search", async (ctx) => {

        await ctx.answerCbQuery(
            "Продовжуйте пошук 🔍"
        );

    });







    bot.hears("📨 Запити", async (ctx) => {

        const requests: any[] =
            getRequests(ctx.from.id);

        if (requests.length === 0) {

            return ctx.reply(
                "📭 У вас немає нових запитів."
            );

        }
        const request: any = requests[0];

        await ctx.reply(
            `🔔 У вас ${requests.length} новий(их) запит(ів)`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "👀 Переглянути",
                        `request_${request.id}`
                    )
                ]
            ])
        );

    });

    bot.action(/^request_(\d+)$/, async (ctx) => {

        const requestId = Number(ctx.match[1]);

        const request = getRequests(ctx.from.id)
            .find((r) => r.id === requestId);

        if (!request) {
            await ctx.answerCbQuery("Цей запит уже оброблено");
            return;
        }

        await showIncomingRequest(ctx, request.from_user);

    });

function matchText(profile: UserRecord): string {
    const contact = profile.username
        ? `📱 @${profile.username}`
        : `📱 Username не вказано — посилання: tg://user?id=${profile.telegram_id}`;

    return `🎉 МАТЧ ЗНАЙДЕНО!

👤 ${profile.name}

${contact}

Тепер можете написати один одному 🎮`;
}

bot.action(/^accept_(\d+)$/, async (ctx) => {

    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    // Прийняти можна лише реальний запит, що ще очікує відповіді.
    const pendingRequest = getPendingRequest(senderId, currentUserId);

    if (!pendingRequest) {
        await removeButtons(ctx);
        await ctx.answerCbQuery("Цей запит уже оброблено");
        return;
    }

    const senderProfile = getUser(senderId);
    const currentProfile = getUser(currentUserId);

    if (!senderProfile || !currentProfile || isBanned(senderId)) {
        updateRequestStatus(pendingRequest.id, "rejected");
        await removeButtons(ctx);
        await ctx.answerCbQuery("❌ Анкета більше недоступна");
        return;
    }

    updateRequestStatus(pendingRequest.id, "accepted");

    if (!hasMatch(senderId, currentUserId)) {
        createMatch(senderId, currentUserId);
    }

    await removeButtons(ctx);

    try {
        await bot.telegram.sendMessage(senderId, matchText(currentProfile));
    } catch {
        // Відправник заблокував бота — контакт все одно отримає той, хто прийняв.
    }

    await ctx.reply(matchText(senderProfile));
    await ctx.answerCbQuery("🎉 Запит прийнято!");

});

bot.action(/^reject_(\d+)$/, async (ctx) => {

    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    const pendingRequest = getPendingRequest(senderId, currentUserId);

    if (pendingRequest) {
        updateRequestStatus(pendingRequest.id, "rejected");
    }

    await removeButtons(ctx);
    await ctx.reply("❌ Запит відхилено");
    await ctx.answerCbQuery();

});

bot.action("skip", async (ctx) => {

    const state: any =
        registrationState.get(
            ctx.from.id
        );

    if (
        !state ||
        !state.searchResults
    ) {

        return ctx.answerCbQuery(
            "Немає наступних анкет"
        );

    }

    state.currentIndex++;

    if (
        state.currentIndex >=
        state.searchResults.length
    ) {

        registrationState.delete(
            ctx.from.id
        );

        await ctx.reply(
            "😔 Більше анкет не знайдено"
        );

        return ctx.answerCbQuery();
    }

    const profile =
        state.searchResults[
            state.currentIndex
            ];

    registrationState.set(
        ctx.from.id,
        state
    );

    const userGames: any[] =
        getUserGames(profile.telegram_id) as any[];

    const gamesText =
        userGames.length
            ? userGames
                .map(
                    (g: any) =>
                        `🎮 ${g.game} — ${g.rank}`
                )
                .join("\n")
            : "🎮 Ігри не вказані";

    await ctx.reply(
        `👤 ${profile.name}

${gamesText}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}

📝 ${profile.about}`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "🎮 Запросити в гру",
                    `like_${profile.telegram_id}`
                )
            ],
            [
                Markup.button.callback(
                    "⚠️ Поскаржитись",
                    `report_user_${profile.telegram_id}`
                )
            ],
            [
                Markup.button.callback(
                    "⏭ Пропустити",
                    "skip"
                )
            ]
        ])
    );

    await ctx.answerCbQuery();

});

bot.action(
    /^report_user_(\d+)$/,
    async (ctx) => {

        const targetId =
            Number(ctx.match[1]);

        const reports =
            reportedProfiles.get(
                ctx.from.id
            ) || [];

        if (
            reports.includes(
                targetId
            )
        ) {

            await ctx.answerCbQuery(
                "⚠️ Ви вже скаржилися на цю анкету"
            );

            return;
        }

        const currentState: any =
            registrationState.get(
                ctx.from.id
            ) || {};

        registrationState.set(
            ctx.from.id,
            {
                ...currentState,
                reportPlayer: targetId
            }
        );

        await ctx.reply(
            "⚠️ Напишіть причину скарги:"
        );

        await ctx.answerCbQuery();

    }
);


// Будь-яка помилка в обробнику більше не зупиняє бота.
bot.catch(async (err, ctx) => {
    console.error(`Помилка під час обробки update ${ctx.update.update_id}:`, err);

    try {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery("⚠️ Сталася помилка, спробуйте ще раз");
        } else if (ctx.chat) {
            await ctx.reply("⚠️ Сталася помилка. Спробуйте ще раз або натисніть /start");
        }
    } catch {
        // Не вдалося навіть повідомити користувача — просто логуємо вище.
    }
});

bot.launch(() => {
    console.log("🚀 Bot started");
}).catch((err) => {
    console.error("❌ Не вдалося запустити бота:", err);
    process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
