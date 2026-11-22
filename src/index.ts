// Має бути першим імпортом: .env потрібен ще до підключення бази (DB_PATH).
import "dotenv/config";

import { Telegraf, Markup, Context } from "telegraf";

import { deleteUser } from "./database/deleteUser";
import { banUser, unbanUser, isBanned } from "./database/bans";
import { hideProfile, getRecentlyHiddenIds } from "./database/hiddenProfiles";
import { saveUser, getUser, getAllUsers, updateField, UserRecord } from "./database/users";
import { getUserGames, getAllUserGames, replaceUserGames, UserGameRecord } from "./database/userGames";
import { saveSearchPreferences, getSearchPreferences } from "./database/searchPreferences";
import {
    createRequest,
    getRequests,
    getPendingRequest,
    updateRequestStatus,
    getInteractedUserIds
} from "./database/requests";
import { createMatch, hasMatch, getMatchedUserIds, countMatches } from "./database/matches";
import { registrationState, FlowState } from "./database/registration";

// =====================================================================
// Налаштування
// =====================================================================

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

// =====================================================================
// Константи
// =====================================================================

const BTN = {
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
    // Кнопки старих версій бота, які ще можуть лишатися в чатах користувачів.
    legacyEditProfile: "✏️ Редагувати анкету",
    legacyEditSearch: "✏️ Редагувати пошук"
} as const;

const BANNED_TEXT = "⛔ Ваш акаунт заблоковано адміністрацією.";

const NAME_MAX_LENGTH = 32;
const ABOUT_MAX_LENGTH = 500;
const CUSTOM_RANK_MAX_LENGTH = 30;
const REPORT_MAX_LENGTH = 1000;
const MAX_PROFILE_GAMES = 5;

const MIN_AGE = 14;
const MAX_AGE = 99;
const ADULT_AGE = 18;

/** Скільки днів не показувати пропущену анкету. */
const SKIP_HIDE_DAYS = 3;

const GENDERS: string[] = [BTN.male, BTN.female];

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

/** Скарги, вже надіслані користувачем (щоб не скаржився двічі на одну анкету). */
const reportedProfiles = new Map<number, Set<number>>();

/** Поточна видача пошуку: список ID анкет і яка зараз показана. */
interface SearchSession {
    ids: number[];
    index: number;
}

const searchSessions = new Map<number, SearchSession>();

// =====================================================================
// Допоміжні функції
// =====================================================================

function chunk<T>(items: T[], size: number): T[][] {
    const rows: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
        rows.push(items.slice(i, i + size));
    }

    return rows;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

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

const isMinor = (age: number) => age < ADULT_AGE;

/**
 * Неповнолітні бачать лише неповнолітніх, дорослі — лише дорослих.
 * Повертає дозволений діапазон віку для пошуку.
 */
function allowedAgeRange(age: number): { min: number; max: number } {
    return isMinor(age)
        ? { min: MIN_AGE, max: ADULT_AGE - 1 }
        : { min: ADULT_AGE, max: MAX_AGE };
}

/** Наскільки рангів вгору/вниз шукати від обраного (≈12% шкали, мінімум 2). */
function rankWindow(game: string): number {
    const ranks = GAME_RANKS[game];

    return ranks ? Math.max(2, Math.round(ranks.length * 0.12)) : 0;
}

function rankRangeLabel(game: string, rank: string): string {
    const ranks = GAME_RANKS[game];
    const index = ranks?.indexOf(rank) ?? -1;

    if (!ranks || index === -1) return rank;

    const window = rankWindow(game);
    const low = ranks[Math.max(0, index - window)];
    const high = ranks[Math.min(ranks.length - 1, index + window)];

    return low === high ? rank : `${low} – ${high}`;
}

function rankMatches(game: string, requiredRank: string, actualRank: string): boolean {
    const ranks = GAME_RANKS[game];

    if (!ranks) return true;

    const required = ranks.indexOf(requiredRank);

    if (required === -1) return true;

    const actual = ranks.indexOf(actualRank);

    // Гравець без рангу зі списку не підходить під фільтр за рангом.
    if (actual === -1) return false;

    return Math.abs(actual - required) <= rankWindow(game);
}

function contactHtml(profile: UserRecord): string {
    return profile.username
        ? `@${escapeHtml(profile.username)}`
        : `<a href="tg://user?id=${profile.telegram_id}">написати в Telegram</a>`;
}

/** Текст анкети. Username тут не показується — лише після взаємної згоди (матчу). */
function formatProfile(
    profile: UserRecord,
    title?: string,
    games: UserGameRecord[] = getUserGames(profile.telegram_id)
): string {
    const header = title ? `${title}\n\n` : "";

    const gamesText = games.length
        ? games.map((g) => `🎮 ${g.game} — ${g.rank}`).join("\n")
        : "🎮 Ігри не вказані";

    const about = profile.about ? `\n\n📝 ${profile.about}` : "";

    return `${header}👤 ${profile.name}

${gamesText}
🎂 Вік: ${profile.age}
👤 Стать: ${profile.gender}${about}`;
}

// =====================================================================
// Клавіатури
// =====================================================================

/** Головне меню — завжди однакове. Кількість нових запитів видно прямо на кнопці. */
function mainMenu(telegramId: number) {
    if (!getUser(telegramId)) {
        return Markup.keyboard([
            [BTN.createProfile],
            [BTN.bug]
        ]).resize();
    }

    const pending = getRequests(telegramId).length;
    const requestsLabel = pending ? `${BTN.requests} (${pending})` : BTN.requests;

    return Markup.keyboard([
        [BTN.search],
        [requestsLabel, BTN.teammates],
        [BTN.profile, BTN.filters],
        [BTN.bug]
    ]).resize();
}

