import "./env";

import test from "node:test";
import assert from "node:assert/strict";
import { sendBackup, setDocumentUploader, UPLOAD_RETRY } from "../src/services/backup";
import { redact } from "../src/logging";

const TOKEN = process.env.BOT_TOKEN!;

// Справжній спосіб відправки (через fetch), але сам fetch підмінюємо — у мережу нічого не йде.
setDocumentUploader();
UPLOAD_RETRY.delayMs = 1;

const realFetch = globalThis.fetch;

function mockFetch(responses: Array<() => Response | Promise<Response>>) {
    const requests: { url: string; body: FormData }[] = [];
    let i = 0;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
        requests.push({ url, body: init.body as FormData });
        return responses[Math.min(i++, responses.length - 1)]();
    }) as typeof fetch;

    return requests;
}

const socketHangUp = () => {
    throw Object.assign(new TypeError(`request to https://api.telegram.org/bot${TOKEN}/sendDocument failed, reason: socket hang up`), {
        code: "ECONNRESET"
    });
};

const ok = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });

test.afterEach(() => {
    globalThis.fetch = realFetch;
});

test("обрив з'єднання → бекап повторюється і доходить", async () => {
    const requests = mockFetch([socketHangUp, socketHangUp, ok]);

    await sendBackup(9999, "тест");

    assert.equal(requests.length, 3);
    assert.equal(requests[2].body.get("chat_id"), "9999");
    assert.match(String(requests[2].body.get("caption")), /Бекап бази \(тест\)/);

    const document = requests[2].body.get("document") as File;
    assert.match(document.name, /^tfua-.*\.db\.gz$/);
    assert.ok(document.size > 0);
});

test("після всіх невдалих спроб — помилка, без нескінченних повторів", async () => {
    const requests = mockFetch([socketHangUp]);

    await assert.rejects(sendBackup(9999, "тест"), /socket hang up/);
    assert.equal(requests.length, UPLOAD_RETRY.attempts);
});

test("помилку запиту (напр. чат не знайдено) не повторюємо", async () => {
    const requests = mockFetch([
        () => new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 })
    ]);

    await assert.rejects(sendBackup(9999, "тест"), /chat not found/);
    assert.equal(requests.length, 1);
});

test("429 від Telegram — чекаємо і пробуємо ще раз", async () => {
    const requests = mockFetch([
        () => new Response(JSON.stringify({ ok: false, description: "Too Many Requests", parameters: { retry_after: 0 } }), { status: 429 }),
        ok
    ]);

    await sendBackup(9999, "тест");
    assert.equal(requests.length, 2);
});

test("токен бота не потрапляє в логи помилок", () => {
    const error = Object.assign(new Error(`request to https://api.telegram.org/bot${TOKEN}/sendDocument failed`), {
        code: "ECONNRESET"
    });

    const logged = redact(error);

    assert.ok(!logged.includes(TOKEN));
    assert.match(logged, /bot\*\*\*\/sendDocument/);
    assert.match(logged, /ECONNRESET/);
    assert.ok(!redact(`текст з ${TOKEN}`).includes(TOKEN));
});
