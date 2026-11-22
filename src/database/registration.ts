/** Стан незавершеного діалогу з користувачем (реєстрація, редагування, налаштування пошуку тощо). */
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
}

export const registrationState = new Map<number, FlowState>();
