import type { Telegram } from "telegraf";
import { BTN, REQUEST_TTL_DAYS } from "../constants";
import { expirePendingRequests } from "../database/requests";
import { getUser } from "../database/users";
import { hideProfile } from "../database/hiddenProfiles";
import { sendToUser } from "./delivery";
import { runInBackground } from "./background";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Пауза між повідомленнями про згорілі запити (ліміт Telegram ~30 повідомлень/сек). */
export const EXPIRY_NOTICE_DELAY = { ms: 50 };

function expiredText(targetName: string): string {
    return `⌛ Ваше запрошення для «${targetName}» згоріло — гравець не відповів за ${REQUEST_TTL_DAYS} днів.

Пошукайте інших тімейтів: «${BTN.search}».`;
}

/**
 * Позначає запрошення без відповіді старші за REQUEST_TTL_DAYS як «згорілі»
 * і повідомляє відправників. Повертає кількість згорілих запитів.
 */
export async function expireOldRequests(telegram: Telegram, now = Date.now()): Promise<number> {
    const expired = expirePendingRequests(now - REQUEST_TTL_DAYS * DAY);

    for (const request of expired) {
        // Після згорання гравці можуть знову зустрітися в пошуку, але не одразу.
        hideProfile(request.from_user, request.to_user, now);

        const target = getUser(request.to_user);

        if (!target) continue;

        await sendToUser(telegram, request.from_user, expiredText(target.name));

        if (EXPIRY_NOTICE_DELAY.ms) await new Promise((resolve) => setTimeout(resolve, EXPIRY_NOTICE_DELAY.ms));
    }

    return expired.length;
}

/** Перевірка при старті бота і далі щогодини. */
export function scheduleRequestExpiry(telegram: Telegram): void {
    const run = () => runInBackground("згорання запитів", () => expireOldRequests(telegram));

    void run();
    setInterval(run, HOUR).unref();
}
