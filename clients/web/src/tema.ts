import { createTheme } from '@mui/material/styles';

interface Tom {
    /** Cor forte: borda, ícone, área do mapa. */
    forte: string;
    /** Fundo claro da etiqueta. */
    suave: string;
    /** Texto sobre o fundo claro. */
    texto: string;
}

const NEUTRO: Tom = { forte: '#8a9a9c', suave: '#e9eeee', texto: '#3f4d4f' };

const NIVEIS: Record<string, Tom> = {
    NORMAL: { forte: '#2e9e6a', suave: '#e3f4ea', texto: '#1f7a50' },
    OBSERVACAO: { forte: '#d9a514', suave: '#fbf3d4', texto: '#946e00' },
    ATENCAO: { forte: '#e5782a', suave: '#fde9cf', texto: '#b4561a' },
    ALTA_ATENCAO: { forte: '#d2423b', suave: '#fbdede', texto: '#b0302a' },
};

const POSITIVO = NIVEIS.NORMAL;
const ALERTA = NIVEIS.OBSERVACAO;
const NEGATIVO = NIVEIS.ALTA_ATENCAO;
const EM_CURSO: Tom = { forte: '#1c8bd2', suave: '#e1f0fb', texto: '#0f5688' };

const ESTADOS: Record<string, Tom> = {
    ABERTA: ALERTA,
    RECONHECIDA: POSITIVO,
    ENCERRADA: NEUTRO,
    PENDENTE: EM_CURSO,
    CONFIRMADA: POSITIVO,
    EM_EXECUCAO: EM_CURSO,
    CONCLUIDA: POSITIVO,
    REJEITADA: NEGATIVO,
    CANCELADA: NEUTRO,
    COMPENSANDO: ALERTA,
    COMPENSADA: NEGATIVO,
};

/** Cores do Pluvia. As telas usam estas, nunca um hex próprio. */
export const cores = {
    marca: '#0e2a4f',
    marcaClara: '#1f5fae',
    /** Fundo claro de ícone e de linha selecionada. */
    marcaSuave: '#eaf1fa',
    tinta: '#0f1b2d',
    suave: '#5b6b80',
    linha: '#e3e8ef',
    fundo: '#f3f5f8',
    superficie: '#ffffff',
    nivel: (nivel: string | null | undefined): Tom => NIVEIS[nivel ?? ''] ?? NEUTRO,
    estado: (estado: string | null | undefined): Tom => ESTADOS[estado ?? ''] ?? NEUTRO,
};

export const LARGURA_MENU = 248;

/** Fonte de largura fixa para números em destaque (contadores, colunas de quantidade). */
export const FONTE_NUMEROS = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

export const tema = createTheme({
    palette: {
        mode: 'light',
        primary: { main: cores.marca },
        secondary: { main: cores.marcaClara },
        background: { default: cores.fundo, paper: cores.superficie },
        text: { primary: cores.tinta, secondary: cores.suave },
        divider: cores.linha,
    },
    shape: { borderRadius: 12 },
    typography: {
        // A fonte vem empacotada (@fontsource): a CSP do Nginx não permite buscar fonte externa.
        fontFamily: '"IBM Plex Sans", "Segoe UI", Roboto, Arial, sans-serif',
        h1: { fontSize: '1.9rem', fontWeight: 700 },
        h2: { fontSize: '1.15rem', fontWeight: 700 },
        h3: { fontSize: '1rem', fontWeight: 700 },
        overline: { fontWeight: 700, letterSpacing: '0.08em' },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: { root: { border: `1px solid ${cores.linha}` } },
        },
        MuiButton: { defaultProps: { disableElevation: true } },
    },
});
