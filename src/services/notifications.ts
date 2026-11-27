import { Markup, Telegram } from "telegraf";
import { sameAgeGroup } from "../domain/validation";
import { getAllSearchPreferences } from "../database/searchPreferences";
import { getUser, UserRecord } from "../database/users";
import { getUserGames } from "../database/userGames";
import { isBanned } from "../database/bans";
import { getLastNotifiedAt, isNotifyEnabled, markNotified } from "../database/notifications";
import { isReachable, matchesPrefs, parseSearchPrefs } from "./search";
import { sendToUser } from "./delivery";
import { runInBackground } from "./background";

/** Не частіше одного сповіщення на 3 години на людину — щоб після реклами не було спаму. */
export const NOTIFY_COOLDOWN_MS = 3 * 60 * 60 * 1000;

/** Пауза між повідомленнями (ліміт Telegram ~30 повідомлень/сек). */
export const NOTIFY_DELAY = { ms: 50 };

/** Кому варто повідомити про нового гравця: його анкета підходить під їхні збережені фільтри. */
export function findUsersToNotify(newPlayer: UserRecord, now = Date.now()): number[] {
    const newPlayerGames = getUserGames(newPlayer.telegram_id);
    const result: number[] = [];

    for (const row of getAllSearchPreferences()) {
        const searcherId = row.telegram_id;

        if (searcherId === newPlayer.telegram_id) continue;
        if (!isNotifyEnabled(searcherId)) continue;
        if (now - getLastNotifiedAt(searcherId) < NOTIFY_COOLDOWN_MS) continue;
        if (isBanned(searcherId)) continue;

        const searcher = getUser(searcherId);

        // Неактивним і тим, хто заблокував бота, не пишемо.
        if (!searcher || !isReachable(searcher, now) || !sameAgeGroup(searcher, newPlayer)) continue;

        if (matchesPrefs(searcher, parseSearchPrefs(row), newPlayer, newPlayerGames)) {
            result.push(searcherId);
        }
    }

    return result;
}

function notificationText(newPlayer: UserRecord): string {
    const games = getUserGames(newPlayer.telegram_id)
        .map((g) => `${g.game} — ${g.rank}`)
        .join(", ");

    return `🆕 З'явився новий гравець під ваші фільтри!

👤 ${newPlayer.name}, ${newPlayer.age}
🎮 ${games}`;
}

const notificationKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("👀 Подивитися гравців", "notify_search")],
    [Markup.button.callback("🔕 Не надсилати такі сповіщення", "notify_off")]
]);

/**
 * Повідомляє зацікавлених користувачів про нову анкету.
 * Працює у фоні, щоб не затримувати відповідь новому гравцю і не блокувати бота.
 */
export function notifyAboutNewPlayer(telegram: Telegram, newPlayer: UserRecord): Promise<void> {
    return runInBackground("сповіщення про нового гравця", async () => {
        if (isBanned(newPlayer.telegram_id)) return;

        const recipients = findUsersToNotify(newPlayer);
        const text = notificationText(newPlayer);

        for (const recipientId of recipients) {
            // Відмічаємо одразу: навіть якщо людина заблокувала бота, не пробуємо знову щохвилини.
            markNotified(recipientId);

            await sendToUser(telegram, recipientId, text, notificationKeyboard);

            if (NOTIFY_DELAY.ms) await new Promise((resolve) => setTimeout(resolve, NOTIFY_DELAY.ms));
        }
    });
}
