import { GAME_RANKS } from "../constants";

/** Наскільки рангів вгору/вниз шукати від обраного (≈12% шкали, мінімум 2). */
export function rankWindow(game: string): number {
    const ranks = GAME_RANKS[game];

    return ranks ? Math.max(2, Math.round(ranks.length * 0.12)) : 0;
}

/** Текст діапазону для обраного рангу, напр. «3 lvl – 7 lvl». */
export function rankRangeLabel(game: string, rank: string): string {
    const ranks = GAME_RANKS[game];
    const index = ranks?.indexOf(rank) ?? -1;

    if (!ranks || index === -1) return rank;

    const window = rankWindow(game);
    const low = ranks[Math.max(0, index - window)];
    const high = ranks[Math.min(ranks.length - 1, index + window)];

    return low === high ? rank : `${low} – ${high}`;
}

/** Чи підходить ранг гравця під фільтр пошуку (з урахуванням діапазону). */
export function rankMatches(game: string, requiredRank: string, actualRank: string): boolean {
    const ranks = GAME_RANKS[game];

    if (!ranks) return true;

    const required = ranks.indexOf(requiredRank);

    if (required === -1) return true;

    const actual = ranks.indexOf(actualRank);

    // Гравець без рангу зі списку не підходить під фільтр за рангом.
    if (actual === -1) return false;

    return Math.abs(actual - required) <= rankWindow(game);
}
