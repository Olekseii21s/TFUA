import { Context } from "telegraf";
import { BTN, GAMES } from "../constants";
import { FlowState } from "../state";
import { getUser, UserRecord } from "../database/users";
import { getUserGames } from "../database/userGames";
import { gamesKeyboard, mainMenu, parseGameButton } from "../ui/keyboards";

/** Повертає анкету або підказує її створити. */
export function requireProfile(ctx: Context): UserRecord | undefined {
    const profile = getUser(ctx.from!.id);

    if (!profile) {
        ctx.reply(`❌ Спочатку створіть анкету — кнопка «${BTN.createProfile}»`, mainMenu(ctx.from!.id));
    }

    return profile;
}

/** Прибирає inline-кнопки з повідомлення, щоб їх не натискали повторно. */
export async function removeButtons(ctx: Context): Promise<void> {
    try {
        await ctx.editMessageReplyMarkup(undefined);
    } catch {
        // Повідомлення застаре або вже без кнопок — це не помилка.
    }
}

/** Крок вибору ігор (спільний для анкети та пошуку). Повертає true, коли натиснули «Готово». */
export async function handleGamesStep(
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
