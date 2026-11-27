import { describe, expect, it } from 'vitest';

import { haQuantoTempo } from './tempo';

const AGORA = new Date('2026-11-27T12:00:00Z');

describe('haQuantoTempo', () => {
    it('diz "agora há pouco" para menos de um minuto', () => {
        expect(haQuantoTempo('2026-11-27T11:59:30Z', AGORA)).toBe('agora há pouco');
    });

    it('conta em minutos até uma hora', () => {
        expect(haQuantoTempo('2026-11-27T11:55:00Z', AGORA)).toBe('há 5 min');
        expect(haQuantoTempo('2026-11-27T11:00:01Z', AGORA)).toBe('há 59 min');
    });

    it('conta em horas até um dia', () => {
        expect(haQuantoTempo('2026-11-27T11:00:00Z', AGORA)).toBe('há 1 h');
        expect(haQuantoTempo('2026-11-26T12:00:01Z', AGORA)).toBe('há 23 h');
    });

    it('conta em dias a partir de um dia', () => {
        expect(haQuantoTempo('2026-11-25T12:00:00Z', AGORA)).toBe('há 2 d');
    });

    it('trata data no futuro ou inválida como "agora há pouco" e "—"', () => {
        expect(haQuantoTempo('2026-11-27T12:05:00Z', AGORA)).toBe('agora há pouco');
        expect(haQuantoTempo('não é data', AGORA)).toBe('—');
    });
});