function profileMenu() {
    return Markup.keyboard([
        [BTN.editName, BTN.editAge],
        [BTN.editGender, BTN.editAbout],
        [BTN.editGames],
        [BTN.deleteProfile],
        [BTN.back]
    ]).resize();
}

/** Клавіатура кроку: додаткові рядки + завжди кнопка «Назад». */
function stepKeyboard(...rows: string[][]) {
    return Markup.keyboard([...rows, [BTN.back]]).resize();
}

/** Список ігор; обрані позначені ✅ (повторне натискання — прибирає гру). */
function gamesKeyboard(selected: string[], extraRow: string[] = []) {
    const buttons = GAMES.map((game) => (selected.includes(game) ? `✅ ${game}` : game));
    const rows = chunk(buttons, 2);

    if (extraRow.length) rows.unshift(extraRow);

    return stepKeyboard(...rows, [BTN.done]);
}

function parseGameButton(text: string): string | null {
    const game = text.replace(/^✅\s*/, "");

    return GAMES.includes(game) ? game : null;
}

function rankKeyboard(game: string, extraButton: string) {
    const ranks = GAME_RANKS[game] || [];

    return stepKeyboard(...chunk(ranks, 3), [extraButton]);
}

function searchCardKeyboard(targetId: number) {
    return Markup.inlineKeyboard([
        [Markup.button.callback("🎮 Запросити в гру", `like_${targetId}`)],
        [
            Markup.button.callback("⏭ Пропустити", "skip"),
            Markup.button.callback("⚠️ Поскаржитись", `report_user_${targetId}`)
        ]
    ]);
}

// =====================================================================
// Middleware
// =====================================================================

// Бан перевіряється для БУДЬ-якої дії: повідомлень, кнопок меню та inline-кнопок.
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (userId && userId !== ADMIN_ID && isBanned(userId)) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(BANNED_TEXT);
        } else if (ctx.chat?.type === "private") {
            await ctx.reply(BANNED_TEXT, Markup.removeKeyboard());
        }

        return;
    }

    return next();
});

// =====================================================================
// Старт і головне меню
// =====================================================================

const WELCOME_TEXT = `🎮 Вітаємо в Team Finder!

Тут ти можеш знайти тімейтів для улюблених ігор, переглядати анкети інших гравців та надсилати запити на спільну гру.

📋 Як це працює:
1️⃣ Створи анкету — ігри, ранги, вік і пару слів про себе
2️⃣ Натисни «${BTN.search}» і гортай анкети
3️⃣ Запроси гравця в гру — коли він погодиться, ви отримаєте контакти одне одного

⚠️ Бот у Beta-версії. Якщо помітиш проблему або маєш ідею — натисни «${BTN.bug}».

Гарної гри! 🎯`;

bot.start(async (ctx) => {
    registrationState.delete(ctx.from.id);

    const profile = getUser(ctx.from.id);

    if (!profile) {
        return ctx.reply(WELCOME_TEXT, mainMenu(ctx.from.id));
    }

    return ctx.reply(
        `👋 З поверненням, ${profile.name}!\n\nОберіть дію в меню 👇`,
        mainMenu(ctx.from.id)
    );
});

bot.hears(BTN.back, async (ctx) => {
    const state = registrationState.get(ctx.from.id);

    registrationState.delete(ctx.from.id);

    // З редагування анкети повертаємось до анкети, а не в головне меню.
    if (state && (state.flow === "editField" || state.flow === "editGames") && getUser(ctx.from.id)) {
        return showOwnProfile(ctx);
    }

    return ctx.reply("🏠 Головне меню", mainMenu(ctx.from.id));
});

bot.hears(BTN.bug, async (ctx) => {
    registrationState.set(ctx.from.id, newState("bug"));

    return ctx.reply(
        "🐞 Опишіть проблему або запропонуйте покращення одним повідомленням 👇",
        stepKeyboard()
    );
});

function newState(flow: FlowState["flow"], extra: Partial<FlowState> = {}): FlowState {
    return { flow, games: [], ranks: {}, rankIndex: 0, ...extra };
}

// =====================================================================
// Анкета: перегляд, створення, редагування
// =====================================================================

async function showOwnProfile(ctx: Context, title = "👤 Ваша анкета") {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        return startRegistration(ctx);
    }

    return ctx.reply(
        `${formatProfile(profile, title)}\n\n✏️ Щоб щось змінити — оберіть кнопку нижче.`,
        profileMenu()
    );
}

async function startRegistration(ctx: Context) {
    const firstName = ctx.from!.first_name?.trim() || "";

    registrationState.set(ctx.from!.id, newState("register", { step: "name" }));

    const suggestion = firstName && firstName.length <= NAME_MAX_LENGTH ? [[firstName]] : [];

    return ctx.reply(
        "📝 Створюємо анкету — це займе хвилину.\n\nКрок 1/5: Як тебе звати?",
        stepKeyboard(...suggestion)
    );
}

bot.hears([BTN.profile, BTN.legacyEditProfile, BTN.createProfile], async (ctx) => {
    registrationState.delete(ctx.from.id);

    return showOwnProfile(ctx);
});

function requireProfile(ctx: Context): UserRecord | undefined {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        ctx.reply(`❌ Спочатку створіть анкету — кнопка «${BTN.createProfile}»`, mainMenu(ctx.from!.id));
    }

    return profile;
}

bot.hears(BTN.editName, async (ctx) => {
    if (!requireProfile(ctx)) return;

    registrationState.set(ctx.from.id, newState("editField", { field: "name" }));

    return ctx.reply(`📝 Введіть нове ім'я (до ${NAME_MAX_LENGTH} символів):`, stepKeyboard());
});

