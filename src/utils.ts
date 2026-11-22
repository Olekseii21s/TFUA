export function chunk<T>(items: T[], size: number): T[][] {
    const rows: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
        rows.push(items.slice(i, i + size));
    }

    return rows;
}

/** Екранування для повідомлень з parse_mode: "HTML". */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function shuffle<T>(items: T[]): T[] {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}
