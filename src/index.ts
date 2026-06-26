import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";

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
    updateField
} from "./database/users";

import {
    addUserGame,
    getUserGames,
    deleteUserGames
} from "./database/userGames";


import {
    createRequest,
    getRequests,
    getRequestBetween,
    getPendingRequest,
    updateRequestStatus
} from "./database/requests";

import {
    createMatch,
    hasMatch
} from "./database/matches";




import { registrationState } from "./database/registration";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

const CHANNEL_ID = -1003609779542;

const ADMIN_ID = 782332093;

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
            "Приклад:\n/ban 782332093"
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
            "Приклад:\n/unban 782332093"
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

console.log(getAllUsers());


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



bot.hears(
    "🔥 Шукати тімейтів",
    async (ctx) => {

        const profile: any =
            getUser(ctx.from.id);

        if (!profile) {

            return ctx.reply(
                "❌ Спочатку створіть анкету"
            );

        }

        registrationState.set(
            ctx.from.id,
            {
                searchStep: "games",
                selectedGames: [],
                filters: {}
            }
        );

        await ctx.reply(
            "🎮 Оберіть гру:",
            Markup.keyboard([
                ["CS2"],
                ["Valorant"],
                ["League of Legends"],
                ["Dota 2"],
                ["Rainbow Six Siege"],
                ["Apex Legends"],
                ["Fortnite"],
                ["Overwatch 2"],
                ["Dead by Daylight"],
                ["PUBG"],
                ["Rocket League"],
                ["Marvel Rivals"],
                ["✅ Готово"],
                ["🔙 Назад"]
            ]).resize()
        );

    }
);


    bot.on("text", async (ctx) => {


        if (isBanned(ctx.from.id)) {

            return ctx.reply(
                "⛔ Ваш акаунт заблоковано адміністрацією."
            );

        }


        if (
            ctx.message.text === "🔥 Шукати тімейтів" ||
            ctx.message.text === "👤 Моя анкета"
        ) {
            return;
        }

        console.log("TEXT:", ctx.message.text);

        const telegramId = ctx.from.id;





        const state = registrationState.get(telegramId);




        if (state?.reportBug) {

            await bot.telegram.sendMessage(
                CHANNEL_ID,
                `🐞 Нова проблема

👤 ${ctx.from.first_name}
🆔 ${ctx.from.id}
📱 ${ctx.from.username ? "@" + ctx.from.username : "Без username"}

━━━━━━━━━━

${ctx.message.text}`
            );

            registrationState.delete(
                telegramId
            );

            return ctx.reply(
                "✅ Дякуємо! Ваше повідомлення відправлено адміністратору."
            );
        }


        if (
            broadcastState.has(
                telegramId
            )
        ) {

            const users: any[] =
                getAllUsers() as any[];

            for (
                const user of users
                ) {

                try {

                    await bot.telegram.sendMessage(
                        user.telegram_id,
                        `📢 Оголошення

${ctx.message.text}`
                    );

                } catch {}

            }

            broadcastState.delete(
                telegramId
            );

            return ctx.reply(
                `✅ Розсилку відправлено ${users.length} користувачам`
            );

        }

        if (state?.reportPlayer) {

            const reportedUser: any =
                getUser(state.reportPlayer);

            const reportedGames: any[] =
                getUserGames(state.reportPlayer) as any[];

            const gamesText =
                reportedGames.length
                    ? reportedGames
                        .map(
                            (g: any) =>
                                `🎮 ${g.game} — ${g.rank}`
                        )
                        .join("\n")
                    : "🎮 Ігри не вказані";

            await bot.telegram.sendMessage(
                CHANNEL_ID,
                `🚨 Нова скарга

👤 Скаржник:
${ctx.from.first_name}

🆔 ${ctx.from.id}

━━━━━━━━━━

🎮 Анкета:

👤 ${reportedUser?.name}
🆔 ${reportedUser?.telegram_id}

${gamesText}
🎂 Вік: ${reportedUser?.age}
👤 Стать: ${reportedUser?.gender}

📝 ${reportedUser?.about}

━━━━━━━━━━

📝 Причина:

${ctx.message.text}`
            );
        }

        if (!state) return;



        if (
            state.editField &&
            state.editField !== "games"
        ) {


            if (
                state.editField === "gender"
            ) {

                if (
                    ctx.message.text !== "👨 Чоловік" &&
                    ctx.message.text !== "👩 Жінка"
                ) {

                    return ctx.reply(
                        "❌ Оберіть стать кнопкою"
                    );

                }

            }



            if (
                state.editField === "age"
            ) {

                const age =
                    Number(ctx.message.text);

                if (
                    isNaN(age) ||
                    age < 14 ||
                    age > 99
                ) {

                    return ctx.reply(
                        "❌ Вік має бути від 14 до 99 років"
                    );

                }

            }

            updateField(
                telegramId,
                state.editField,
                ctx.message.text
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
🏆 Ранг: ${profile.ranks}
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

            registrationState.set(
                telegramId,
                {
                    step: "games",
                    games: [],
                    name: ctx.message.text
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

            console.log(
                "SELECTED:",
                state.games
            );

            return ctx.reply(
                `✅ Обрано:\n${state.games.join(", ")}`
            );
        }



        if (
            state?.searchStep === "games" &&
            GAMES.includes(ctx.message.text)
        ) {

            console.log("SEARCH GAME:", ctx.message.text);

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
                    searchStep: "gender"
                }
            );

            return ctx.reply(
                "👤 Оберіть стать:",
                Markup.keyboard([
                    ["👨 Чоловік"],
                    ["👩 Жінка"],
                    ["🌍 Будь-яка"]
                ]).resize()
            );
        }


        if (state?.searchStep === "gender") {

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

            const age = Number(
                ctx.message.text
            );

            if (
                isNaN(age) ||
                age < 14 ||
                age > 99
            ) {

                return ctx.reply(
                    "❌ Вік має бути від 14 до 99 років"
                );

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


            const maxAge = Number(
                ctx.message.text
            );

            if (
                isNaN(maxAge) ||
                maxAge < 14 ||
                maxAge > 99
            ) {

                return ctx.reply(
                    "❌ Вік має бути від 14 до 99 років"
                );

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

            const profiles: any[] =
                getAllUsers()
                    .filter((user: any) => {

                        if (
                            user.telegram_id ===
                            telegramId
                        ) {
                            return false;
                        }

                        const hasGame =
                            state.selectedGames.some(
                                (game: string) =>
                                    user.games.includes(game)
                            );

                        if (!hasGame) {
                            return false;
                        }

                        if (
                            filters.gender !==
                            "🌍 Будь-яка"
                        ) {

                            if (
                                user.gender !==
                                filters.gender
                            ) {
                                return false;
                            }

                        }

                        const age =
                            Number(user.age);

                        return (
                            age >=
                            filters.minAge &&
                            age <=
                            filters.maxAge
                        );

                    })
                    .sort(() => Math.random() - 0.5);



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
            }

            state.gameRanks[currentGame] =
                ctx.message.text;

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

            registrationState.set(
                telegramId,
                {
                    ...state,
                    step: "gender",
                    age: ctx.message.text
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
                "",
                state.age,
                state.gender,
                ctx.message.text
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


bot.action(/like_(.+)/, async (ctx) => {

    const targetId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    if (targetId === currentUserId) {
        await ctx.answerCbQuery("❌ Не можна запросити самого себе");
        return;
    }

    const existingMatch = hasMatch(currentUserId, targetId);

    if (existingMatch) {
        await ctx.answerCbQuery("🎉 У вас уже є матч із цим користувачем");
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

    await bot.telegram.sendMessage(
        targetId,
        "🔔 У вас новий запит на гру!",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "👀 Переглянути",
                            callback_data: `request_from_${currentUserId}`
                        }
                    ],
                    [
                        {
                            text: "🔍 Шукати далі",
                            callback_data: "continue_search"
                        }
                    ]
                ]
            }
        }
    );

    await ctx.reply("✅ Запит відправлено!");
    await ctx.answerCbQuery();

});
    bot.action(/request_from_(.+)/, async (ctx) => {

        const senderId = Number(ctx.match[1]);

        const profile: any = getUser(senderId);

        if (!profile) {
            return ctx.answerCbQuery(
                "Анкету не знайдено"
            );
        }

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
            `🎮 Запит на гру

👤 ${profile.name}

📱 ${
                profile.username
                    ? `@${profile.username}`
                    : "Username не вказано"
            }

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
            ])
        );

        await ctx.answerCbQuery();

    });

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

    bot.action(/request_(.+)/, async (ctx) => {

        const requestId = Number(ctx.match[1]);

        const requests: any[] = getRequests(
            ctx.from.id
        );

        const request: any =
            requests.find(
                (r: any) => r.id === requestId
            );

        if (!request) {

            await ctx.answerCbQuery(
                "Запит не знайдено"
            );

            return;
        }

        const senderProfile: any =
            getUser(request.from_user);

        const userGames: any[] =
            getUserGames(senderProfile.telegram_id) as any[];

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
            `🎮 Запит на гру

👤 ${senderProfile.name}

${gamesText}
🎂 Вік: ${senderProfile.age}
👤 Стать: ${senderProfile.gender}

📝 ${senderProfile.about}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Хочу грати",
                        `accept_${request.from_user}`
                    ),
                    Markup.button.callback(
                        "❌ Відмовити",
                        `reject_${request.from_user}`
                    )
                ]
            ])
        );

        await ctx.answerCbQuery();

    });
