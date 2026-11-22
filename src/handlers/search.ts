import { Context, Telegraf } from "telegraf";
import { BTN, GAME_RANKS } from "../constants";
import { allowedAgeRange, isMinor, parseAgeRange } from "../domain/validation";
import { rankWindow } from "../domain/ranks";
import { FlowState, flowStore, newState, searchStore } from "../state";
import { findProfiles, loadSearchPrefs, SearchPrefs } from "../services/search";
import { getUser, UserRecord } from "../database/users";
import { isBanned } from "../database/bans";
import { hideProfile } from "../database/hiddenProfiles";
import { saveSearchPreferences } from "../database/searchPreferences";
import { describePrefs, formatProfile } from "../ui/format";
import { gamesKeyboard, mainMenu, rankKeyboard, searchCardKeyboard, stepKeyboard } from "../ui/keyboards";
import { handleGamesStep, removeButtons, requireProfile } from "./common";

const AGE_PRESETS = [["18–24", "25–34"], ["35–99"], [BTN.anyAge]];

/** Показує поточну доступну анкету з видачі (пропускаючи видалені й забанені). */
export async function showCurrentCandidate(ctx: Context, telegramId: number) {
    const session = searchStore.get(telegramId);

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

    searchStore.delete(telegramId);

    return ctx.reply(
        `👌 Це всі анкети на зараз.\n\nЗагляньте пізніше або розширте «${BTN.filters}» — більше ігор, будь-який ранг чи вік.`,
        mainMenu(telegramId)
    );
}

/** Переходить до наступної анкети, якщо зараз показана саме targetId. */
export async function advanceSearch(ctx: Context, targetId: number): Promise<boolean> {
    const telegramId = ctx.from!.id;
    const session = searchStore.get(telegramId);

    if (!session || session.ids[session.index] !== targetId) return false;

    session.index++;

    await showCurrentCandidate(ctx, telegramId);

    return true;
}

async function runSearch(ctx: Context, profile: UserRecord, prefs: SearchPrefs) {
    const telegramId = profile.telegram_id;
    const ids = findProfiles(profile, prefs);

    if (!ids.length) {
        searchStore.delete(telegramId);

        return ctx.reply(
            `😔 Зараз немає нових анкет за вашими фільтрами.\n\n${describePrefs(prefs)}\n\nСпробуйте розширити «${BTN.filters}» або загляньте пізніше.`,
            mainMenu(telegramId)
        );
    }

    searchStore.set(telegramId, { ids, index: 0 });

    await ctx.reply(`🔎 Знайдено анкет: ${ids.length}`, mainMenu(telegramId));

    return showCurrentCandidate(ctx, telegramId);
}

async function startSearchSetup(ctx: Context, intro = "") {
    flowStore.set(ctx.from!.id, newState("search", { step: "games" }));

    return ctx.reply(
        `${intro}🎮 Крок 1/3: У яких іграх шукаєте тімейтів? Можна кілька, потім «${BTN.done}».`,
        gamesKeyboard([], [BTN.myGames])
    );
}

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
    flowStore.delete(telegramId);

    const prefs = loadSearchPrefs(telegramId)!;

    await ctx.reply(`✅ Фільтри збережено\n\n${describePrefs(prefs)}`);

    return runSearch(ctx, getUser(telegramId)!, prefs);
}

export async function handleSearchSetup(ctx: Context, state: FlowState, text: string) {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        flowStore.delete(ctx.from!.id);
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
            if (!([BTN.male, BTN.female, BTN.anyGender] as string[]).includes(text)) {
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
                stepKeyboard(...AGE_PRESETS)
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
                    stepKeyboard(...AGE_PRESETS)
                );
            }

            return finishSearchSetup(ctx, state, range.min, range.max);
        }
    }
}

export function registerSearchHandlers(bot: Telegraf) {

    bot.hears(BTN.search, async (ctx) => {
        const profile = requireProfile(ctx);

        if (!profile) return;

        flowStore.delete(ctx.from.id);

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

    bot.action("skip", async (ctx) => {
        const telegramId = ctx.from.id;
        const session = searchStore.get(telegramId);

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
}
