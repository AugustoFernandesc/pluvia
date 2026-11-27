import AssignmentIcon from '@mui/icons-material/AssignmentOutlined';
import ChatIcon from '@mui/icons-material/ForumOutlined';
import MapIcon from '@mui/icons-material/MapOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import { SvgIconComponent } from '@mui/icons-material';
import Typography from '@mui/material/Typography';
import { ComponentType } from 'react';

import { Pagina } from './componentes/Layout';
import { Perfil } from './perfis';
import VisaoGeral from './telas/visao_geral';

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

function emConstrucao(titulo: string): ComponentType {
    return function EmConstrucao() {
        return (
            <Pagina titulo={titulo}>
                <Typography color="text.secondary">Esta tela ainda está em construção.</Typography>
            </Pagina>
        );
    };
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
    { caminho: '/regioes/:regiaoId', rotulo: 'Região', tela: emConstrucao('Região') },
    {
        caminho: '/sinalizacoes',
        rotulo: 'Sinalizações',
        icone: WarningIcon,
        menu: true,
        tela: emConstrucao('Sinalizações'),
    },
    {
        caminho: '/acoes',
        rotulo: 'Ações',
        icone: AssignmentIcon,
        menu: true,
        tela: emConstrucao('Ações'),
    },
    { caminho: '/acoes/:acaoId', rotulo: 'Ação', tela: emConstrucao('Ação') },
    {
        caminho: '/assistente',
        rotulo: 'Assistente',
        icone: ChatIcon,
        menu: true,
        tela: emConstrucao('Assistente'),
    },
];
