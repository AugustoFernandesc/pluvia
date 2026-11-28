const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Tempo decorrido desde `iso` em texto curto: "há 5 min", "há 2 h", "há 3 d". */
export function haQuantoTempo(iso: string, agora: Date = new Date()): string {
    const decorrido = agora.getTime() - new Date(iso).getTime();
    if (Number.isNaN(decorrido)) return '—';
    if (decorrido < MINUTO) return 'agora há pouco';
    if (decorrido < HORA) return `há ${Math.floor(decorrido / MINUTO)} min`;
    if (decorrido < DIA) return `há ${Math.floor(decorrido / HORA)} h`;
    return `há ${Math.floor(decorrido / DIA)} d`;
}
