import { createTestBot, user, clear, calls, sentTo, callbackAnswers, inlineButtons, lastMessageTo, keyboardButtons, TestUser } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import db from "../src/database/db";
import { getUser } from "../src/database/users";
import { getPendingRequest, getRequests } from "../src/database/requests";
import { findProfiles, loadSearchPrefs } from "../src/services/search";
import { expireOldRequests, EXPIRY_NOTICE_DELAY } from "../src/services/requestExpiry";

const { bot, send, press, register } = createTestBot();

EXPIRY_NOTICE_DELAY.ms = 0;

const DAY = 24 * 60 * 60 * 1000;
const admin = user(9999);

const alice = user(8001, "alice");
const bob = user(8002, "bob");
const carl = user(8003, "carl");
const dina = user(8004, "dina");
const eve = user(8005, "eve");
const stranger = user(8006);

async function setFilters(u: TestUser) {
    await send(u, "⚙️ Фільтри пошуку");
    await send(u, "CS2");
    await send(u, "✅ Готово");
    await send(u, "Будь-який ранг");
    await send(u, "🌍 Будь-яка");
    await send(u, "🎂 Будь-який вік");
}

const searchIds = (u: TestUser, now?: number) => findProfiles(getUser(u.id)!, loadSearchPrefs(u.id)!, now);

/** Робить запрошення «старим»: ніби його надіслали N днів тому. */
function ageRequest(from: TestUser, to: TestUser, days: number) {
    db.prepare(`
        UPDATE requests SET created_at = ? WHERE from_user = ? AND to_user = ? AND status = 'pending'
    `).run(Date.now() - days * DAY, from.id, to.id);
}

test("підготовка анкет", async () => {
    await register(alice, { name: "Alice", age: 24 });
    await register(bob, { name: "Bob", age: 25 });
    await register(carl, { name: "Carl", age: 26 });
    await register(dina, { name: "Dina", age: 27 });
    await register(eve, { name: "Eve", age: 28 });
    await register(stranger, { name: "Stranger", age: 29 });
    await setFilters(alice);
    await setFilters(dina);
});

// ---------- згорання ----------

test("запрошення без відповіді понад 7 днів згорає, відправник отримує повідомлення", async () => {
    await press(alice, `like_${bob.id}`);
    await press(alice, `like_${carl.id}`);
    ageRequest(alice, bob, 8);
    ageRequest(alice, carl, 6);

    clear();
    const expired = await expireOldRequests(bot.telegram);

    assert.equal(expired, 1, "згорів лише 8-денний запит");
    assert.match(sentTo(alice.id).at(-1)!, /⌛ Ваше запрошення для «Bob» згоріло — гравець не відповів за 7 днів/);
    assert.equal(getPendingRequest(alice.id, bob.id), undefined);
    assert.ok(getPendingRequest(alice.id, carl.id), "6-денний ще чекає");

    // Стара кнопка «👀 Переглянути» у Bob більше не працює, лічильник запитів порожній.
    clear();
    await press(bob, `request_from_${alice.id}`);
    assert.ok(callbackAnswers().includes("Цей запит уже оброблено"));
    assert.equal(getRequests(bob.id).length, 0);
});

test("після згорання гравці знову зустрічаються в пошуку, але не раніше ніж через 3 дні", async () => {
    assert.ok(!searchIds(alice).includes(bob.id));
    assert.ok(searchIds(alice, Date.now() + 4 * DAY).includes(bob.id));
    assert.ok(!searchIds(alice).includes(carl.id), "запит до Carl ще чекає відповіді");
});

// ---------- надіслані запрошення ----------

test("«📨 Запити» показує надіслані запрошення", async () => {
    clear();
    await send(alice, "📨 Запити");

    const messages = sentTo(alice.id);
    assert.ok(messages.includes("📤 Ваші запрошення без відповіді: 1"));
    assert.equal(messages.at(-1), "📭 Нових вхідних запитів немає.");

    clear();
    await press(alice, "sent_requests");

    const list = lastMessageTo(alice.id)!;
    assert.match(list.text!, /1\. 👤 Carl — надіслано 6 дн\. тому, згорить менш ніж за добу/);
    assert.equal(inlineButtons(list).length, 1);
    assert.match(inlineButtons(list)[0], /^cancel_req_\d+$/);
});

