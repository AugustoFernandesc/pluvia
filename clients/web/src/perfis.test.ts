import { describe, expect, it } from 'vitest';

import { perfisDoToken, rotasPermitidas } from './perfis';

function token(payload: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const base64 = btoa(String.fromCharCode(...bytes));
    const parte = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `cabecalho.${parte}.assinatura`;
}

describe('perfisDoToken', () => {
    it('devolve só os perfis do painel, na ordem do token', () => {
        const acesso = token({
            realm_access: { roles: ['offline_access', 'TECNICO', 'AGENTE', 'GESTOR'] },
        });
        expect(perfisDoToken(acesso)).toEqual(['TECNICO', 'GESTOR']);
    });

    it('lê payload com caracteres acentuados', () => {
        const acesso = token({ name: 'João Conceição', realm_access: { roles: ['GESTOR'] } });
        expect(perfisDoToken(acesso)).toEqual(['GESTOR']);
    });

    it.each([
        ['token sem papéis de realm', token({ sub: 'abc' })],
        ['token só com AGENTE', token({ realm_access: { roles: ['AGENTE'] } })],
        ['token malformado', 'nao-e-um-jwt'],
        ['token vazio', ''],
        ['token ausente', undefined],
    ])('devolve lista vazia para %s', (_caso, acesso) => {
        expect(perfisDoToken(acesso)).toEqual([]);
    });
});

describe('rotasPermitidas', () => {
    const rotas = [
        { caminho: '/visao-geral' },
        { caminho: '/acoes/nova', perfis: ['GESTOR' as const] },
        { caminho: '/sinalizacoes/reconhecer', perfis: ['TECNICO' as const] },
        { caminho: '/ambos', perfis: ['GESTOR' as const, 'TECNICO' as const] },
    ];

    it('mantém as rotas sem restrição e as do perfil do usuário', () => {
        expect(rotasPermitidas(rotas, ['TECNICO']).map((rota) => rota.caminho)).toEqual([
            '/visao-geral',
            '/sinalizacoes/reconhecer',
            '/ambos',
        ]);
    });

    it('sem perfil nenhum, sobram só as rotas sem restrição', () => {
        expect(rotasPermitidas(rotas, []).map((rota) => rota.caminho)).toEqual(['/visao-geral']);
    });
});
