const NIVEIS: Record<string, string> = {
    NORMAL: 'Normal',
    OBSERVACAO: 'Observação',
    ATENCAO: 'Atenção',
    ALTA_ATENCAO: 'Alta atenção',
};

/** Estados de sinalização, de ação preventiva e de SAGA. */
const ESTADOS: Record<string, string> = {
    ABERTA: 'Aberta',
    RECONHECIDA: 'Reconhecida',
    ENCERRADA: 'Encerrada',
    PENDENTE: 'Pendente',
    CONFIRMADA: 'Confirmada',
    EM_EXECUCAO: 'Em execução',
    CONCLUIDA: 'Concluída',
    REJEITADA: 'Rejeitada',
    CANCELADA: 'Cancelada',
    COMPENSANDO: 'Desfazendo',
    COMPENSADA: 'Compensada',
};

/** `EM_ANALISE` vira "Em analise": legível mesmo para um valor que o painel não conhece. */
function legivel(valor: string): string {
    const frase = valor.replace(/_/g, ' ').toLowerCase();
    return frase.charAt(0).toUpperCase() + frase.slice(1);
}

function rotulo(mapa: Record<string, string>, valor: string | null | undefined): string {
    if (!valor) return '—';
    return mapa[valor] ?? legivel(valor);
}

export function rotuloNivel(nivel: string | null | undefined): string {
    return rotulo(NIVEIS, nivel);
}

export function rotuloEstado(estado: string | null | undefined): string {
    return rotulo(ESTADOS, estado);
}