test("скасувати можна лише своє запрошення, і лише один раз", async () => {
    await send(alice, "📨 Запити");
    clear();
    await press(alice, "sent_requests");
    const cancelButton = inlineButtons(lastMessageTo(alice.id))[0];

    // Чуже запрошення скасувати не можна.
    clear();
    await press(stranger, cancelButton);
    assert.ok(callbackAnswers().includes("Цей запит уже оброблено"));
    assert.ok(getPendingRequest(alice.id, carl.id));

    clear();
    await press(alice, cancelButton);
    assert.ok(callbackAnswers().includes("❌ Запрошення скасовано"));
    assert.equal(getPendingRequest(alice.id, carl.id), undefined);
    assert.equal(getRequests(carl.id).length, 0, "у Carl запит зник");
    assert.ok(
        calls.some((c) => c.method === "editMessageText" && c.text === "📤 Надісланих запрошень без відповіді немає."),
        "список оновився на місці"
    );

    clear();
    await press(alice, cancelButton);
    assert.ok(callbackAnswers().includes("Цей запит уже оброблено"));

    // Скасований — теж не одразу знову в пошуку.
    assert.ok(!searchIds(alice).includes(carl.id));
    assert.ok(searchIds(alice, Date.now() + 4 * DAY).includes(carl.id));
});

// ---------- пауза ----------

test("пауза: анкета зникає з пошуку, запросити не можна, сповіщень немає", async () => {
    clear();
    await send(dina, "👤 Моя анкета");
    assert.ok(keyboardButtons(lastMessageTo(dina.id)).includes("⏸ Приховати анкету"));

    await send(dina, "⏸ Приховати анкету");
    assert.match(sentTo(dina.id).at(-1)!, /Анкету приховано/);
    assert.ok(keyboardButtons(lastMessageTo(dina.id)).includes("▶️ Показати анкету"));
    assert.equal(getUser(dina.id)!.paused, 1);

    assert.ok(!searchIds(alice).includes(dina.id), "на паузі — не в пошуку");

    clear();
    await press(eve, `like_${dina.id}`);
    assert.ok(callbackAnswers().includes("❌ Гравець зараз не шукає тімейтів"));
    assert.equal(getPendingRequest(eve.id, dina.id), undefined);
    assert.equal(sentTo(dina.id).length, 0);

    clear();
    await register(user(8007), { name: "Newbie", age: 23 });
    assert.ok(!sentTo(dina.id).some((t) => t.startsWith("🆕")), "сповіщень про нових гравців немає");

    clear();
    await send(dina, "👤 Моя анкета");
    assert.match(sentTo(dina.id).at(-1)!, /⏸ Анкета прихована — у пошуку її не видно/);
});

test("на паузі пошук нагадує про приховану анкету; «Показати» повертає в пошук", async () => {
    clear();
    await send(dina, "🔥 Шукати тімейтів");
    assert.ok(sentTo(dina.id).some((t) => t.startsWith("⏸ Ваша анкета прихована")));

    await send(dina, "▶️ Показати анкету");
    assert.equal(getUser(dina.id)!.paused, 0);
    assert.ok(searchIds(alice).includes(dina.id));
});

// ---------- прибрати тімейта ----------

test("прибрати тімейта: з підтвердженням і лише зі свого списку", async () => {
    await press(eve, `like_${alice.id}`);
    await press(alice, `accept_${eve.id}`);

    clear();
    await send(alice, "🤝 Мої тімейти");
    const listMessage = lastMessageTo(alice.id)!;
    assert.match(listMessage.text!, /Eve/);
    assert.ok(inlineButtons(listMessage).includes(`tm_rm_${eve.id}`));

    clear();
    await press(alice, `tm_rm_${eve.id}`);
    assert.match(sentTo(alice.id).at(-1)!, /Прибрати «Eve» зі свого списку тімейтів\?/);
    assert.deepEqual(inlineButtons(lastMessageTo(alice.id)), [`tm_rm_yes_${eve.id}`, "tm_rm_no"]);

    // «Ні» — нічого не змінюється.
    await press(alice, "tm_rm_no");
    clear();
    await send(alice, "🤝 Мої тімейти");
    assert.match(sentTo(alice.id).at(-1)!, /Eve/);

    clear();
    await press(alice, `tm_rm_yes_${eve.id}`);
    assert.match(sentTo(alice.id).at(-1)!, /«Eve» прибрано зі списку тімейтів/);
    assert.equal(sentTo(eve.id).length, 0, "Eve нічого не отримує");

    clear();
    await send(alice, "🤝 Мої тімейти");
    assert.ok(!sentTo(alice.id).at(-1)!.includes("Eve"));

    clear();
    await send(eve, "🤝 Мої тімейти");
    assert.match(sentTo(eve.id).at(-1)!, /Alice/, "у Eve Alice лишається");

    assert.ok(!searchIds(alice).includes(eve.id), "у пошуку вони не зустрічаються");

    clear();
    await press(alice, `tm_rm_yes_${eve.id}`);
    assert.ok(callbackAnswers().includes("Цього гравця вже немає у вашому списку"));
});

test("статистика адміна показує, скільки анкет на паузі", async () => {
    await send(carl, "⏸ Приховати анкету");

    clear();
    await send(admin, "/stats");
    assert.match(sentTo(admin.id).at(-1)!, /⏸ Приховали анкету: 1/);
});
