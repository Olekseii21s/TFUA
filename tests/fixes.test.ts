import { createTestBot, user, clear, sentTo, callbackAnswers, inlineButtons, lastMessageTo, TestUser } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import db from "../src/database/db";
import { getUser } from "../src/database/users";
import { banUser } from "../src/database/bans";
import { hideProfile } from "../src/database/hiddenProfiles";
import { findProfiles, loadSearchPrefs } from "../src/services/search";
import { BROADCAST_DELAY } from "../src/handlers/admin";
import { waitForBackgroundJobs } from "../src/services/background";

const { bot, send, press, register } = createTestBot();

const admin = user(9999);
const DAY = 24 * 60 * 60 * 1000;

const searcher = user(7001);
const blocker = user(7002);
const reported = user(7003);
const skipped = user(7004);

// ----- «сирі» апдейти: без очікування фонових задач (для перевірки, що бот не блокується) -----

let rawId = 100_000;

function rawText(u: TestUser, text: string) {
    return bot.handleUpdate({
        update_id: rawId++,
        message: {
            message_id: rawId,
            date: 0,
            chat: { id: u.id, type: "private", first_name: u.first_name },
            from: u,
            text,
            ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {})
        }
    } as any);
}

function rawPress(u: TestUser, data: string) {
    return bot.handleUpdate({
        update_id: rawId++,
        callback_query: {
            id: String(rawId),
            from: u,
            chat_instance: "test",
            data,
            message: { message_id: 5, date: 0, chat: { id: u.id, type: "private" }, text: "card" }
        }
    } as any);
}

/** Службове оновлення Telegram: користувач заблокував (kicked) або розблокував (member) бота. */
function chatMember(u: TestUser, status: "kicked" | "member") {
    const botUser = { id: 1, is_bot: true, first_name: "Bot" };

    return bot.handleUpdate({
        update_id: rawId++,
        my_chat_member: {
            chat: { id: u.id, type: "private", first_name: u.first_name },
            from: u,
            date: 0,
            old_chat_member: { user: botUser, status: status === "kicked" ? "member" : "kicked" },
            new_chat_member: status === "kicked" ? { user: botUser, status, until_date: 0 } : { user: botUser, status }
        }
    } as any);
}

const searchIds = (now?: number) => findProfiles(getUser(searcher.id)!, loadSearchPrefs(searcher.id)!, now);

test("підготовка анкет і фільтрів", async () => {
    await register(searcher, { age: 25 });
    await register(blocker, { age: 26 });
    await register(reported, { age: 27 });
    await register(skipped, { age: 28 });

    await send(searcher, "⚙️ Фільтри пошуку");
    await send(searcher, "CS2");
    await send(searcher, "✅ Готово");
    await send(searcher, "Будь-який ранг");
    await send(searcher, "🌍 Будь-яка");
    await send(searcher, "🎂 Будь-який вік");
});

// ---------- блокування бота ----------

test("блокування бота НЕ робить гравця «свіжим» і ховає його з пошуку", async () => {
    const tenDaysAgo = Date.now() - 10 * DAY;
    db.prepare("UPDATE users SET last_active_at = ? WHERE telegram_id = ?").run(tenDaysAgo, blocker.id);

    await chatMember(blocker, "kicked");

    const after = getUser(blocker.id)!;
    assert.equal(after.blocked_bot, 1);
    assert.equal(after.last_active_at, tenDaysAgo, "службове оновлення не рахується як активність");
    assert.ok(!searchIds().includes(blocker.id));
});

test("розблокування бота повертає гравця в пошук", async () => {
    await chatMember(blocker, "member");

    assert.equal(getUser(blocker.id)!.blocked_bot, 0);
    assert.ok(searchIds().includes(blocker.id));
});

// ---------- скарги ----------

test("на кого поскаржився — не повертається навіть через 3+ дні, а пропущений — повертається", async () => {
    await press(searcher, `report_user_${reported.id}`);
    await send(searcher, "фейкова анкета");
    hideProfile(searcher.id, skipped.id);

    const now = searchIds();
    assert.ok(!now.includes(reported.id));
    assert.ok(!now.includes(skipped.id));

    const inFourDays = searchIds(Date.now() + 4 * DAY);
    assert.ok(inFourDays.includes(skipped.id), "пропущений повертається через 3 дні");
    assert.ok(!inFourDays.includes(reported.id), "на кого поскаржились — ніколи");
});

