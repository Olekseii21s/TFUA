import { BTN, SKIP_HIDE_DAYS } from "../constants";
import { allowedAgeRange } from "../domain/validation";
import { rankMatches } from "../domain/ranks";
import { shuffle } from "../utils";
import { getSearchPreferences } from "../database/searchPreferences";
import { getAllUsers, UserRecord } from "../database/users";
import { getAllUserGames } from "../database/userGames";
import { isBanned } from "../database/bans";
import { getInteractedUserIds } from "../database/requests";
import { getMatchedUserIds } from "../database/matches";
import { getRecentlyHiddenIds } from "../database/hiddenProfiles";

export interface SearchPrefs {
    games: string[];
    gender: string;
    minAge: number;
    maxAge: number;
    rankFilters: Record<string, string>;
}

export function loadSearchPrefs(telegramId: number): SearchPrefs | null {
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

/**
 * ID анкет, які підходять під фільтри, у випадковому порядку.
 * Не показуємо: себе, забанених, тих, з ким уже був запит чи матч,
 * нещодавно пропущених, а також іншу вікову групу (діти/дорослі).
 */
export function findProfiles(searcher: UserRecord, prefs: SearchPrefs): number[] {
    const searcherId = searcher.telegram_id;
    const allowed = allowedAgeRange(Number(searcher.age));
    const minAge = Math.max(prefs.minAge, allowed.min);
    const maxAge = Math.min(prefs.maxAge, allowed.max);

    const excluded = new Set<number>([
        searcherId,
        ...getInteractedUserIds(searcherId),
        ...getMatchedUserIds(searcherId),
        ...getRecentlyHiddenIds(searcherId, Date.now() - SKIP_HIDE_DAYS * 24 * 60 * 60 * 1000)
    ]);

    const gamesByUser = getAllUserGames();

    const ids = getAllUsers()
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
        .map((user) => user.telegram_id);

    return shuffle(ids);
}