bot.hears(BTN.editAge, async (ctx) => {
    if (!requireProfile(ctx)) return;

    registrationState.set(ctx.from.id, newState("editField", { field: "age" }));

    return ctx.reply("🎂 Введіть новий вік:", stepKeyboard());
});

bot.hears(BTN.editGender, async (ctx) => {
    if (!requireProfile(ctx)) return;

    registrationState.set(ctx.from.id, newState("editField", { field: "gender" }));

    return ctx.reply("👤 Оберіть стать:", stepKeyboard([BTN.male, BTN.female]));
});

bot.hears(BTN.editAbout, async (ctx) => {
    if (!requireProfile(ctx)) return;

    registrationState.set(ctx.from.id, newState("editField", { field: "about" }));

    return ctx.reply(
        `📄 Напишіть кілька слів про себе (до ${ABOUT_MAX_LENGTH} символів): роль, коли граєте, чи є мікрофон...`,
        stepKeyboard()
    );
});

bot.hears(BTN.editGames, async (ctx) => {
    if (!requireProfile(ctx)) return;

    const current = getUserGames(ctx.from.id).map((g) => g.game).filter((g) => GAMES.includes(g));

    registrationState.set(ctx.from.id, newState("editGames", { step: "games", games: current }));

    return ctx.reply(
        `🎮 Оберіть ігри (до ${MAX_PROFILE_GAMES}). Натисніть на гру ще раз, щоб прибрати її.\nПотім — «${BTN.done}», і бот попросить ранг для кожної гри.`,
        gamesKeyboard(current)
    );
});

bot.hears(BTN.deleteProfile, async (ctx) => {
    if (!requireProfile(ctx)) return;

    return ctx.reply(
        "⚠️ Видалити анкету повністю? Зникнуть також запити та список тімейтів. Це не можна скасувати.",
        Markup.inlineKeyboard([
            [Markup.button.callback("✅ Так, видалити", "delete_profile")],
            [Markup.button.callback("❌ Ні", "cancel_delete")]
        ])
    );
});

bot.action("cancel_delete", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.editMessageText("❌ Видалення скасовано.");
});

bot.action("delete_profile", async (ctx) => {
    const telegramId = ctx.from.id;

    deleteUser(telegramId);
    registrationState.delete(telegramId);
    searchSessions.delete(telegramId);

    await ctx.answerCbQuery();
    await ctx.editMessageText("✅ Анкету видалено.");

    return ctx.reply(
        `Щоб знову користуватися ботом — створіть нову анкету.`,
        mainMenu(telegramId)
    );
});

/** Крок вибору ігор (спільний для анкети та пошуку). Повертає true, коли натиснули «Готово». */
async function handleGamesStep(
    ctx: Context,
    state: FlowState,
    text: string,
    options: { max?: number; extraRow?: string[] } = {}
): Promise<boolean> {

    if (text === BTN.done) {
        if (!state.games.length) {
            await ctx.reply("❌ Оберіть хоча б одну гру", gamesKeyboard(state.games, options.extraRow));
            return false;
        }

        return true;
    }

    if (text === BTN.myGames && options.extraRow?.includes(BTN.myGames)) {
        state.games = getUserGames(ctx.from!.id).map((g) => g.game).filter((g) => GAMES.includes(g));

        await ctx.reply(
            state.games.length ? `✅ Обрано ваші ігри: ${state.games.join(", ")}` : "У вашій анкеті ще немає ігор",
            gamesKeyboard(state.games, options.extraRow)
        );

        return false;
    }

    const game = parseGameButton(text);

    if (!game) {
        await ctx.reply("👇 Оберіть гру кнопкою", gamesKeyboard(state.games, options.extraRow));
        return false;
    }

    if (state.games.includes(game)) {
        state.games = state.games.filter((g) => g !== game);
    } else {
        if (options.max && state.games.length >= options.max) {
            await ctx.reply(`❌ Можна обрати до ${options.max} ігор`, gamesKeyboard(state.games, options.extraRow));
            return false;
        }

        state.games.push(game);
    }

    await ctx.reply(
        state.games.length ? `✅ Обрано: ${state.games.join(", ")}` : "Нічого не обрано",
        gamesKeyboard(state.games, options.extraRow)
    );

    return false;
}

async function askProfileRank(ctx: Context, state: FlowState) {
    const game = state.games[state.rankIndex];
    const progress = `(${state.rankIndex + 1}/${state.games.length})`;

    if (GAME_RANKS[game]) {
        return ctx.reply(`🏆 Ваш ранг у ${game} ${progress}:`, rankKeyboard(game, BTN.noRank));
    }

    return ctx.reply(
        `🏆 Ваш ранг у ${game} ${progress}: напишіть текстом або натисніть «${BTN.noRank}»`,
        stepKeyboard([BTN.noRank])
    );
}

