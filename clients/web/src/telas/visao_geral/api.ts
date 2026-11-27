import { api } from '../../api';

export interface RegiaoDoPainel {
    regiaoId: string;
    nome: string;
    codigo: string | null;
    /** GeoJSON da região, quando o Território responde. */
    geometria: unknown | null;
    nivelAtencao: string;
    sinalizacoesAbertas: number;
    /** null quando Operações não respondeu. */
    acoesAbertas: number | null;
    atualizadoEm: string;
}

export interface Painel {
    regioes: RegiaoDoPainel[];
    contadores: {
        porNivel: Record<string, number>;
        sinalizacoesAbertas: number;
        /** null quando Operações não respondeu. */
        acoesEmAndamento: number | null;
    };
    atualizadoEm: string;
    /** Blocos que o BFF não conseguiu montar; a tela mostra como aviso. */
    avisos: string[];
}

export const obterPainel = () =>
    api.get<Painel>('/web/v1/painel', { params: { municipio: 'Lavras' } }).then((r) => r.data);
