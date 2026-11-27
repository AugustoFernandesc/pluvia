import LogoutIcon from '@mui/icons-material/Logout';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useSessao } from '../auth';
import { useBastidores } from '../bastidores';
import { Rota } from '../rotas';
import { cores, LARGURA_MENU } from '../tema';

const BRANCO_SUAVE = 'rgba(255, 255, 255, 0.72)';
const DESTAQUE = '#6fb4ff';
const ROTULO_SECAO = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'rgba(255, 255, 255, 0.5)',
};

const ROTULO_PERFIL = { GESTOR: 'Gestor', TECNICO: 'Técnico' } as const;

/** Casca do painel: menu lateral fixo e a tela atual à direita. */
export function Layout({ rotas }: { rotas: Rota[] }) {
    const sessao = useSessao();
    const bastidores = useBastidores();

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Drawer
                variant="permanent"
                sx={{
                    width: LARGURA_MENU,
                    '& .MuiDrawer-paper': {
                        width: LARGURA_MENU,
                        bgcolor: cores.marca,
                        color: '#fff',
                        border: 0,
                        borderRadius: 0,
                        px: 1.75,
                        py: 2.5,
                    },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, mb: 3.5 }}>
                    <Box
                        component="img"
                        src="/logo.png"
                        alt=""
                        sx={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain',
                            bgcolor: '#fff',
                            borderRadius: '9px',
                            p: 0.5,
                        }}
                    />
                    <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.08em' }}>
                            PLUVIA
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: BRANCO_SUAVE }}>
                            Monitoramento de chuvas
                        </Typography>
                    </Box>
                </Box>

                <Typography sx={{ ...ROTULO_SECAO, px: 1.25, pb: 1 }}>MENU</Typography>
                <List component="nav" aria-label="Telas do painel" disablePadding sx={{ flex: 1 }}>
                    {rotas
                        .filter((rota) => rota.menu)
                        .map(({ caminho, rotulo, icone: Icone }) => (
                            <ListItemButton
                                key={caminho}
                                component={NavLink}
                                to={caminho}
                                sx={{
                                    borderRadius: '8px',
                                    mb: 0.25,
                                    py: 0.75,
                                    color: BRANCO_SUAVE,
                                    '&.active': {
                                        bgcolor: 'rgba(255, 255, 255, 0.10)',
                                        color: '#fff',
                                        boxShadow: `inset 3px 0 0 ${DESTAQUE}`,
                                    },
                                    '&:hover': {
                                        bgcolor: 'rgba(255, 255, 255, 0.06)',
                                        color: '#fff',
                                    },
                                }}
                            >
                                {Icone && (
                                    <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}>
                                        <Icone fontSize="small" />
                                    </ListItemIcon>
                                )}
                                <ListItemText
                                    primary={rotulo}
                                    slotProps={{
                                        primary: { sx: { fontWeight: 600, fontSize: 14 } },
                                    }}
                                />
                            </ListItemButton>
                        ))}
                </List>

                <Box
                    component="label"
                    title="Mostra os detalhes técnicos de cada tela"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: 1.25,
                        mb: 1,
                        fontSize: 13,
                        color: BRANCO_SUAVE,
                        cursor: 'pointer',
                    }}
                >
                    Modo bastidores
                    <Switch
                        size="small"
                        color="secondary"
                        checked={bastidores.ligado}
                        onChange={bastidores.alternar}
                    />
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        px: 1.25,
                        pt: 1.5,
                        borderTop: '1px solid rgba(255, 255, 255, 0.10)',
                    }}
                >
                    <Avatar
                        sx={{
                            width: 34,
                            height: 34,
                            fontSize: 13,
                            fontWeight: 600,
                            bgcolor: '#1f4a7e',
                        }}
                    >
                        {(sessao.usuario ?? '').slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 600, fontSize: 13 }}>
                            {sessao.usuario}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: 12, color: BRANCO_SUAVE }}>
                            {sessao.perfis.map((perfil) => ROTULO_PERFIL[perfil]).join(' e ')}
                        </Typography>
                    </Box>
                    <Tooltip title="Sair">
                        <IconButton
                            aria-label="Sair"
                            onClick={sessao.sair}
                            sx={{ color: BRANCO_SUAVE, '&:hover': { color: '#fff' } }}
                        >
                            <LogoutIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Drawer>

            <Box component="main" sx={{ flex: 1, minWidth: 0, p: 4 }}>
                <Outlet />
            </Box>
        </Box>
    );
}

interface PaginaProps {
    titulo: string;
    /** Linha pequena acima do título, como "Lavras, MG". */
    sobretitulo?: string;
    /** Botões à direita do título. */
    acoes?: ReactNode;
    children: ReactNode;
}

/** Cabeçalho e área de conteúdo de uma tela. Toda tela começa por este componente. */
export function Pagina({ titulo, sobretitulo, acoes, children }: PaginaProps) {
    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1 }}>
                    {sobretitulo && (
                        <Typography variant="overline" color="text.secondary">
                            {sobretitulo}
                        </Typography>
                    )}
                    <Typography variant="h1">{titulo}</Typography>
                </Box>
                {acoes}
            </Box>
            {children}
        </Box>
    );
}