// ---------- розсилка ----------

test("розсилка: спершу попередній перегляд, до підтвердження нікому нічого не йде", async () => {
    clear();
    await press(admin, "admin_broadcast");
    await send(admin, "Турнір у суботу!");

    const toAdmin = sentTo(admin.id);
    assert.ok(toAdmin.includes("📢 Оголошення\n\nТурнір у суботу!"), "адмін бачить, як виглядатиме розсилка");
    assert.match(toAdmin.at(-1)!, /Надіслати її \d+ користувачам\?/);
    assert.deepEqual(inlineButtons(lastMessageTo(admin.id)), ["broadcast_send", "broadcast_cancel"]);
    assert.equal(sentTo(searcher.id).length, 0);
});

test("скасування — розсилки немає, і «Надіслати» після цього нічого не робить", async () => {
    await press(admin, "broadcast_cancel");
    assert.equal(sentTo(admin.id).at(-1), "❌ Розсилку скасовано.");

    clear();
    await press(admin, "broadcast_send");
    assert.ok(callbackAnswers().includes("Немає чернетки розсилки"));
    assert.equal(sentTo(searcher.id).length, 0);
});

test("звичайний користувач не може запустити розсилку", async () => {
    clear();
    await press(searcher, "admin_broadcast");
    await press(searcher, "broadcast_send");
    assert.equal(sentTo(blocker.id).length, 0);
});

test("підтвердження: усім, крім забанених і тих, хто заблокував бота; повторне натискання не дублює", async () => {
    banUser(skipped.id);
    await chatMember(reported, "kicked");

    clear();
    await press(admin, "admin_broadcast");
    await send(admin, "Оновлення!");
    assert.match(sentTo(admin.id).at(-1)!, /Надіслати її 2 користувачам\?/);

    await press(admin, "broadcast_send");
    await press(admin, "broadcast_send");

    assert.deepEqual(sentTo(searcher.id), ["📢 Оголошення\n\nОновлення!"]);
    assert.deepEqual(sentTo(blocker.id), ["📢 Оголошення\n\nОновлення!"]);
    assert.equal(sentTo(reported.id).length, 0, "заблокував бота");
    assert.equal(sentTo(skipped.id).length, 0, "забанений");
    assert.ok(sentTo(admin.id).includes("✅ Розсилку завершено: доставлено 2 з 2."));
});

test("розсилка йде у фоні: поки вона триває, бот відповідає іншим", async () => {
    BROADCAST_DELAY.ms = 150;

    try {
        clear();
        await press(admin, "admin_broadcast");
        await send(admin, "Довга розсилка");

        // Натискаємо «Надіслати» і, не чекаючи кінця розсилки, пишемо боту від іншого гравця.
        await rawPress(admin, "broadcast_send");
        await rawText(searcher, "/help");

        assert.match(sentTo(searcher.id).at(-1)!, /Як користуватися Team Finder/, "бот відповів одразу");
        assert.equal(sentTo(blocker.id).length, 0, "розсилка ще в процесі");

        // Друга розсилка, поки перша не завершилась, — заборонена.
        await rawPress(admin, "admin_broadcast");
        assert.ok(callbackAnswers().includes("⏳ Попередня розсилка ще триває"));

        await waitForBackgroundJobs();
        assert.deepEqual(sentTo(blocker.id), ["📢 Оголошення\n\nДовга розсилка"]);
    } finally {
        BROADCAST_DELAY.ms = 0;
    }
});

test("задовгий текст розсилки не приймається", async () => {
    clear();
    await press(admin, "admin_broadcast");
    await send(admin, "x".repeat(4500));
    assert.match(sentTo(admin.id).at(-1)!, /Задовгий текст: 4500 символів, максимум 4000/);
    await press(admin, "broadcast_cancel");
});
