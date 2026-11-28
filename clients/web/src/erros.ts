interface ErroHttp {
    isAxiosError?: boolean;
    message?: string;
    response?: { status: number; data?: unknown };
}

function texto(valor: unknown): string | undefined {
    return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
}

/**
 * Converte um erro de chamada na frase que a tela mostra. O BFF responde em
 * problem+json (`detail`, `title`); o plugin jwt do Kong responde `{ message }`.
 */
export function mensagemErro(erro: unknown): string {
    const http = erro as ErroHttp;
    if (http?.isAxiosError) {
        if (!http.response) {
            return 'O sistema não respondeu. Confira se ele está no ar e tente de novo.';
        }
        const corpo = http.response.data as Record<string, unknown> | undefined;
        if (corpo && typeof corpo === 'object') {
            const mensagem = texto(corpo.detail) ?? texto(corpo.title) ?? texto(corpo.message);
            if (mensagem) return mensagem;
        }
        return `A solicitação falhou (HTTP ${http.response.status}).`;
    }
    return texto((erro as Error)?.message) ?? 'Não foi possível concluir a operação.';
}
