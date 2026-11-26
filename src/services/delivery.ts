import type { Telegram } from "telegraf";
import { logError } from "../logging";
import { markBlockedBot } from "../database/users";

/** Чи означає помилка, що гравець заблокував бота або видалив акаунт. */
export function isBlockedError(err: unknown): boolean {
    const e = err as { code?: number; response?: { error_code?: number; description?: string }; message?: string };
    const code = e?.response?.error_code ?? e?.code;
    const description = String(e?.response?.description ?? e?.message ?? "");

    return code === 403 || /\b403\b|bot was blocked|user is deactivated|chat not found/i.test(description);
}

/**
 * Надсилає повідомлення гравцю. Якщо він заблокував бота — позначає це в базі
 * (такі гравці зникають із пошуку та сповіщень) і повертає false, не кидаючи помилку.
 */
export async function sendToUser(
    telegram: Telegram,
    chatId: number,
    text: string,
    extra?: Parameters<Telegram["sendMessage"]>[2]
): Promise<boolean> {
    try {
        await telegram.sendMessage(chatId, text, extra);
        return true;
    } catch (err) {
        if (isBlockedError(err)) {
            markBlockedBot(chatId);
        } else {
            logError(`Не вдалося надіслати повідомлення користувачу ${chatId}:`, err);
        }

        return false;
    }
}
