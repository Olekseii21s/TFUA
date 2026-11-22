import { ADULT_AGE, MAX_AGE, MIN_AGE } from "../constants";

export const AGE_ERROR = `❌ Вік має бути цілим числом від ${MIN_AGE} до ${MAX_AGE}`;

export function parseAge(text: string): number | null {
    const age = Number(text.trim());

    if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
        return null;
    }

    return age;
}

/** Діапазон віку з тексту: «20-30», «20–30», «20 30». */
export function parseAgeRange(text: string): { min: number; max: number } | null {
    const match = text.trim().match(/^(\d{1,2})\s*[-–—\s]\s*(\d{1,2})$/);

    if (!match) return null;

    return { min: Number(match[1]), max: Number(match[2]) };
}

/** Повертає текст помилки або null, якщо текст коректний. */
export function validateText(text: string, maxLength: number, label: string): string | null {
    const value = text.trim();

    if (!value) {
        return `❌ ${label} не може бути порожнім`;
    }

    if (value.length > maxLength) {
        return `❌ ${label}: максимум ${maxLength} символів (зараз ${value.length})`;
    }

    return null;
}

export const isMinor = (age: number) => age < ADULT_AGE;

/**
 * Неповнолітні бачать лише неповнолітніх, дорослі — лише дорослих.
 * Повертає дозволений діапазон віку для пошуку.
 */
export function allowedAgeRange(age: number): { min: number; max: number } {
    return isMinor(age)
        ? { min: MIN_AGE, max: ADULT_AGE - 1 }
        : { min: ADULT_AGE, max: MAX_AGE };
}

/**
 * Чи можуть двоє користувачів взаємодіяти: обоє неповнолітні або обоє дорослі.
 * Перевіряється на сервері для кожного запрошення та прийняття — не лише в пошуку,
 * бо кнопку like_<id> можна надіслати в обхід пошуку модифікованим клієнтом.
 */
export function sameAgeGroup(a: { age: string | null }, b: { age: string | null }): boolean {
    const ageA = Number(a.age);
    const ageB = Number(b.age);

    if (!a.age || !b.age || !Number.isFinite(ageA) || !Number.isFinite(ageB)) return false;

    return isMinor(ageA) === isMinor(ageB);
}