/** Реєстрація та редагування ігор. */
async function handleProfileWizard(ctx: Context, state: FlowState, text: string) {
    const telegramId = ctx.from!.id;

    switch (state.step) {

        case "name": {
            const error = validateText(text, NAME_MAX_LENGTH, "Ім'я");

            if (error) return ctx.reply(error);

            state.name = text;
            state.step = "games";

            return ctx.reply(
                `Крок 2/5: В які ігри граєте? Оберіть до ${MAX_PROFILE_GAMES}, потім «${BTN.done}».`,
                gamesKeyboard(state.games)
            );
        }

        case "games": {
            const finished = await handleGamesStep(ctx, state, text, { max: MAX_PROFILE_GAMES });

            if (!finished) return;

            state.step = "ranks";
            state.rankIndex = 0;
            state.ranks = {};

            return askProfileRank(ctx, state);
        }

        case "ranks": {
            const game = state.games[state.rankIndex];
            const ranks = GAME_RANKS[game];

            if (text === BTN.noRank) {
                state.ranks[game] = "без рангу";
            } else if (ranks) {
                if (!ranks.includes(text)) {
                    return ctx.reply(`❌ Оберіть ранг для ${game} кнопкою`, rankKeyboard(game, BTN.noRank));
                }

                state.ranks[game] = text;
            } else {
                const error = validateText(text, CUSTOM_RANK_MAX_LENGTH, "Ранг");

                if (error) return ctx.reply(error);

                state.ranks[game] = text;
            }

            state.rankIndex++;

            if (state.rankIndex < state.games.length) {
                return askProfileRank(ctx, state);
            }

            if (state.flow === "editGames") {
                replaceUserGames(telegramId, state.ranks);
                updateField(telegramId, "games", state.games.join(", "));
                registrationState.delete(telegramId);

                return showOwnProfile(ctx, "✅ Ігри та ранги оновлено!");
            }

            state.step = "age";

            return ctx.reply("Крок 3/5: Скільки вам років?", stepKeyboard());
        }

        case "age": {
            const age = parseAge(text);

            if (age === null) return ctx.reply(AGE_ERROR);

            state.age = age;
            state.step = "gender";

            return ctx.reply("Крок 4/5: Ваша стать:", stepKeyboard([BTN.male, BTN.female]));
        }

        case "gender": {
            if (!GENDERS.includes(text)) {
                return ctx.reply("❌ Оберіть стать кнопкою", stepKeyboard([BTN.male, BTN.female]));
            }

            state.gender = text;
            state.step = "about";

            return ctx.reply(
                `Крок 5/5: Розкажіть коротко про себе — роль, коли граєте, чи є мікрофон (до ${ABOUT_MAX_LENGTH} символів).\n\nАбо натисніть «${BTN.skip}».`,
                stepKeyboard([BTN.skip])
            );
        }

        case "about": {
            let about = "";

            if (text !== BTN.skip) {
                const error = validateText(text, ABOUT_MAX_LENGTH, "Опис");

                if (error) return ctx.reply(error);

                about = text;
            }

            replaceUserGames(telegramId, state.ranks);

            saveUser(
                telegramId,
                ctx.from!.username || "",
                state.name!,
                state.games.join(", "),
                String(state.age),
                state.gender!,
                about
            );

            registrationState.delete(telegramId);

            const profile = getUser(telegramId)!;

            return ctx.reply(
                `${formatProfile(profile, "✅ Анкету створено!")}\n\nТепер натисніть «${BTN.search}», щоб знайти тімейтів 🎯`,
                mainMenu(telegramId)
            );
        }
    }
}

async function handleEditField(ctx: Context, state: FlowState, text: string) {
    const telegramId = ctx.from!.id;
    let value = text;

    switch (state.field) {
        case "gender":
            if (!GENDERS.includes(value)) {
                return ctx.reply("❌ Оберіть стать кнопкою", stepKeyboard([BTN.male, BTN.female]));
            }
            break;

        case "age": {
            const age = parseAge(value);

            if (age === null) return ctx.reply(AGE_ERROR);

            value = String(age);
            break;
        }

        case "name": {
            const error = validateText(value, NAME_MAX_LENGTH, "Ім'я");

            if (error) return ctx.reply(error);
            break;
        }

        case "about": {
            const error = validateText(value, ABOUT_MAX_LENGTH, "Опис");

            if (error) return ctx.reply(error);
            break;
        }

        default:
            registrationState.delete(telegramId);
            return;
    }

    updateField(telegramId, state.field, value);
    registrationState.delete(telegramId);

    // Змінився вік — стара видача пошуку могла стати некоректною.
    searchSessions.delete(telegramId);

    return showOwnProfile(ctx, "✅ Збережено!");
}

// =====================================================================
// Пошук
// =====================================================================

interface SearchPrefs {
    games: string[];
    gender: string;
    minAge: number;
    maxAge: number;
    rankFilters: Record<string, string>;
}

function loadSearchPrefs(telegramId: number): SearchPrefs | null {
    const saved = getSearchPreferences(telegramId);

    if (!saved) return null;

    let rankFilters: Record<string, string> = {};

    try {
        rankFilters = saved.rank_filters ? JSON.parse(saved.rank_filters) : {};
    } catch {
        rankFilters = {};
    }

    return {
        games: String(saved.games || "").split(",").map((g: string) => g.trim()).filter(Boolean),
        gender: saved.gender,
        minAge: Number(saved.min_age),
        maxAge: Number(saved.max_age),
        rankFilters
    };
}

function describePrefs(prefs: SearchPrefs): string {
    const games = prefs.games
        .map((game) => {
            const rank = prefs.rankFilters[game];

            return rank ? `${game} (${rankRangeLabel(game, rank)})` : game;
        })
        .join(", ");

    return `🎮 Ігри: ${games}\n👤 Стать: ${prefs.gender}\n🎂 Вік: ${prefs.minAge}–${prefs.maxAge}`;
}

function findProfiles(searcher: UserRecord, prefs: SearchPrefs): number[] {
    const searcherId = searcher.telegram_id;
    const allowed = allowedAgeRange(Number(searcher.age));
    const minAge = Math.max(prefs.minAge, allowed.min);
    const maxAge = Math.min(prefs.maxAge, allowed.max);

    // Не показуємо: себе, тих, з ким уже був запит чи матч, і нещодавно пропущених.
    const excluded = new Set<number>([
        searcherId,
        ...getInteractedUserIds(searcherId),
        ...getMatchedUserIds(searcherId),
        ...getRecentlyHiddenIds(searcherId, Date.now() - SKIP_HIDE_DAYS * 24 * 60 * 60 * 1000)
    ]);

    const gamesByUser = getAllUserGames();

    return getAllUsers()
        .filter((user) => {
            if (excluded.has(user.telegram_id)) return false;
            if (isBanned(user.telegram_id)) return false;

            const age = Number(user.age);

            if (!(age >= minAge && age <= maxAge)) return false;

            if (prefs.gender !== BTN.anyGender && user.gender !== prefs.gender) return false;

            const userGames = gamesByUser.get(user.telegram_id) || [];

            return prefs.games.some((game) => {
                const entry = userGames.find((g) => g.game === game);

                if (!entry) return false;

                const requiredRank = prefs.rankFilters[game];

                return !requiredRank || rankMatches(game, requiredRank, entry.rank);
            });
        })
        .map((user) => user.telegram_id)
        .sort(() => Math.random() - 0.5);
}

