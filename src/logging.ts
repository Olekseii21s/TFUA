import { BOT_TOKEN } from "./config";

/**
 * Перетворює помилку на текст для логів, вирізаючи токен бота.
 * Помилки мережі Telegram містять адресу запиту виду .../bot<ТОКЕН>/sendMessage —
 * без цього токен потрапляв би в логи сервера.
 */
export function redact(value: unknown): string {
    let text: string;

    if (value instanceof Error) {
        const stack = value.stack ? value.stack.split("\n").slice(1).join("\n") : "";
        const code = (value as { code?: string }).code;

        text = `${value.name}: ${value.message}${code ? ` [${code}]` : ""}${stack ? `\n${stack}` : ""}`;
    } else if (typeof value === "string") {
        text = value;
    } else {
        try {
            text = JSON.stringify(value);
        } catch {
            text = String(value);
        }
    }

    return text.split(BOT_TOKEN).join("***");
}

/** Логує помилку без секретів. */
export function logError(message: string, err: unknown): void {
    console.error(message, redact(err));
}