bot.action(/accept_(.+)/, async (ctx) => {

    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    const senderProfile: any = getUser(senderId);
    const currentProfile: any = getUser(currentUserId);

    if (!senderProfile || !currentProfile) {
        await ctx.answerCbQuery("❌ Анкету не знайдено");
        return;
    }

    const existingMatch = hasMatch(senderId, currentUserId);

    if (!existingMatch) {
        createMatch(senderId, currentUserId);
    }

    const pendingRequest: any = getPendingRequest(senderId, currentUserId);

    if (pendingRequest) {
        updateRequestStatus(pendingRequest.id, "accepted");
    }

    await bot.telegram.sendMessage(
        senderId,
        `🎉 МАТЧ ЗНАЙДЕНО!

👤 ${currentProfile.name}

${currentProfile.username
            ? `📱 @${currentProfile.username}`
            : "📱 Username не вказано"}

Тепер можете написати один одному 🎮`
    );

    await bot.telegram.sendMessage(
        currentUserId,
        `🎉 МАТЧ ЗНАЙДЕНО!

👤 ${senderProfile.name}

${senderProfile.username
            ? `📱 @${senderProfile.username}`
            : "📱 Username не вказано"}

Тепер можете написати один одному 🎮`
    );

    await ctx.reply("🎉 Запит прийнято!");
    await ctx.answerCbQuery();

});
bot.action(/reject_(.+)/, async (ctx) => {

    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    const pendingRequest: any = getPendingRequest(senderId, currentUserId);

    if (pendingRequest) {
        updateRequestStatus(pendingRequest.id, "rejected");
    }

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
    /report_user_(.+)/,
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


bot.launch()
    .then(() => {
        console.log("🚀 Bot started");
    })
    .catch(console.error);

console.log("Bot started");