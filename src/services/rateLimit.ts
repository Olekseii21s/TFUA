/** Обмеження частоти дій (захист від спаму). Зберігається в пам'яті. */

export interface RateRule {
    limit: number;
    windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const LIMITS = {
    bugReport: { limit: 3, windowMs: HOUR },
    complaint: { limit: 5, windowMs: HOUR },
    invite: { limit: 40, windowMs: HOUR },
    // Загальний захист від флуду: не більше 30 дій за 10 секунд.
    flood: { limit: 30, windowMs: 10 * 1000 }
} satisfies Record<string, RateRule>;

const rateLog = new Map<string, number[]>();

/**
 * Перевіряє ліміт для ключа. Якщо record=true і ліміт не вичерпано — зараховує дію.
 * Повертає false, якщо ліміт вичерпано.
 */
export function allowAction(key: string, rule: RateRule, record = true): boolean {
    const now = Date.now();
    const recent = (rateLog.get(key) || []).filter((t) => now - t < rule.windowMs);

    if (recent.length >= rule.limit) {
        rateLog.set(key, recent);
        return false;
    }

    if (record) recent.push(now);

    rateLog.set(key, recent);

    return true;
}

// Прибираємо застарілі записи, щоб пам'ять не росла.
setInterval(() => {
    const now = Date.now();

    for (const [key, times] of rateLog) {
        if (!times.some((t) => now - t < HOUR)) rateLog.delete(key);
    }
}, 10 * 60 * 1000).unref();