/** Показує наступну доступну анкету з поточної видачі. */
async function showCurrentCandidate(ctx: Context, telegramId: number) {
    const session = searchSessions.get(telegramId);

    while (session && session.index < session.ids.length) {
        const candidate = getUser(session.ids[session.index]);

        if (candidate && !isBanned(candidate.telegram_id)) {
            const left = session.ids.length - session.index;

            return ctx.reply(
                formatProfile(candidate, `🔎 Анкета (залишилось ${left})`),
                searchCardKeyboard(candidate.telegram_id)
            );
        }

        // Анкету видалили або забанили, поки користувач гортав.
        session.index++;
    }

    searchSessions.delete(telegramId);

    return ctx.reply(
        `👌 Це всі анкети на зараз.\n\nЗагляньте пізніше або розширте «${BTN.filters}» — більше ігор, будь-який ранг чи вік.`,
        mainMenu(telegramId)
    );
}

/** Переходить до наступної анкети, якщо зараз показана саме targetId. */
async function advanceSearch(ctx: Context, targetId: number) {
    const telegramId = ctx.from!.id;
    const session = searchSessions.get(telegramId);

    if (!session || session.ids[session.index] !== targetId) return false;

    session.index++;

    await showCurrentCandidate(ctx, telegramId);

    return true;
}

async function runSearch(ctx: Context, profile: UserRecord, prefs: SearchPrefs) {
    const telegramId = profile.telegram_id;
    const ids = findProfiles(profile, prefs);

    if (!ids.length) {
        searchSessions.delete(telegramId);

        return ctx.reply(
            `😔 Зараз немає нових анкет за вашими фільтрами.\n\n${describePrefs(prefs)}\n\nСпробуйте розширити «${BTN.filters}» або загляньте пізніше.`,
            mainMenu(telegramId)
        );
    }

    searchSessions.set(telegramId, { ids, index: 0 });

    await ctx.reply(`🔎 Знайдено анкет: ${ids.length}`, mainMenu(telegramId));

    return showCurrentCandidate(ctx, telegramId);
}

async function startSearchSetup(ctx: Context, intro = "") {
    registrationState.set(ctx.from!.id, newState("search", { step: "games" }));

    return ctx.reply(
        `${intro}🎮 Крок 1/3: У яких іграх шукаєте тімейтів? Можна кілька, потім «${BTN.done}».`,
        gamesKeyboard([], [BTN.myGames])
    );
}

bot.hears(BTN.search, async (ctx) => {
    const profile = requireProfile(ctx);

    if (!profile) return;

    registrationState.delete(ctx.from.id);

    const prefs = loadSearchPrefs(ctx.from.id);

    if (!prefs || !prefs.games.length) {
        return startSearchSetup(ctx, "Спершу налаштуємо, кого шукати — це один раз.\n\n");
    }

    return runSearch(ctx, profile, prefs);
});

bot.hears([BTN.filters, BTN.legacyEditSearch], async (ctx) => {
    if (!requireProfile(ctx)) return;

    const prefs = loadSearchPrefs(ctx.from.id);
    const current = prefs ? `⚙️ Поточні фільтри:\n${describePrefs(prefs)}\n\nНалаштуємо заново.\n\n` : "";

    return startSearchSetup(ctx, current);
});

async function askSearchRank(ctx: Context, state: FlowState) {
    // Пропускаємо ігри, для яких немає списку рангів.
    while (state.rankIndex < state.games.length && !GAME_RANKS[state.games[state.rankIndex]]) {
        state.rankIndex++;
    }

    if (state.rankIndex >= state.games.length) {
        state.step = "gender";

        return ctx.reply(
            "👤 Крок 2/3: Кого шукаєте?",
            stepKeyboard([BTN.male, BTN.female], [BTN.anyGender])
        );
    }

    const game = state.games[state.rankIndex];

    return ctx.reply(
        `🏆 Ранг у ${game}: оберіть приблизний рівень — покажемо гравців ±${rankWindow(game)} ранги від нього. Або «${BTN.anyRank}».`,
        rankKeyboard(game, BTN.anyRank)
    );
}

async function finishSearchSetup(ctx: Context, state: FlowState, minAge: number, maxAge: number) {
    const telegramId = ctx.from!.id;

    saveSearchPreferences(telegramId, state.games, state.gender!, minAge, maxAge, state.ranks);
    registrationState.delete(telegramId);

    const prefs = loadSearchPrefs(telegramId)!;

    await ctx.reply(`✅ Фільтри збережено\n\n${describePrefs(prefs)}`);

    return runSearch(ctx, getUser(telegramId)!, prefs);
}

function parseAgeRange(text: string): { min: number; max: number } | null {
    const match = text.trim().match(/^(\d{1,2})\s*[-–—\s]\s*(\d{1,2})$/);

    if (!match) return null;

    return { min: Number(match[1]), max: Number(match[2]) };
}

