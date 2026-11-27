import { describe, expect, it } from 'vitest';

import { mensagemErro } from './erros';

function erroHttp(status: number, data: unknown) {
    return { isAxiosError: true, response: { status, data } };
}

describe('mensagemErro', () => {
    it('usa o detail do problem+json', () => {
        const erro = erroHttp(503, {
            title: 'Serviço indisponível',
            detail: 'Não foi possível acessar uma dependência necessária para esta operação.',
        });
        expect(mensagemErro(erro)).toBe(
            'Não foi possível acessar uma dependência necessária para esta operação.'
        );
    });

    it('cai para o title quando não há detail', () => {
        expect(mensagemErro(erroHttp(504, { title: 'Tempo limite excedido' }))).toBe(
            'Tempo limite excedido'
        );
    });

    it('cai para o message, formato do plugin jwt do Kong', () => {
        expect(mensagemErro(erroHttp(401, { message: 'Unauthorized' }))).toBe('Unauthorized');
    });

    it('sem corpo aproveitável, informa o status', () => {
        expect(mensagemErro(erroHttp(500, '<html>erro</html>'))).toBe(
            'A solicitação falhou (HTTP 500).'
        );
    });

    it('sem resposta do servidor, avisa que o sistema não respondeu', () => {
        expect(mensagemErro({ isAxiosError: true, message: 'Network Error' })).toBe(
            'O sistema não respondeu. Confira se ele está no ar e tente de novo.'
        );
    });

    it('para um Error comum, usa a mensagem dele', () => {
        expect(mensagemErro(new Error('Sua sessão expirou.'))).toBe('Sua sessão expirou.');
    });
});
