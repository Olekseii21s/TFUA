import { createTestBot, user, clear, sentTo, callbackAnswers, lastMessageTo, inlineButtons, keyboardButtons, blockedChats } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import { Telegram } from "telegraf";

const { send, press, register } = createTestBot();

const alice = user(1001, "alice");
const bob = user(1002, "bob");
const cid = user(1003);
const dan = user(1005, "dan");
const admin = user(9999);

test("новий користувач бачить меню лише зі створенням анкети", async () => {
    clear();
    await send(alice, "/start");

    const msg = lastMessageTo(alice.id);
    assert.match(msg!.text!, /Вітаємо в Team Finder/);
    assert.deepEqual(keyboardButtons(msg), ["📝 Створити анкету", "🐞 Повідомити про проблему"]);
});

test("реєстрація: валідація, вибір/зняття гри, кнопка Назад", async () => {
    clear();
    await send(alice, "📝 Створити анкету");
    await send(alice, "x".repeat(40));
    assert.match(sentTo(alice.id).at(-1)!, /максимум 32/);

    await send(alice, "Alice");
    await send(alice, "Valorant");
    await send(alice, "✅ Valorant");
    assert.equal(sentTo(alice.id).at(-1), "Нічого не обрано");

    await send(alice, "🔙 Назад");
    assert.equal(sentTo(alice.id).at(-1), "🏠 Головне меню");

    clear();
    await register(alice, { name: "Alice", games: [["CS2", "5 lvl"], ["Rust", "2000 годин"]], age: 20, gender: "👩 Жінка" });
    assert.match(sentTo(alice.id).at(-1)!, /Анкету створено/);
    assert.match(sentTo(alice.id).at(-1)!, /Rust — 2000 годин/);
});

test("реєстрація не приймає некоректний вік і стать", async () => {
    clear();
    await send(dan, "📝 Створити анкету");
    await send(dan, "Dan");
    await send(dan, "Dota 2");
    await send(dan, "✅ Готово");
    await send(dan, "Ancient 3");
    await send(dan, "abc");
    assert.match(sentTo(dan.id).at(-1)!, /Вік має бути/);
    await send(dan, "30");
    await send(dan, "робот");
    assert.match(sentTo(dan.id).at(-1)!, /Оберіть стать кнопкою/);
    await send(dan, "👨 Чоловік");
    await send(dan, "Граю вечорами");
    assert.match(sentTo(dan.id).at(-1)!, /Анкету створено/);
});

test("пошук: діапазон рангів, без повторів після запиту", async () => {
    await register(bob, { name: "Bob", games: [["CS2", "6 lvl"]], age: 22 });
    await register(cid, { name: "Cid", games: [["CS2", "10 lvl"]], age: 25 });

    clear();
    await send(alice, "🔥 Шукати тімейтів");
    await send(alice, "CS2");
    await send(alice, "✅ Готово");
    await send(alice, "5 lvl");
    await send(alice, "🌍 Будь-яка");
    await send(alice, "18-30");

    const card = lastMessageTo(alice.id);
    assert.match(card!.text!, /Bob/);
    assert.ok(!sentTo(alice.id).some((t) => t.includes("Cid")), "Cid (10 lvl) не в діапазоні 3–7");
    assert.deepEqual(inlineButtons(card), ["like_1002", "skip", "report_user_1002"]);

    // Bob «заблокував бота» — запрошення все одно створюється і бот не падає.
    blockedChats.add(bob.id);
    clear();
    await press(alice, "like_1002");
    blockedChats.delete(bob.id);
    assert.ok(callbackAnswers().includes("✅ Запит відправлено!"));
    assert.match(sentTo(alice.id).at(-1)!, /Це всі анкети на зараз/);

    clear();
    await press(alice, "like_1002");
    assert.ok(callbackAnswers().includes("⚠️ Ви вже відправили запит цьому гравцю"));

    clear();
    await send(alice, "🔥 Шукати тімейтів");
    assert.match(sentTo(alice.id).at(-1)!, /немає нових анкет/);
});

