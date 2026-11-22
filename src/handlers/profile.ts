import { Context, Markup, Telegraf } from "telegraf";
import {
    ABOUT_MAX_LENGTH,
    BTN,
    CUSTOM_RANK_MAX_LENGTH,
    GAMES,
    GAME_RANKS,
    GENDERS,
    MAX_PROFILE_GAMES,
    NAME_MAX_LENGTH
} from "../constants";
import { AGE_ERROR, parseAge, validateText } from "../domain/validation";
import { FlowState, flowStore, newState, searchStore } from "../state";
import { getUser, saveUser, updateField } from "../database/users";
import { getUserGames, replaceUserGames } from "../database/userGames";
import { deleteUser } from "../database/deleteUser";
import { formatProfile } from "../ui/format";
import { gamesKeyboard, mainMenu, profileMenu, rankKeyboard, stepKeyboard } from "../ui/keyboards";
import { handleGamesStep, requireProfile } from "./common";

export async function showOwnProfile(ctx: Context, title = "👤 Ваша анкета") {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        return startRegistration(ctx);
    }

    return ctx.reply(
        `${formatProfile(profile, title)}\n\n✏️ Щоб щось змінити — оберіть кнопку нижче.`,
        profileMenu()
    );
}

export async function startRegistration(ctx: Context) {
    const firstName = ctx.from!.first_name?.trim() || "";

    flowStore.set(ctx.from!.id, newState("register", { step: "name" }));

    const suggestion = firstName && firstName.length <= NAME_MAX_LENGTH ? [[firstName]] : [];

    return ctx.reply(
        "📝 Створюємо анкету — це займе хвилину.\n\nКрок 1/5: Як тебе звати?",
        stepKeyboard(...suggestion)
    );
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
export async function handleProfileWizard(ctx: Context, state: FlowState, text: string) {
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
                flowStore.delete(telegramId);

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

            flowStore.delete(telegramId);

            const profile = getUser(telegramId)!;

            return ctx.reply(
                `${formatProfile(profile, "✅ Анкету створено!")}\n\nТепер натисніть «${BTN.search}», щоб знайти тімейтів 🎯`,
                mainMenu(telegramId)
            );
        }
    }
}

export async function handleEditField(ctx: Context, state: FlowState, text: string) {
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
            flowStore.delete(telegramId);
            return;
    }

    updateField(telegramId, state.field, value);
    flowStore.delete(telegramId);

    // Змінився вік — стара видача пошуку могла стати некоректною.
    searchStore.delete(telegramId);

    return showOwnProfile(ctx, "✅ Збережено!");
}

export function registerProfileHandlers(bot: Telegraf) {

    bot.hears([BTN.profile, BTN.legacyEditProfile, BTN.createProfile], async (ctx) => {
        flowStore.delete(ctx.from.id);

        return showOwnProfile(ctx);
    });

    bot.hears(BTN.editName, async (ctx) => {
        if (!requireProfile(ctx)) return;

        flowStore.set(ctx.from.id, newState("editField", { field: "name" }));

        return ctx.reply(`📝 Введіть нове ім'я (до ${NAME_MAX_LENGTH} символів):`, stepKeyboard());
    });

    bot.hears(BTN.editAge, async (ctx) => {
        if (!requireProfile(ctx)) return;

        flowStore.set(ctx.from.id, newState("editField", { field: "age" }));

        return ctx.reply("🎂 Введіть новий вік:", stepKeyboard());
    });

    bot.hears(BTN.editGender, async (ctx) => {
        if (!requireProfile(ctx)) return;

        flowStore.set(ctx.from.id, newState("editField", { field: "gender" }));

        return ctx.reply("👤 Оберіть стать:", stepKeyboard([BTN.male, BTN.female]));
    });

    bot.hears(BTN.editAbout, async (ctx) => {
        if (!requireProfile(ctx)) return;

        flowStore.set(ctx.from.id, newState("editField", { field: "about" }));

        return ctx.reply(
            `📄 Напишіть кілька слів про себе (до ${ABOUT_MAX_LENGTH} символів): роль, коли граєте, чи є мікрофон...`,
            stepKeyboard()
        );
    });

    bot.hears(BTN.editGames, async (ctx) => {
        if (!requireProfile(ctx)) return;

        const current = getUserGames(ctx.from.id).map((g) => g.game).filter((g) => GAMES.includes(g));

        flowStore.set(ctx.from.id, newState("editGames", { step: "games", games: current }));

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

        // deleteUser також видаляє збережені діалоги та видачу пошуку.
        deleteUser(telegramId);
        flowStore.delete(telegramId);
        searchStore.delete(telegramId);

        await ctx.answerCbQuery();
        await ctx.editMessageText("✅ Анкету видалено.");

        return ctx.reply(
            `Щоб знову користуватися ботом — створіть нову анкету.`,
            mainMenu(telegramId)
        );
    });
}
