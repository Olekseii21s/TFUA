import { Telegraf } from "telegraf";
import { BTN, REQUEST_TTL_DAYS } from "../constants";
import { flowStore } from "../state";
import { getUser } from "../database/users";
import { recordSource } from "../database/sources";
import { mainMenu } from "../ui/keyboards";
import { showOwnProfile } from "./profile";

const WELCOME_TEXT = `🎮 Вітаємо в Team Finder!

Тут ти можеш знайти тімейтів для улюблених ігор, переглядати анкети інших гравців та надсилати запити на спільну гру.

📋 Як це працює:
1️⃣ Створи анкету — ігри, ранги, вік і пару слів про себе
2️⃣ Натисни «${BTN.search}» і гортай анкети
3️⃣ Запроси гравця в гру — коли він погодиться, ви отримаєте контакти одне одного

⚠️ Бот у Beta-версії. Якщо помітиш проблему або маєш ідею — натисни «${BTN.bug}».

Гарної гри! 🎯`;

export const HELP_TEXT = `ℹ️ Як користуватися Team Finder

${BTN.profile} — переглянути та змінити анкету (ігри, ранги, вік, опис)
${BTN.search} — гортати анкети гравців під твої фільтри
${BTN.filters} — які ігри, ранги, стать і вік шукаєш
${BTN.requests} — вхідні запрошення і ваші надіслані (їх можна скасувати)
${BTN.teammates} — гравці, з якими у вас матч, та їхні контакти (можна прибрати когось зі списку)
${BTN.bug} — написати адміністратору

🎮 Запросив гравця → він погодився → ви обоє отримуєте контакти одне одного.
🔔 Коли з'являється новий гравець під твої фільтри — бот надішле сповіщення (не частіше ніж раз на 3 години).
⌛ Запрошення без відповіді згорають через ${REQUEST_TTL_DAYS} днів.
⏸ Знайшов команду? «${BTN.profile}» → «${BTN.pauseProfile}» — і анкета зникне з пошуку, доки не покажеш її знову.

/privacy — які дані зберігає бот і як їх видалити`;

export const PRIVACY_TEXT = `🔒 Приватність

Що зберігає бот:
• Telegram ID і username
• дані анкети: ім'я, ігри й ранги, вік, стать, опис
• фільтри пошуку, запити, матчі та скарги
• час останньої активності і мітку посилання, з якого ти прийшов

Хто це бачить:
• анкету (без username) — інші гравці в пошуку, лише твоєї вікової групи (до 18 — тільки неповнолітні, 18+ — тільки дорослі)
• username / контакт — лише гравець, з яким у вас взаємна згода (матч)
• адміністратор — для модерації скарг і резервних копій бази

Дані не продаються і не передаються третім особам.

Як видалити: «${BTN.profile}» → «${BTN.deleteProfile}». Анкета, запити, матчі, фільтри й налаштування видаляються одразу; у резервних копіях бази вони можуть зберігатися ще деякий час.

Питання — «${BTN.bug}».`;

/**
 * Мітка джерела з посилання t.me/<бот>?start=<мітка>, напр. tiktok, reels_nov.
 * Дозволені лише латиниця, цифри, _ і - (так само обмежує сам Telegram).
 */
export function parseSourceLabel(payload: string | undefined): string {
    const label = (payload || "").trim().toLowerCase();

    return /^[a-z0-9_-]{1,32}$/.test(label) ? label : "direct";
}

export function registerStartHandlers(bot: Telegraf) {

    bot.start(async (ctx) => {
        flowStore.delete(ctx.from.id);

        // Запам'ятовуємо, звідки людина прийшла вперше (для статистики реклами).
        recordSource(ctx.from.id, parseSourceLabel(ctx.payload));

        const profile = getUser(ctx.from.id);

        if (!profile) {
            return ctx.reply(WELCOME_TEXT, mainMenu(ctx.from.id));
        }

        return ctx.reply(
            `👋 З поверненням, ${profile.name}!\n\nОберіть дію в меню 👇`,
            mainMenu(ctx.from.id)
        );
    });

    bot.help((ctx) => ctx.reply(HELP_TEXT, mainMenu(ctx.from.id)));

    bot.command("privacy", (ctx) => ctx.reply(PRIVACY_TEXT, mainMenu(ctx.from.id)));

    bot.hears(BTN.back, async (ctx) => {
        const state = flowStore.get(ctx.from.id);

        flowStore.delete(ctx.from.id);

        // З редагування анкети повертаємось до анкети, а не в головне меню.
        if (state && (state.flow === "editField" || state.flow === "editGames") && getUser(ctx.from.id)) {
            return showOwnProfile(ctx);
        }

        return ctx.reply("🏠 Головне меню", mainMenu(ctx.from.id));
    });
}
