import { describe, expect, it } from 'vitest';

import { rotuloEstado, rotuloNivel } from './rotulos';

describe('rotuloNivel', () => {
    it.each([
        ['NORMAL', 'Normal'],
        ['OBSERVACAO', 'Observação'],
        ['ATENCAO', 'Atenção'],
        ['ALTA_ATENCAO', 'Alta atenção'],
    ])('%s vira %s', (nivel, esperado) => {
        expect(rotuloNivel(nivel)).toBe(esperado);
    });

    it('nível desconhecido vira texto legível', () => {
        expect(rotuloNivel('RISCO_EXTREMO')).toBe('Risco extremo');
    });
});

describe('rotuloEstado', () => {
    it.each([
        ['ABERTA', 'Aberta'],
        ['RECONHECIDA', 'Reconhecida'],
        ['ENCERRADA', 'Encerrada'],
        ['PENDENTE', 'Pendente'],
        ['CONFIRMADA', 'Confirmada'],
        ['EM_EXECUCAO', 'Em execução'],
        ['CONCLUIDA', 'Concluída'],
        ['REJEITADA', 'Rejeitada'],
        ['CANCELADA', 'Cancelada'],
        ['COMPENSADA', 'Compensada'],
    ])('%s vira %s', (estado, esperado) => {
        expect(rotuloEstado(estado)).toBe(esperado);
    });

    it('estado desconhecido vira texto legível', () => {
        expect(rotuloEstado('EM_ANALISE')).toBe('Em analise');
    });

    it('valor ausente vira travessão', () => {
        expect(rotuloEstado(undefined)).toBe('—');
    });
});
