import { createTestBot, user, clear, sentTo, callbackAnswers } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequest } from "../src/database/requests";
import { LIMITS } from "../src/services/rateLimit";

const { send, press, register } = createTestBot();

const adult = user(2001);
const kid = user(2002);
const adult2 = user(2003);
const spammer = user(2004);

test("підготовка анкет", async () => {
    await register(adult, { age: 30 });
    await register(kid, { age: 15 });
    await register(adult2, { age: 25 });
    await register(spammer, { age: 20 });
});

test("дорослий не може запросити неповнолітнього навіть підробленою кнопкою", async () => {
    clear();
    await press(adult, "like_2002");
    assert.ok(callbackAnswers().includes("❌ Ця анкета недоступна"));
    assert.equal(sentTo(kid.id).length, 0);
});

test("неповнолітній не може запросити дорослого", async () => {
    clear();
    await press(kid, "like_2001");
    assert.ok(callbackAnswers().includes("❌ Ця анкета недоступна"));
    assert.equal(sentTo(adult.id).length, 0);
});

test("старий запит між віковими групами не можна прийняти", async () => {
    createRequest(adult.id, kid.id);
    clear();
    await press(kid, "accept_2001");
    assert.ok(callbackAnswers().includes("❌ Анкета більше недоступна"));
    assert.ok(!sentTo(adult.id).some((t) => t.includes("МАТЧ")));
});

test("неповнолітній у пошуку бачить лише неповнолітніх", async () => {
    clear();
    await send(kid, "🔥 Шукати тімейтів");
    await send(kid, "CS2");
    await send(kid, "✅ Готово");
    await send(kid, "Будь-який ранг");
    await send(kid, "🌍 Будь-яка");
    assert.match(sentTo(kid.id).at(-1)!, /немає нових анкет[\s\S]*14–17/);
});

test("дорослі між собою запрошують нормально", async () => {
    clear();
    await press(adult, "like_2003");
    assert.ok(callbackAnswers().includes("✅ Запит відправлено!"));
    assert.equal(sentTo(adult2.id).length, 1);
});

test("повідомлення про проблему: не більше 3 на годину", async () => {
    clear();
    for (let i = 0; i < 3; i++) {
        await send(spammer, "🐞 Повідомити про проблему");
        await send(spammer, `bug ${i}`);
    }
    await send(spammer, "🐞 Повідомити про проблему");

    assert.equal(sentTo(-100777).length, 3);
    assert.match(sentTo(spammer.id).at(-1)!, /Спробуйте через годину/);
});

test("антифлуд ігнорує надто часті дії", async () => {
    const saved = LIMITS.flood.limit;
    LIMITS.flood.limit = 30;

    const flooder = user(2005);
    clear();
    for (let i = 0; i < 40; i++) await send(flooder, "spam");

    LIMITS.flood.limit = saved;
    assert.equal(sentTo(flooder.id).length, 30);
});