test("запити: лічильник у меню, прийняття без показу username до матчу", async () => {
    clear();
    await send(bob, "/start");
    assert.ok(keyboardButtons(lastMessageTo(bob.id)).includes("📨 Запити (1)"));

    clear();
    await send(bob, "📨 Запити (1)");
    const card = lastMessageTo(bob.id);
    assert.match(card!.text!, /Вас запрошують у гру/);
    assert.ok(!card!.text!.includes("@alice"), "username не видно до прийняття");
    assert.deepEqual(inlineButtons(card), ["accept_1001", "reject_1001", "report_user_1001"]);

    clear();
    await press(bob, "accept_1001");
    assert.match(sentTo(alice.id).at(-1)!, /МАТЧ[\s\S]*@bob/);
    assert.ok(sentTo(bob.id).some((t) => /МАТЧ[\s\S]*@alice/.test(t)));

    clear();
    await press(bob, "accept_1001");
    assert.ok(callbackAnswers().includes("Цей запит уже оброблено"));
    assert.equal(sentTo(alice.id).length, 0, "повторне прийняття не шле матч удруге");

    clear();
    await send(bob, "🤝 Мої тімейти");
    assert.match(sentTo(bob.id).at(-1)!, /Alice<\/b> — @alice/);
});

test("пропущена анкета не показується в наступному пошуку", async () => {
    clear();
    await send(cid, "⚙️ Фільтри пошуку");
    await send(cid, "CS2");
    await send(cid, "✅ Готово");
    await send(cid, "Будь-який ранг");
    await send(cid, "🌍 Будь-яка");
    await send(cid, "🎂 Будь-який вік");
    assert.ok(sentTo(cid.id).includes("🔎 Знайдено анкет: 2"));

    const first = inlineButtons(lastMessageTo(cid.id))[0];
    clear();
    await press(cid, "skip");
    const second = inlineButtons(lastMessageTo(cid.id))[0];
    assert.notEqual(first, second);

    clear();
    await send(cid, "🔥 Шукати тімейтів");
    assert.ok(sentTo(cid.id).includes("🔎 Знайдено анкет: 1"));
    assert.equal(inlineButtons(lastMessageTo(cid.id))[0], second);
});

test("скарга надсилається один раз і не «залипає»", async () => {
    clear();
    await press(cid, "report_user_1001");
    await send(cid, "спам");
    await send(cid, "привіт");

    const toChannel = sentTo(-100777);
    assert.equal(toChannel.length, 1);
    assert.match(toChannel[0], /Нова скарга[\s\S]*спам/);
    assert.match(sentTo(cid.id).at(-1)!, /Не зрозумів/);

    clear();
    await press(cid, "report_user_1001");
    assert.ok(callbackAnswers().includes("⚠️ Ви вже скаржилися на цю анкету"));
});

test("редагування: валідація, Назад повертає до анкети", async () => {
    clear();
    await send(dan, "👤 Моя анкета");
    await send(dan, "🎂 Вік");
    await send(dan, "abc");
    await send(dan, "31");
    assert.match(sentTo(dan.id).at(-1)!, /Збережено![\s\S]*Вік: 31/);

    await send(dan, "📄 Про себе");
    await send(dan, "🔙 Назад");
    assert.match(sentTo(dan.id).at(-1)!, /Ваша анкета/);
});

test("кнопки старих версій бота досі працюють", async () => {
    clear();
    await send(dan, "✏️ Редагувати анкету");
    assert.match(sentTo(dan.id).at(-1)!, /Ваша анкета/);
    await send(dan, "📨 Запити");
    assert.equal(sentTo(dan.id).at(-1), "📭 Нових запитів немає.");
});

test("бан блокує і кнопки меню, і inline-кнопки", async () => {
    clear();
    await send(admin, "/ban 1003");
    await send(cid, "👤 Моя анкета");
    await press(cid, "like_1001");

    assert.equal(sentTo(cid.id).at(-1), "⛔ Ваш акаунт заблоковано адміністрацією.");
    assert.ok(callbackAnswers().includes("⛔ Ваш акаунт заблоковано адміністрацією."));
});

test("помилка в обробнику не зупиняє бота", async () => {
    const api = Telegram.prototype.callApi;

    // Ламаємо відповідь на /admin, щоб обробник кинув помилку.
    Telegram.prototype.callApi = async function (this: Telegram, method: any, payload: any) {
        if (method === "sendMessage" && String(payload.text).startsWith("🛠")) throw new Error("boom");
        return (api as any).call(this, method, payload);
    } as any;

    const errorLog = console.error;
    console.error = () => undefined;

    clear();
    await send(admin, "/admin");

    console.error = errorLog;
    Telegram.prototype.callApi = api;

    assert.match(sentTo(admin.id).at(-1)!, /Сталася помилка/);
});
