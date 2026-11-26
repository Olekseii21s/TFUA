import { createTestBot, user, clear, sentTo, blockedChats, TestUser } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import db from "../src/database/db";
import { getUser } from "../src/database/users";
import { findProfiles, loadSearchPrefs } from "../src/services/search";
import { parseSourceLabel } from "../src/handlers/start";

const { send, press, register } = createTestBot();

const admin = user(9999);
const DAY = 24 * 60 * 60 * 1000;

function setLastActive(u: TestUser, msAgo: number) {
    db.prepare("UPDATE users SET last_active_at = ? WHERE telegram_id = ?").run(Date.now() - msAgo, u.id);
}

async function setFilters(u: TestUser) {
    await send(u, "⚙️ Фільтри пошуку");
    await send(u, "CS2");
    await send(u, "✅ Готово");
    await send(u, "Будь-який ранг");
    await send(u, "🌍 Будь-яка");
    await send(u, "🎂 Будь-який вік");
}

// ---------- username ----------

test("username оновлюється, коли гравець змінив його в Telegram", async () => {
    const before = { ...user(6001, "old_nick") };
    await register(before, { age: 25 });
    assert.equal(getUser(6001)!.username, "old_nick");

    await send({ ...before, username: "new_nick" }, "👤 Моя анкета");
    assert.equal(getUser(6001)!.username, "new_nick");

    // Прибрав username зовсім — у матчі буде посилання на профіль, а не старий нік.
    await send({ ...before, username: undefined }, "👤 Моя анкета");
    assert.equal(getUser(6001)!.username, "");
});

// ---------- активність ----------

const seeker = user(6010);
const fresh = user(6011);
const weekOld = user(6012);
const ghost = user(6013);

test("пошук: неактивні понад 30 днів приховані, свіжі — першими", async () => {
    await register(seeker, { age: 25 });
    await register(fresh, { age: 26 });
    await register(weekOld, { age: 27 });
    await register(ghost, { age: 28 });
    await setFilters(seeker);

    setLastActive(fresh, 1000);
    setLastActive(weekOld, 10 * DAY);
    setLastActive(ghost, 40 * DAY);

    const prefs = loadSearchPrefs(seeker.id)!;

    for (let i = 0; i < 5; i++) {
        const ids = findProfiles(getUser(seeker.id)!, prefs);
        assert.ok(!ids.includes(ghost.id), "неактивний понад 30 днів не показується");
        assert.ok(ids.indexOf(fresh.id) < ids.indexOf(weekOld.id), "свіжий гравець вище");
    }
});

test("неактивний гравець повертається в пошук, щойно щось зробить у боті", async () => {
    await send(ghost, "👤 Моя анкета");

    const ids = findProfiles(getUser(seeker.id)!, loadSearchPrefs(seeker.id)!);
    assert.ok(ids.includes(ghost.id));
});

// ---------- заблокували бота ----------

test("хто заблокував бота — зникає з пошуку, а повернувшись — з'являється знову", async () => {
    // Розсилка дізнається від Telegram, що weekOld заблокував бота.
    blockedChats.add(weekOld.id);
    await press(admin, "admin_broadcast");
    await send(admin, "Оновлення бота!");
    blockedChats.delete(weekOld.id);

    assert.equal(getUser(weekOld.id)!.blocked_bot, 1);
    assert.ok(!findProfiles(getUser(seeker.id)!, loadSearchPrefs(seeker.id)!).includes(weekOld.id));

    await send(weekOld, "/start");
    assert.equal(getUser(weekOld.id)!.blocked_bot, 0);
    assert.ok(findProfiles(getUser(seeker.id)!, loadSearchPrefs(seeker.id)!).includes(weekOld.id));
});

test("неактивним не надсилаємо сповіщення про нових гравців", async () => {
    setLastActive(seeker, 40 * DAY);
    clear();
    await register(user(6014), { age: 24 });

    assert.ok(!sentTo(seeker.id).some((t) => t.startsWith("🆕")));
});

// ---------- джерела трафіку ----------

test("мітка з посилання: лише латиниця/цифри/_/-, інакше direct", () => {
    assert.equal(parseSourceLabel("TikTok"), "tiktok");
    assert.equal(parseSourceLabel("reels_nov-2"), "reels_nov-2");
    assert.equal(parseSourceLabel(""), "direct");
    assert.equal(parseSourceLabel(undefined), "direct");
    assert.equal(parseSourceLabel("привіт"), "direct");
    assert.equal(parseSourceLabel("x".repeat(40)), "direct");
});

test("джерело запам'ятовується за першим /start і видно в статистиці", async () => {
    const fromAd = user(6020);
    await send(fromAd, "/start tiktok");
    await send(fromAd, "/start reels");   // повторний старт не перезаписує перше джерело
    await send(user(6021), "/start tiktok");
    await send(user(6022), "/start");

    clear();
    await send(admin, "/stats");
    let stats = sentTo(admin.id).at(-1)!;
    assert.match(stats, /• tiktok: 2 → анкет 0/);
    assert.match(stats, /• direct: \d+ → анкет \d+/);
    assert.doesNotMatch(stats, /reels/);

    await register(fromAd, { age: 22 });
    clear();
    await send(admin, "/stats");
    stats = sentTo(admin.id).at(-1)!;
    assert.match(stats, /• tiktok: 2 → анкет 1/);
    assert.match(stats, /🆕 Нових: \d+ за добу/);
    assert.match(stats, /🚫 Заблокували бота: 0/);
});

test("звичайний користувач не бачить статистику", async () => {
    clear();
    await send(seeker, "/stats");
    assert.ok(!sentTo(seeker.id).some((t) => t.includes("📊 Статистика")));
});

// ---------- довідка ----------

test("/help і /privacy відповідають", async () => {
    clear();
    await send(seeker, "/help");
    assert.match(sentTo(seeker.id).at(-1)!, /Як користуватися Team Finder/);

    await send(seeker, "/privacy");
    const privacy = sentTo(seeker.id).at(-1)!;
    assert.match(privacy, /Приватність/);
    assert.match(privacy, /Видалити анкету/);
});
