/** Налаштування з оточення (.env локально або Environment на сервері). */

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        console.error(`❌ Не задано змінну ${name} у файлі .env або в налаштуваннях сервера`);
        process.exit(1);
    }

    return value;
}

export const BOT_TOKEN = requireEnv("BOT_TOKEN");

export const ADMIN_ID = Number(requireEnv("ADMIN_ID"));

if (!Number.isInteger(ADMIN_ID)) {
    console.error("❌ ADMIN_ID має бути числом");
    process.exit(1);
}

const channelIdRaw = requireEnv("CHANNEL_ID");

/** Числовий ID каналу (-100...) або його @username. */
export const CHANNEL_ID: number | string =
    /^-?\d+$/.test(channelIdRaw) ? Number(channelIdRaw) : channelIdRaw;