async function handleSearchSetup(ctx: Context, state: FlowState, text: string) {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        registrationState.delete(ctx.from!.id);
        return;
    }

    switch (state.step) {

        case "games": {
            const finished = await handleGamesStep(ctx, state, text, { extraRow: [BTN.myGames] });

            if (!finished) return;

            state.step = "ranks";
            state.rankIndex = 0;
            state.ranks = {};

            return askSearchRank(ctx, state);
        }

        case "ranks": {
            const game = state.games[state.rankIndex];

            if (text !== BTN.anyRank) {
                if (!GAME_RANKS[game]?.includes(text)) {
                    return ctx.reply(`❌ Оберіть ранг для ${game} кнопкою`, rankKeyboard(game, BTN.anyRank));
                }

                state.ranks[game] = text;
            }

            state.rankIndex++;

            return askSearchRank(ctx, state);
        }

        case "gender": {
            if (![BTN.male, BTN.female, BTN.anyGender].includes(text as any)) {
                return ctx.reply("❌ Оберіть варіант кнопкою", stepKeyboard([BTN.male, BTN.female], [BTN.anyGender]));
            }

            state.gender = text;

            const age = Number(profile.age);

            // Неповнолітнім вік не питаємо: їм доступні лише 14–17.
            if (isMinor(age)) {
                const allowed = allowedAgeRange(age);

                return finishSearchSetup(ctx, state, allowed.min, allowed.max);
            }

            state.step = "age";

            return ctx.reply(
                "🎂 Крок 3/3: Вік тімейтів — оберіть або напишіть діапазон, наприклад 20-30",
                stepKeyboard(["18–24", "25–34"], ["35–99"], [BTN.anyAge])
            );
        }

        case "age": {
            const allowed = allowedAgeRange(Number(profile.age));

            if (text === BTN.anyAge) {
                return finishSearchSetup(ctx, state, allowed.min, allowed.max);
            }

            const range = parseAgeRange(text);

            if (!range || range.min > range.max || range.min < allowed.min || range.max > allowed.max) {
                return ctx.reply(
                    `❌ Напишіть діапазон від ${allowed.min} до ${allowed.max}, наприклад 20-30`,
                    stepKeyboard(["18–24", "25–34"], ["35–99"], [BTN.anyAge])
                );
            }

            return finishSearchSetup(ctx, state, range.min, range.max);
        }
    }
}

bot.action("skip", async (ctx) => {
    const telegramId = ctx.from.id;
    const session = searchSessions.get(telegramId);

    if (!session || session.index >= session.ids.length) {
        await ctx.answerCbQuery(`Пошук застарів — натисніть «${BTN.search}»`);
        return;
    }

    hideProfile(telegramId, session.ids[session.index]);
    session.index++;

    await ctx.answerCbQuery();
    await removeButtons(ctx);

    return showCurrentCandidate(ctx, telegramId);
});

// Залишено для кнопок у старих повідомленнях.
bot.action("continue_search", async (ctx) => {
    await ctx.answerCbQuery(`Натисніть «${BTN.search}» 🔍`);
});

// =====================================================================
// Запити та матчі
// =====================================================================

/** Прибирає inline-кнопки з повідомлення, щоб їх не натискали повторно. */
async function removeButtons(ctx: Context): Promise<void> {
    try {
        await ctx.editMessageReplyMarkup(undefined);
    } catch {
        // Повідомлення застаре або вже без кнопок — це не помилка.
    }
}

/**
 * Надсилає картку вхідного запиту з кнопками «Прийняти / Відмовити».
 * Username відправника НЕ показується, доки запит не прийнято.
 * Повертає текст помилки, якщо запит показати не можна.
 */
async function sendIncomingRequest(ctx: Context, senderId: number): Promise<string | null> {
    const request = getPendingRequest(senderId, ctx.from!.id);

    if (!request) return "Цей запит уже оброблено";

    const senderProfile = getUser(senderId);

    if (!senderProfile || isBanned(senderId)) {
        updateRequestStatus(request.id, "rejected");
        return "❌ Анкета більше недоступна";
    }

    await ctx.reply(
        formatProfile(senderProfile, "🎮 Вас запрошують у гру!"),
        Markup.inlineKeyboard([
            [
                Markup.button.callback("✅ Хочу грати", `accept_${senderId}`),
                Markup.button.callback("❌ Відмовити", `reject_${senderId}`)
            ],
            [Markup.button.callback("⚠️ Поскаржитись", `report_user_${senderId}`)]
        ])
    );

    return null;
}

/** Показує перший доступний вхідний запит. Повертає false, якщо запитів немає. */
async function showNextPendingRequest(ctx: Context): Promise<boolean> {
    for (const request of getRequests(ctx.from!.id)) {
        const error = await sendIncomingRequest(ctx, request.from_user);

        if (!error) return true;
    }

    return false;
}

bot.hears(/^📨 Запити/, async (ctx) => {
    if (!requireProfile(ctx)) return;

    const shown = await showNextPendingRequest(ctx);

    if (!shown) {
        return ctx.reply("📭 Нових запитів немає.", mainMenu(ctx.from.id));
    }
});

