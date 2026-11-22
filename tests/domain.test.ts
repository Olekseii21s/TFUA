import "./env";

import test from "node:test";
import assert from "node:assert/strict";
import { parseAge, parseAgeRange, sameAgeGroup, validateText, allowedAgeRange } from "../src/domain/validation";
import { rankMatches, rankRangeLabel, rankWindow } from "../src/domain/ranks";

test("parseAge приймає лише цілі числа 14–99", () => {
    assert.equal(parseAge("20"), 20);
    assert.equal(parseAge(" 14 "), 14);
    assert.equal(parseAge("13"), null);
    assert.equal(parseAge("100"), null);
    assert.equal(parseAge("12.5"), null);
    assert.equal(parseAge("abc"), null);
});

test("parseAgeRange розуміє різні роздільники", () => {
    assert.deepEqual(parseAgeRange("20-30"), { min: 20, max: 30 });
    assert.deepEqual(parseAgeRange("18–24"), { min: 18, max: 24 });
    assert.deepEqual(parseAgeRange("20 30"), { min: 20, max: 30 });
    assert.equal(parseAgeRange("двадцять"), null);
});

test("validateText перевіряє порожній і задовгий текст", () => {
    assert.equal(validateText("Alice", 32, "Ім'я"), null);
    assert.match(validateText("   ", 32, "Ім'я")!, /порожнім/);
    assert.match(validateText("x".repeat(40), 32, "Ім'я")!, /максимум 32/);
});

test("вікові групи: неповнолітні окремо від дорослих", () => {
    assert.deepEqual(allowedAgeRange(15), { min: 14, max: 17 });
    assert.deepEqual(allowedAgeRange(25), { min: 18, max: 99 });
    assert.equal(sameAgeGroup({ age: "15" }, { age: "17" }), true);
    assert.equal(sameAgeGroup({ age: "20" }, { age: "40" }), true);
    assert.equal(sameAgeGroup({ age: "17" }, { age: "18" }), false);
    assert.equal(sameAgeGroup({ age: "abc" }, { age: "20" }), false);
    assert.equal(sameAgeGroup({ age: null }, { age: "20" }), false);
});

test("ранг шукається діапазоном навколо обраного", () => {
    assert.equal(rankWindow("CS2"), 2);
    assert.equal(rankWindow("Valorant"), 3);
    assert.equal(rankRangeLabel("CS2", "5 lvl"), "3 lvl – 7 lvl");
    assert.equal(rankMatches("CS2", "5 lvl", "7 lvl"), true);
    assert.equal(rankMatches("CS2", "5 lvl", "8 lvl"), false);
    assert.equal(rankMatches("CS2", "5 lvl", "без рангу"), false);
    // Для ігор без списку рангів фільтр не застосовується.
    assert.equal(rankMatches("Rust", "щось", "інше"), true);
});
