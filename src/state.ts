import { loadSession, saveSession, deleteSession } from "./database/sessions";

/** Стан незавершеного діалогу (реєстрація, редагування, налаштування пошуку тощо). */
export interface FlowState {
    flow: "register" | "editGames" | "editField" | "search" | "bug" | "report" | "broadcast";
    step?: string;
    name?: string;
    games: string[];
    ranks: Record<string, string>;
    rankIndex: number;
    age?: number;
    gender?: string;
    field?: "name" | "age" | "gender" | "about";
    targetId?: number;
    /** Чернетка розсилки, яка чекає підтвердження адміна. */
    draft?: string;
}

/** Поточна видача пошуку: список ID анкет і яка зараз показана. */
export interface SearchSession {
    ids: number[];
    index: number;
}

export function newState(flow: FlowState["flow"], extra: Partial<FlowState> = {}): FlowState {
    return { flow, games: [], ranks: {}, rankIndex: 0, ...extra };
}

/**
 * Сховище станів користувачів: кеш у пам'яті + запис у базу.
 * Обробники можуть змінювати отриманий об'єкт напряму — після кожного
 * апдейту middleware викликає persist(), і зміни потрапляють у базу.
 * Тому після перезапуску бота користувач продовжує з того ж кроку.
 */
export class SessionStore<T extends object> {
    private cache = new Map<number, T>();

    constructor(private readonly kind: string) {}

    get(telegramId: number): T | undefined {
        if (this.cache.has(telegramId)) return this.cache.get(telegramId);

        const stored = loadSession<T>(telegramId, this.kind);

        if (stored) this.cache.set(telegramId, stored);

        return stored;
    }

    set(telegramId: number, value: T): void {
        this.cache.set(telegramId, value);
        saveSession(telegramId, this.kind, value);
    }

    delete(telegramId: number): void {
        this.cache.delete(telegramId);
        deleteSession(telegramId, this.kind);
    }

    /** Зберігає зміни, зроблені в об'єкті напряму. */
    persist(telegramId: number): void {
        const value = this.cache.get(telegramId);

        if (value) saveSession(telegramId, this.kind, value);

        // Кеш тримаємо лише на час обробки апдейту — далі джерело правди база.
        this.cache.delete(telegramId);
    }

    /** Скидає кеш (використовується в тестах, щоб імітувати перезапуск). */
    clearCache(): void {
        this.cache.clear();
    }
}

export const flowStore = new SessionStore<FlowState>("flow");
export const searchStore = new SessionStore<SearchSession>("search");
