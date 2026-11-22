import { createTestBot, user, clear, sentTo, inlineButtons, lastMessageTo } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import { flowStore, searchStore } from "../src/state";

/** Імітує перезапуск: новий екземпляр бота, порожній кеш станів, та сама база. */
function restart() {
    flowStore.clearCache();
    searchStore.clearCache();
    return createTestBot();
}

const eve = user(3001);
const max = user(3002);

test("незавершена реєстрація продовжується після перезапуску", async () => {
    let bot = createTestBot();
    await bot.send(eve, "📝 Створити анкету");
    await bot.send(eve, "Eve");
    await bot.send(eve, "CS2");

    bot = restart();

    clear();
    await bot.send(eve, "✅ Готово");
    assert.match(sentTo(eve.id).at(-1)!, /Ваш ранг у CS2/);

    await bot.send(eve, "4 lvl");
    await bot.send(eve, "21");
    await bot.send(eve, "👩 Жінка");
    await bot.send(eve, "⏭ Пропустити");
    assert.match(sentTo(eve.id).at(-1)!, /Анкету створено[\s\S]*Eve[\s\S]*CS2 — 4 lvl/);
});

test("видача пошуку продовжується після перезапуску", async () => {
    let bot = createTestBot();
    await bot.register(max, { age: 23, games: [["CS2", "5 lvl"]] });
    await bot.register(user(3003), { age: 24, games: [["CS2", "5 lvl"]] });

    clear();
    await bot.send(max, "🔥 Шукати тімейтів");
    await bot.send(max, "CS2");
    await bot.send(max, "✅ Готово");
    await bot.send(max, "Будь-який ранг");
    await bot.send(max, "🌍 Будь-яка");
    await bot.send(max, "🎂 Будь-який вік");
    assert.ok(sentTo(max.id).includes("🔎 Знайдено анкет: 2"));

    bot = restart();

    clear();
    await bot.press(max, "skip");
    const card = lastMessageTo(max.id);
    assert.match(card!.text!, /Анкета \(залишилось 1\)/);
    assert.equal(inlineButtons(card).length, 3);
});
