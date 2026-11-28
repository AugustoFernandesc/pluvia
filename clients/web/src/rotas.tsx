import AssignmentIcon from '@mui/icons-material/AssignmentOutlined';
import ChatIcon from '@mui/icons-material/ForumOutlined';
import MapIcon from '@mui/icons-material/MapOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import { SvgIconComponent } from '@mui/icons-material';
import { ComponentType } from 'react';

import { Perfil } from './perfis';
import VisaoGeral from './telas/visao_geral';
import Regiao from './telas/regiao';
import Sinalizacoes from './telas/sinalizacoes';
import Acoes from './telas/acoes';
import DetalheAcao from './telas/detalhe_acao';
import Assistente from './telas/assistente';

export interface Rota {
    caminho: string;
    rotulo: string;
    tela: ComponentType;
    /** Com ícone e `menu: true`, a rota aparece no menu lateral. */
    icone?: SvgIconComponent;
    menu?: boolean;
    /** Sem `perfis`, a rota abre para qualquer usuário do painel. */
    perfis?: Perfil[];
}

export const ROTA_INICIAL = '/visao-geral';

/**
 * Lista única de onde saem o menu e as rotas. Para entregar uma tela, o dono troca
 * `emConstrucao(...)` pelo componente em `telas/<tela>/index.tsx`.
 */
export const ROTAS: Rota[] = [
    {
        caminho: '/visao-geral',
        rotulo: 'Visão geral',
        icone: MapIcon,
        menu: true,
        tela: VisaoGeral,
    },
    { caminho: '/regioes/:regiaoId', rotulo: 'Região', tela: Regiao },
    {
        caminho: '/sinalizacoes',
        rotulo: 'Sinalizações',
        icone: WarningIcon,
        menu: true,
        tela: Sinalizacoes,
    },
    {
        caminho: '/acoes',
        rotulo: 'Ações',
        icone: AssignmentIcon,
        menu: true,
        tela: Acoes,
    },
    { caminho: '/acoes/:acaoId', rotulo: 'Ação', tela: DetalheAcao },
    {
        caminho: '/assistente',
        rotulo: 'Assistente',
        icone: ChatIcon,
        menu: true,
        tela: Assistente,
    },
];
