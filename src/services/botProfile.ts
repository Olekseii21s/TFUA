import type { Telegram } from "telegraf";
import { logError } from "../logging";

/** Показується в Telegram ДО натискання «Старт» — перше, що бачить людина з реклами. */
export const BOT_DESCRIPTION = `🎮 Team Finder — пошук тімейтів для CS2, Valorant, Dota 2, LoL та ще 13 ігор.

• Анкета за хвилину: ігри, ранги, вік
• Гравці твого рівня — без рандомів
• Контакт відкривається лише після взаємної згоди

Натисни «Старт», щоб знайти свою команду!`;

/** Короткий опис — у профілі бота і при пересиланні посилання. */
export const BOT_SHORT_DESCRIPTION = "Пошук тімейтів для CS2, Valorant, Dota 2 та інших ігор 🎮";

export const PUBLIC_COMMANDS = [
    { command: "start", description: "Головне меню" },
    { command: "help", description: "Як користуватися ботом" },
    { command: "privacy", description: "Які дані зберігає бот" }
];

export const ADMIN_COMMANDS = [
    ...PUBLIC_COMMANDS,
    { command: "admin", description: "Адмін-панель" },
    { command: "stats", description: "Статистика" },
    { command: "backup", description: "Бекап бази" },
    { command: "ban", description: "Заблокувати: /ban <id>" },
    { command: "unban", description: "Розблокувати: /unban <id>" }
];

/**
 * Налаштовує профіль бота при старті: меню команд (окреме для адміна)
 * та опис — але лише якщо опис ще не заданий, щоб не затерти текст із @BotFather.
 */
export async function setupBotProfile(telegram: Telegram, adminId: number): Promise<void> {
    try {
        await telegram.setMyCommands(PUBLIC_COMMANDS);
        await telegram.setMyCommands(ADMIN_COMMANDS, { scope: { type: "chat", chat_id: adminId } });

        const { description } = await telegram.getMyDescription();

        if (!description) await telegram.setMyDescription(BOT_DESCRIPTION);

        const { short_description } = await telegram.getMyShortDescription();

        if (!short_description) await telegram.setMyShortDescription(BOT_SHORT_DESCRIPTION);
    } catch (err) {
        // Не критично для роботи бота — лише логуємо.
        logError("⚠️ Не вдалося налаштувати меню команд або опис бота:", err);
    }
}
