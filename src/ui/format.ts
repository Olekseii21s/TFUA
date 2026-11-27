import { BTN } from "../constants";
import { rankRangeLabel } from "../domain/ranks";
import { escapeHtml } from "../utils";
import { getUserGames, UserGameRecord } from "../database/userGames";
import { UserRecord } from "../database/users";
import { SearchPrefs } from "../services/search";

/** Текст анкети. Username тут не показується — лише після взаємної згоди (матчу). */
export function formatProfile(
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

/** Контакт для HTML-повідомлень: @username або посилання на профіль. */
export function contactHtml(profile: UserRecord): string {
    return profile.username
        ? `@${escapeHtml(profile.username)}`
        : `<a href="tg://user?id=${profile.telegram_id}">написати в Telegram</a>`;
}

export function matchText(profile: UserRecord): string {
    return `🎉 МАТЧ!

👤 <b>${escapeHtml(profile.name)}</b>
📱 ${contactHtml(profile)}

Напишіть одне одному та домовтеся про гру 🎮
Усіх тімейтів можна знайти в «${BTN.teammates}».`;
}

export function describePrefs(prefs: SearchPrefs): string {
    const games = prefs.games
        .map((game) => {
            const rank = prefs.rankFilters[game];

            return rank ? `${game} (${rankRangeLabel(game, rank)})` : game;
        })
        .join(", ");

    return `🎮 Ігри: ${games}\n👤 Стать: ${prefs.gender}\n🎂 Вік: ${prefs.minAge}–${prefs.maxAge}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** «сьогодні», «вчора», «3 дн. тому». */
export function formatAgo(ms: number): string {
    const days = Math.floor(Math.max(0, ms) / DAY_MS);

    if (days === 0) return "сьогодні";
    if (days === 1) return "вчора";

    return `${days} дн. тому`;
}

/** «через 5 дн.» або «менш ніж за добу». */
export function formatTimeLeft(ms: number): string {
    if (ms <= DAY_MS) return "менш ніж за добу";

    return `через ${Math.ceil(ms / DAY_MS)} дн.`;
}
