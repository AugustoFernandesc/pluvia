import { api } from '../api';
export interface Fator {
    descricao: string;
    fonte: string;
}
export interface Sinalizacao {
    id: string;
    regiaoId: string;
    origem: string;
    nivelAtencao: string;
    motivo: string;
    fatores: Fator[];
    estado: string;
    emitidaEm: string;
    reconhecidaEm?: string;
    reconhecidaPor?: string;
}
export interface Acao {
    id: string;
    regiaoId: string;
    tipo: string;
    data: string;
    turno: string;
    estado: string;
    motivoRejeicao?: string;
    equipeId?: string;
    recursoId?: string;
}
export interface Lista<T> {
    itens: T[];
    total: number;
}
export interface Turno {
    turno: string;
    disponivel: boolean;
    motivo: string | null;
}
export interface Disponibilidade {
    equipes: { equipeId: string; equipeNome: string; turnos: Turno[] }[] | null;
    recursos: { recursoId: string; identificacao: string; turnos: Turno[] }[] | null;
    avisos: string[];
}
export const listar = <T,>(url: string, params: object) =>
    api.get<Lista<T>>(url, { params }).then((r) => r.data);
export const dataHora = (valor?: string) => (valor ? new Date(valor).toLocaleString('pt-BR') : '—');
export const dataCurta = (valor?: string) =>
    valor ? new Date(valor + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
export const rotulo = (v?: string) =>
    (
        ({
            MANHA: 'Manhã',
            TARDE: 'Tarde',
            NOITE: 'Noite',
            VISTORIA: 'Vistoria',
            LIMPEZA_DRENAGEM: 'Limpeza de drenagem',
            DESOBSTRUCAO: 'Desobstrução',
            INSPECAO_PONTO_CRITICO: 'Inspeção de ponto crítico',
            OBSERVADO: 'Observada',
            PREVISTO: 'Prevista',
            DRENAGEM: 'Drenagem',
            GERAL: 'Geral',
            CAMINHAO_HIDROJATO: 'Caminhão hidrojato',
            RETROESCAVADEIRA: 'Retroescavadeira',
            CAMINHONETE: 'Caminhonete',
            BOMBA_SUCCAO: 'Bomba de sucção',
            KIT_VISTORIA: 'Kit de vistoria',
        }) as Record<string, string>
    )[v ?? ''] ?? '—';
