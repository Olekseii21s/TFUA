import { createTestBot, user, clear, sentTo, callbackAnswers, lastMessageTo, inlineButtons, TestUser } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import { markNotified } from "../src/database/notifications";

const { send, press, register } = createTestBot();

const fan = user(5001);        // дорослий, шукає CS2 будь-якого рангу
const picky = user(5002);      // дорослий, шукає CS2 лише 1–3 lvl
const kid = user(5003);        // неповнолітній, шукає CS2
const quiet = user(5004);      // дорослий, вимкнув сповіщення
const newbie = user(5010);     // новий дорослий гравець, CS2 5 lvl
const newbie2 = user(5011);

async function setFilters(u: TestUser, rank: string, adult = true) {
    await send(u, "⚙️ Фільтри пошуку");
    await send(u, "CS2");
    await send(u, "✅ Готово");
    await send(u, rank);
    await send(u, "🌍 Будь-яка");
    if (adult) await send(u, "🎂 Будь-який вік");
}

const isNotification = (t: string) => t.startsWith("🆕 З'явився новий гравець");

test("підготовка: анкети та фільтри", async () => {
    await register(fan, { age: 25 });
    await register(picky, { age: 30 });
    await register(kid, { age: 15 });
    await register(quiet, { age: 28 });

    await setFilters(fan, "Будь-який ранг");
    await setFilters(picky, "2 lvl");
    await setFilters(kid, "Будь-який ранг", false);
    await setFilters(quiet, "Будь-який ранг");

    await press(quiet, "notify_off");
    assert.ok(callbackAnswers().includes("🔕 Сповіщення вимкнено"));
});

test("новий гравець → сповіщення лише тим, кому він підходить", async () => {
    clear();
    await register(newbie, { name: "Newbie", age: 22, games: [["CS2", "5 lvl"]] });

    const toFan = sentTo(fan.id).filter(isNotification);
    assert.equal(toFan.length, 1);
    assert.match(toFan[0], /Newbie, 22[\s\S]*CS2 — 5 lvl/);
    assert.deepEqual(inlineButtons(lastMessageTo(fan.id)), ["notify_search", "notify_off"]);

    assert.equal(sentTo(picky.id).filter(isNotification).length, 0, "ранг поза діапазоном 1–4 lvl");
    assert.equal(sentTo(kid.id).filter(isNotification).length, 0, "неповнолітнім — лише про неповнолітніх");
    assert.equal(sentTo(quiet.id).filter(isNotification).length, 0, "вимкнув сповіщення");
    assert.equal(sentTo(newbie.id).filter(isNotification).length, 0, "собі не надсилаємо");
});

test("не частіше одного сповіщення на 3 години", async () => {
    clear();
    await register(newbie2, { age: 24, games: [["CS2", "6 lvl"]] });
    assert.equal(sentTo(fan.id).filter(isNotification).length, 0);

    // Минуло 3 години — знову можна.
    markNotified(fan.id, Date.now() - 3 * 60 * 60 * 1000 - 1000);
    clear();
    await register(user(5012), { age: 26, games: [["CS2", "4 lvl"]] });
    assert.equal(sentTo(fan.id).filter(isNotification).length, 1);
});

test("«Подивитися гравців» відкриває пошук", async () => {
    clear();
    await press(fan, "notify_search");
    assert.ok(sentTo(fan.id).some((t) => t.startsWith("🔎 Знайдено анкет:")));
    assert.match(lastMessageTo(fan.id)!.text!, /🔎 Анкета/);
});

test("повторне налаштування фільтрів знову вмикає сповіщення", async () => {
    clear();
    await setFilters(quiet, "Будь-який ранг");
    assert.ok(sentTo(quiet.id).some((t) => t.includes("Сповіщення про нових гравців знову увімкнено")));

    clear();
    await register(user(5013), { age: 27, games: [["CS2", "7 lvl"]] });
    assert.equal(sentTo(quiet.id).filter(isNotification).length, 1);
});

test("неповнолітній отримує сповіщення про неповнолітнього", async () => {
    clear();
    await register(user(5014), { age: 16, games: [["CS2", "3 lvl"]] });
    assert.equal(sentTo(kid.id).filter(isNotification).length, 1);
    assert.equal(sentTo(fan.id).filter(isNotification).length, 0);
});
