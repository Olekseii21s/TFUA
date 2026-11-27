import { Telegraf } from "telegraf";
import { flowStore } from "../state";
import { mainMenu } from "../ui/keyboards";
import { handleEditField, handleProfileWizard } from "./profile";
import { handleSearchSetup } from "./search";
import { handleBugReport, handleReport } from "./reports";
import { handleBroadcast } from "./admin";

/**
 * Звичайний текст — це відповідь на поточний крок діалогу.
 * Реєструється ОСТАННІМ, після всіх кнопок і команд.
 */
export function registerTextRouter(bot: Telegraf) {

    bot.on("text", async (ctx) => {
        const telegramId = ctx.from.id;
        const text = ctx.message.text.trim();
        const state = flowStore.get(telegramId);

        if (!state) {
            return ctx.reply("🤔 Не зрозумів. Скористайтеся кнопками меню 👇", mainMenu(telegramId));
        }

        switch (state.flow) {
            case "bug":
                return handleBugReport(ctx, text);

            case "report":
                return handleReport(ctx, state, text);

            case "broadcast":
                return handleBroadcast(ctx, state, ctx.message.text);

            case "register":
            case "editGames":
                return handleProfileWizard(ctx, state, text);

            case "editField":
                return handleEditField(ctx, state, text);

            case "search":
                return handleSearchSetup(ctx, state, text);
        }
    });
}
