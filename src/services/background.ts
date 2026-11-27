import { logError } from "../logging";

/**
 * Фонові задачі (розсилка, сповіщення).
 *
 * Telegraf бере наступну порцію оновлень лише тоді, коли оброблено всю попередню
 * (`await Promise.all(updates.map(handleUpdate))`). Тому довгу роботу не можна виконувати
 * прямо в обробнику — інакше бот «замовкає» для всіх на час розсилки.
 */
const pending = new Set<Promise<void>>();

/** Запускає задачу у фоні. Помилки логуються (без токена) і не валять бота. */
export function runInBackground(label: string, job: () => Promise<unknown>): Promise<void> {
    const run = (async () => {
        try {
            await job();
        } catch (err) {
            logError(`❌ Фонова задача «${label}» завершилася з помилкою:`, err);
        }
    })();

    pending.add(run);
    void run.finally(() => pending.delete(run));

    return run;
}

/** Чекає завершення всіх фонових задач (для тестів і коректної зупинки). */
export async function waitForBackgroundJobs(): Promise<void> {
    while (pending.size) {
        await Promise.all([...pending]);
    }
}