bot.hears(BTN.teammates, async (ctx) => {
    if (!requireProfile(ctx)) return;

    const teammates = getMatchedUserIds(ctx.from.id)
        .map((id) => getUser(id))
        .filter((u): u is UserRecord => !!u)
        .slice(0, 30);

    if (!teammates.length) {
        return ctx.reply(
            `🤝 Тут з'являться гравці, які прийняли ваш запит (або ви — їхній).\n\nПоки що порожньо — натисніть «${BTN.search}»!`,
            mainMenu(ctx.from.id)
        );
    }

    const list = teammates
        .map((u) => {
            const games = getUserGames(u.telegram_id).map((g) => g.game).join(", ") || "—";

            return `👤 <b>${escapeHtml(u.name)}</b> — ${contactHtml(u)}\n🎮 ${escapeHtml(games)}`;
        })
        .join("\n\n");

    return ctx.reply(`🤝 Ваші тімейти:\n\n${list}`, { parse_mode: "HTML", ...mainMenu(ctx.from.id) });
});

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
        await removeButtons(ctx);
        await advanceSearch(ctx, targetId);
        return;
    }

    if (hasMatch(currentUserId, targetId)) {
        await ctx.answerCbQuery("🎉 У вас уже є матч із цим гравцем");
        return;
    }

    // Ця людина вже запросила нас — пропонуємо одразу прийняти її запит.
    if (getPendingRequest(targetId, currentUserId)) {
        await ctx.answerCbQuery("Цей гравець уже запросив вас!");
        await removeButtons(ctx);
        await sendIncomingRequest(ctx, targetId);
        return;
    }

    if (getPendingRequest(currentUserId, targetId)) {
        await ctx.answerCbQuery("⚠️ Ви вже відправили запит цьому гравцю");
        return;
    }

    createRequest(currentUserId, targetId);

    try {
        await bot.telegram.sendMessage(
            targetId,
            "🔔 Вас запросили в гру!",
            Markup.inlineKeyboard([
                [Markup.button.callback("👀 Переглянути", `request_from_${currentUserId}`)]
            ])
        );
    } catch {
        // Отримувач заблокував бота — запит лишається в розділі «📨 Запити».
    }

    await ctx.answerCbQuery("✅ Запит відправлено!");
    await removeButtons(ctx);

    await ctx.reply("✅ Запит відправлено! Коли гравець погодиться, ви отримаєте його контакт.");

    await advanceSearch(ctx, targetId);
});

bot.action(/^request_from_(\d+)$/, async (ctx) => {
    const error = await sendIncomingRequest(ctx, Number(ctx.match[1]));

    await ctx.answerCbQuery(error || undefined);

    if (!error) await removeButtons(ctx);
});

// Залишено для кнопок у старих повідомленнях.
bot.action(/^request_(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.match[1]);
    const request = getRequests(ctx.from.id).find((r) => r.id === requestId);

    if (!request) {
        await ctx.answerCbQuery("Цей запит уже оброблено");
        return;
    }

    const error = await sendIncomingRequest(ctx, request.from_user);

    await ctx.answerCbQuery(error || undefined);
});

function matchText(profile: UserRecord): string {
    return `🎉 МАТЧ!

👤 <b>${escapeHtml(profile.name)}</b>
📱 ${contactHtml(profile)}

Напишіть одне одному та домовтеся про гру 🎮
Усіх тімейтів можна знайти в «${BTN.teammates}».`;
}

bot.action(/^accept_(\d+)$/, async (ctx) => {
    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    // Прийняти можна лише реальний запит, що ще очікує відповіді.
    const pendingRequest = getPendingRequest(senderId, currentUserId);

    await removeButtons(ctx);

    if (!pendingRequest) {
        await ctx.answerCbQuery("Цей запит уже оброблено");
        return;
    }

    const senderProfile = getUser(senderId);
    const currentProfile = getUser(currentUserId);

    if (!senderProfile || !currentProfile || isBanned(senderId)) {
        updateRequestStatus(pendingRequest.id, "rejected");
        await ctx.answerCbQuery("❌ Анкета більше недоступна");
        return;
    }

    updateRequestStatus(pendingRequest.id, "accepted");

    if (!hasMatch(senderId, currentUserId)) {
        createMatch(senderId, currentUserId);
    }

    try {
        await bot.telegram.sendMessage(senderId, matchText(currentProfile), { parse_mode: "HTML" });
    } catch {
        // Відправник заблокував бота — контакт все одно отримає той, хто прийняв.
    }

    await ctx.answerCbQuery("🎉 Запит прийнято!");
    await ctx.reply(matchText(senderProfile), { parse_mode: "HTML", ...mainMenu(currentUserId) });

    await showNextPendingRequest(ctx);
});

bot.action(/^reject_(\d+)$/, async (ctx) => {
    const senderId = Number(ctx.match[1]);
    const currentUserId = ctx.from.id;

    const pendingRequest = getPendingRequest(senderId, currentUserId);

    if (pendingRequest) {
        updateRequestStatus(pendingRequest.id, "rejected");
    }

    await removeButtons(ctx);
    await ctx.answerCbQuery("Запит відхилено");

    const shown = await showNextPendingRequest(ctx);

    if (!shown) {
        await ctx.reply("❌ Запит відхилено. Більше запитів немає.", mainMenu(currentUserId));
    }
});

// =====================================================================
// Скарги та повідомлення про проблеми
// =====================================================================

bot.action(/^report_user_(\d+)$/, async (ctx) => {
    const targetId = Number(ctx.match[1]);

    if (reportedProfiles.get(ctx.from.id)?.has(targetId)) {
        await ctx.answerCbQuery("⚠️ Ви вже скаржилися на цю анкету");
        return;
    }

    registrationState.set(ctx.from.id, newState("report", { targetId }));

    await ctx.answerCbQuery();

    return ctx.reply("⚠️ Напишіть причину скарги одним повідомленням:", stepKeyboard());
});

