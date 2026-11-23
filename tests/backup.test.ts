import { createTestBot, user, clear, calls, sentTo } from "./harness";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import Database from "better-sqlite3";
import { createBackup } from "../src/services/backup";

const { send, press, register } = createTestBot();

const admin = user(9999);
const player = user(4001);

function documentsTo(chatId: number) {
    return calls.filter((c) => c.method === "sendDocument" && c.chat_id === chatId);
}

test("бекап — це робоча копія бази з усіма анкетами", async () => {
    await register(player, { name: "Backup Player", age: 22 });

    const { file, size } = await createBackup();

    assert.ok(file.endsWith(".db.gz"));
    assert.ok(size > 0);

    // Розпаковуємо і відкриваємо як звичайну базу — так само, як при відновленні.
    const restored = path.join(path.dirname(file), "restored.db");
    fs.writeFileSync(restored, zlib.gunzipSync(fs.readFileSync(file)));

    const copy = new Database(restored, { readonly: true });
    const row = copy.prepare("SELECT name FROM users WHERE telegram_id = ?").get(player.id) as { name: string };
    copy.close();
    fs.unlinkSync(restored);

    assert.equal(row.name, "Backup Player");
});

test("на диску зберігаються лише 7 останніх бекапів", async () => {
    for (let i = 0; i < 9; i++) await createBackup();

    const files = fs.readdirSync(process.env.BACKUP_DIR!).filter((f) => f.endsWith(".db.gz"));
    assert.equal(files.length, 7);
});

test("/backup надсилає файл адміністратору", async () => {
    clear();
    await send(admin, "/backup");

    const docs = documentsTo(admin.id);
    assert.equal(docs.length, 1);
    assert.match(docs[0].caption, /Бекап бази \(ручний\)[\s\S]*Анкет: 1/);
    assert.match(docs[0].document.filename, /^tfua-.*\.db\.gz$/);
});

test("кнопка бекапу в адмін-панелі теж працює", async () => {
    clear();
    await press(admin, "admin_backup");
    assert.equal(documentsTo(admin.id).length, 1);
});

test("звичайний користувач не може отримати бекап", async () => {
    clear();
    await send(player, "/backup");
    await press(player, "admin_backup");

    assert.equal(calls.filter((c) => c.method === "sendDocument").length, 0);
    assert.ok(!sentTo(player.id).some((t) => t.includes("Бекап")));
});
