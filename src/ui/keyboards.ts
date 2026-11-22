import { Markup } from "telegraf";
import { BTN, GAMES, GAME_RANKS } from "../constants";
import { chunk } from "../utils";
import { getUser } from "../database/users";
import { getRequests } from "../database/requests";

/** Головне меню — завжди однакове. Кількість нових запитів видно прямо на кнопці. */
export function mainMenu(telegramId: number) {
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

export function profileMenu() {
    return Markup.keyboard([
        [BTN.editName, BTN.editAge],
        [BTN.editGender, BTN.editAbout],
        [BTN.editGames],
        [BTN.deleteProfile],
        [BTN.back]
    ]).resize();
}

/** Клавіатура кроку: додаткові рядки + завжди кнопка «Назад». */
export function stepKeyboard(...rows: string[][]) {
    return Markup.keyboard([...rows, [BTN.back]]).resize();
}

/** Список ігор; обрані позначені ✅ (повторне натискання — прибирає гру). */
export function gamesKeyboard(selected: string[], extraRow: string[] = []) {
    const buttons = GAMES.map((game) => (selected.includes(game) ? `✅ ${game}` : game));
    const rows = chunk(buttons, 2);

    if (extraRow.length) rows.unshift(extraRow);

    return stepKeyboard(...rows, [BTN.done]);
}

export function parseGameButton(text: string): string | null {
    const game = text.replace(/^✅\s*/, "");

    return GAMES.includes(game) ? game : null;
}

export function rankKeyboard(game: string, extraButton: string) {
    const ranks = GAME_RANKS[game] || [];

    return stepKeyboard(...chunk(ranks, 3), [extraButton]);
}

export function searchCardKeyboard(targetId: number) {
    return Markup.inlineKeyboard([
        [Markup.button.callback("🎮 Запросити в гру", `like_${targetId}`)],
        [
            Markup.button.callback("⏭ Пропустити", "skip"),
            Markup.button.callback("⚠️ Поскаржитись", `report_user_${targetId}`)
        ]
    ]);
}