async function handleReport(ctx: Context, state: FlowState, text: string) {
    const telegramId = ctx.from!.id;
    const reportedId = state.targetId!;

    const error = validateText(text, REPORT_MAX_LENGTH, "Причина скарги");

    if (error) return ctx.reply(error);

    // Стан скарги очищаємо одразу, щоб наступні повідомлення не йшли як нові скарги.
    registrationState.delete(telegramId);

    const reportedUser = getUser(reportedId);

    if (!reportedUser) {
        return ctx.reply("❌ Цю анкету вже видалено.", mainMenu(telegramId));
    }

    try {
        await bot.telegram.sendMessage(
            CHANNEL_ID,
            `🚨 Нова скарга

👤 Скаржник:
${ctx.from!.first_name}
🆔 ${telegramId}

━━━━━━━━━━

🎮 Анкета:
🆔 ${reportedUser.telegram_id}

${formatProfile(reportedUser)}

━━━━━━━━━━

📝 Причина:

${text}`
        );
    } catch (err) {
        console.error("Не вдалося надіслати скаргу в канал:", err);

        return ctx.reply("⚠️ Не вдалося надіслати скаргу. Спробуйте пізніше.", mainMenu(telegramId));
    }

    const reports = reportedProfiles.get(telegramId) || new Set<number>();

    reports.add(reportedId);
    reportedProfiles.set(telegramId, reports);

    // Анкету, на яку поскаржились, більше не показуємо в пошуку.
    hideProfile(telegramId, reportedId);

    await ctx.reply("✅ Скаргу надіслано. Дякуємо, адміністратор її перегляне.", mainMenu(telegramId));

    await advanceSearch(ctx, reportedId);
}

async function handleBugReport(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;

    const error = validateText(text, REPORT_MAX_LENGTH, "Повідомлення");

    if (error) return ctx.reply(error);

    registrationState.delete(telegramId);

    try {
        await bot.telegram.sendMessage(
            CHANNEL_ID,
            `🐞 Нова проблема

👤 ${ctx.from!.first_name}
🆔 ${telegramId}
📱 ${ctx.from!.username ? "@" + ctx.from!.username : "Без username"}

━━━━━━━━━━

${text}`
        );
    } catch (err) {
        console.error("Не вдалося надіслати повідомлення про проблему в канал:", err);

        return ctx.reply("⚠️ Не вдалося надіслати повідомлення. Спробуйте пізніше.", mainMenu(telegramId));
    }

    return ctx.reply("✅ Дякуємо! Ваше повідомлення відправлено адміністратору.", mainMenu(telegramId));
}

// =====================================================================
// Адміністрування
// =====================================================================

function parseUserIdArg(text: string): number | null {
    const id = Number(text.split(/\s+/)[1]);

    return Number.isInteger(id) && id > 0 ? id : null;
}

bot.command("ban", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const userId = parseUserIdArg(ctx.message.text);

    if (!userId) return ctx.reply("Приклад:\n/ban 123456789");

    banUser(userId);
    searchSessions.delete(userId);
    registrationState.delete(userId);

    return ctx.reply(`✅ Користувач ${userId} заблокований`);
});

bot.command("unban", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const userId = parseUserIdArg(ctx.message.text);

    if (!userId) return ctx.reply("Приклад:\n/unban 123456789");

    unbanUser(userId);

    return ctx.reply(`✅ Користувач ${userId} розблокований`);
});

bot.command("admin", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("⛔ У вас немає доступу.");
    }

    return ctx.reply(
        "🛠 Адмін-панель",
        Markup.inlineKeyboard([
            [Markup.button.callback("📊 Статистика", "admin_stats")],
            [Markup.button.callback("🐞 Скарги", "admin_reports")],
            [Markup.button.callback("📢 Розсилка", "admin_broadcast")],
            [Markup.button.callback("👥 Користувачі", "admin_users")]
        ])
    );
});

bot.action("admin_stats", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    await ctx.answerCbQuery();

    return ctx.reply(`📊 Статистика

👥 Анкет: ${getAllUsers().length}
🤝 Матчів: ${countMatches()}`);
});

bot.action("admin_users", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const text = getAllUsers()
        .slice(-10)
        .reverse()
        .map((u) => `👤 ${u.name}\n🆔 ${u.telegram_id}`)
        .join("\n\n");

    await ctx.answerCbQuery();

    return ctx.reply(`👥 Останні користувачі\n\n${text || "—"}`);
});

bot.action("admin_reports", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    await ctx.answerCbQuery();

    return ctx.reply(`🐞 Скарги переглядайте у каналі\n\n${CHANNEL_ID}`);
});

bot.action("admin_broadcast", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    registrationState.set(ctx.from.id, newState("broadcast"));

    await ctx.answerCbQuery();

    return ctx.reply("📢 Введіть текст розсилки:", stepKeyboard());
});

async function handleBroadcast(ctx: Context, text: string) {
    const telegramId = ctx.from!.id;

    registrationState.delete(telegramId);

    if (telegramId !== ADMIN_ID) return;

    const users = getAllUsers();
    let delivered = 0;

    for (const user of users) {
        try {
            await bot.telegram.sendMessage(user.telegram_id, `📢 Оголошення\n\n${text}`);
            delivered++;
        } catch {
            // Користувач заблокував бота або видалив акаунт.
        }

        // Telegram обмежує ~30 повідомлень/сек — не перевищуємо ліміт.
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return ctx.reply(`✅ Розсилку доставлено ${delivered} з ${users.length} користувачів`, mainMenu(telegramId));
}

// =====================================================================
// Текстові повідомлення — крок поточного діалогу
// =====================================================================

bot.on("text", async (ctx) => {
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = registrationState.get(telegramId);

    if (!state) {
        return ctx.reply("🤔 Не зрозумів. Скористайтеся кнопками меню 👇", mainMenu(telegramId));
    }

    switch (state.flow) {
        case "bug":
            return handleBugReport(ctx, text);

        case "report":
            return handleReport(ctx, state, text);

        case "broadcast":
            return handleBroadcast(ctx, ctx.message.text);

        case "register":
        case "editGames":
            return handleProfileWizard(ctx, state, text);

        case "editField":
            return handleEditField(ctx, state, text);

        case "search":
            return handleSearchSetup(ctx, state, text);
    }
});

// =====================================================================
// Запуск
// =====================================================================

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
