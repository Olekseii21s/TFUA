// Тестове оточення. Імпортується ПЕРШИМ у кожному тесті — до коду бота.
process.env.BOT_TOKEN = "123456:test-token";
process.env.ADMIN_ID = "9999";
process.env.CHANNEL_ID = "-100777";
process.env.DB_PATH = process.env.DB_PATH || ":memory:";
