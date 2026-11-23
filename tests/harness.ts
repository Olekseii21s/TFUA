import "./env";

import { Telegram } from "telegraf";
import { createBot } from "../src/bot";
import { LIMITS } from "../src/services/rateLimit";
import { setDocumentUploader } from "../src/services/backup";
import * as notifications from "../src/services/notifications";

notifications.NOTIFY_DELAY.ms = 0;

export interface ApiCall {
    method: string;
    chat_id?: number | string;
    text?: string;
    reply_markup?: any;
    [key: string]: any;
}

/** Усі виклики Telegram API, які зробив бот (реальні запити не надсилаються). */
export const calls: ApiCall[] = [];

/** ID чатів, які «заблокували бота»: sendMessage до них падає з 403. */
export const blockedChats = new Set<number>();

Telegram.prototype.callApi = async function (method: string, payload: any) {
    if (method === "sendMessage" && blockedChats.has(payload.chat_id)) {
        throw new Error("403: Forbidden: bot was blocked by the user");
    }

    calls.push({ method, ...payload });

    return { message_id: 1, chat: { id: payload.chat_id } } as any;
} as any;

// Файли бекапу теж не відправляємо в мережу — лише записуємо виклик.
setDocumentUploader(async (chatId, _file, filename, caption) => {
    calls.push({ method: "sendDocument", chat_id: chatId, caption, document: { filename } });
});

// У тестах користувачі діють дуже швидко — загальний антифлуд вимикаємо (окремий тест вмикає).
LIMITS.flood.limit = 100_000;

export interface TestUser {
    id: number;
    is_bot: false;
    first_name: string;
    username?: string;
}

export function user(id: number, username?: string): TestUser {
    return { id, is_bot: false, first_name: `User${id}`, username };
}

export function createTestBot() {
    const bot = createBot("123456:test-token");

    bot.botInfo = { id: 1, is_bot: true, first_name: "Bot", username: "test_bot" } as any;

    let updateId = 1;

    // Після кожного апдейту чекаємо фонову розсилку сповіщень — щоб тести були детермінованими.
    const send = async (from: TestUser, text: string) => {
        const isCommand = text.startsWith("/");

        await bot.handleUpdate({
            update_id: updateId++,
            message: {
                message_id: updateId,
                date: 0,
                chat: { id: from.id, type: "private", first_name: from.first_name },
                from,
                text,
                ...(isCommand
                    ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] }
                    : {})
            }
        } as any);

        await notifications.lastNotificationRun;
    };

    const press = async (from: TestUser, data: string) => {
        await bot.handleUpdate({
            update_id: updateId++,
            callback_query: {
                id: String(updateId),
                from,
                chat_instance: "test",
                data,
                message: { message_id: 5, date: 0, chat: { id: from.id, type: "private" }, text: "card" }
            }
        } as any);

        await notifications.lastNotificationRun;
    };

    const register = async (
        u: TestUser,
        opts: { name?: string; games?: [string, string][]; age: number; gender?: string; about?: string }
    ) => {
        await send(u, "📝 Створити анкету");
        await send(u, opts.name ?? `Name${u.id}`);

        const games = opts.games ?? [["CS2", "5 lvl"]];

        for (const [game] of games) await send(u, game);
        await send(u, "✅ Готово");
        for (const [, rank] of games) await send(u, rank);

        await send(u, String(opts.age));
        await send(u, opts.gender ?? "👨 Чоловік");
        await send(u, opts.about ?? "⏭ Пропустити");
    };

    return { bot, send, press, register };
}

/** Тексти повідомлень, надісланих у чат (після останнього clear()). */
export function sentTo(chatId: number | string): string[] {
    return calls
        .filter((c) => c.method === "sendMessage" && c.chat_id === chatId)
        .map((c) => c.text ?? "");
}

/** Відповіді на натискання inline-кнопок. */
export function callbackAnswers(): string[] {
    return calls.filter((c) => c.method === "answerCallbackQuery").map((c) => c.text ?? "");
}

export function lastMessageTo(chatId: number | string): ApiCall | undefined {
    return calls.filter((c) => c.method === "sendMessage" && c.chat_id === chatId).at(-1);
}

export function inlineButtons(call: ApiCall | undefined): string[] {
    return (call?.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data);
}

export function keyboardButtons(call: ApiCall | undefined): string[] {
    return (call?.reply_markup?.keyboard ?? []).flat().map((b: any) => (typeof b === "string" ? b : b.text));
}

export function clear() {
    calls.length = 0;
}
