import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';

import { rotuloNivel } from '../../rotulos';
import { cores, FONTE_NUMEROS } from '../../tema';
import type { Painel } from './api';
import { NIVEIS } from './niveis';

const CABECALHO = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: 'text.secondary',
};

interface PainelRegioesProps {
    painel: Painel;
    selecionada: string | null;
    aoSelecionar: (regiaoId: string) => void;
}

/** Distribuição das regiões por nível e a lista delas, da mais grave para a mais branda. */
export function PainelRegioes({ painel, selecionada, aoSelecionar }: PainelRegioesProps) {
    const regioes = [...painel.regioes].sort(
        (a, b) => NIVEIS.indexOf(b.nivelAtencao) - NIVEIS.indexOf(a.nivelAtencao)
    );

    return (
        <Paper sx={{ flex: '1 1 320px', minWidth: 0 }}>
            <Box sx={{ p: 2.5, borderBottom: `1px solid ${cores.linha}` }}>
                <Typography variant="h3" sx={{ mb: 1.75 }}>
                    Nível de atenção por região
                </Typography>
                <Box
                    sx={{
                        display: 'flex',
                        gap: '2px',
                        height: 10,
                        borderRadius: '5px',
                        overflow: 'hidden',
                    }}
                >
                    {NIVEIS.map((nivel) => (
                        <Box
                            key={nivel}
                            sx={{
                                flex: painel.contadores.porNivel[nivel] ?? 0,
                                bgcolor: cores.nivel(nivel).forte,
                            }}
                        />
                    ))}
                </Box>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 1,
                        mt: 1.75,
                    }}
                >
                    {NIVEIS.map((nivel) => (
                        <Box key={nivel}>
                            <Typography
                                sx={{
                                    fontFamily: FONTE_NUMEROS,
                                    fontSize: 20,
                                    fontWeight: 600,
                                    color: cores.nivel(nivel).texto,
                                }}
                            >
                                {painel.contadores.porNivel[nivel] ?? 0}
                            </Typography>
                            <Typography
                                sx={{ fontSize: 11, lineHeight: 1.2, color: 'text.secondary' }}
                            >
                                {rotuloNivel(nivel)}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    px: 2.5,
                    pt: 1.75,
                    pb: 0.75,
                }}
            >
                <Typography sx={CABECALHO}>REGIÃO</Typography>
                <Typography sx={CABECALHO}>SINALIZAÇÕES · AÇÕES</Typography>
            </Box>
            <Box sx={{ px: 1, pb: 1 }}>
                {regioes.map((regiao) => {
                    const tom = cores.nivel(regiao.nivelAtencao);
                    const destacada = regiao.regiaoId === selecionada;
                    return (
                        <Box
                            key={regiao.regiaoId}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '8px',
                                bgcolor: destacada ? cores.marcaSuave : 'transparent',
                                '&:hover': { bgcolor: destacada ? cores.marcaSuave : cores.fundo },
                            }}
                        >
                            <ButtonBase
                                onClick={() => aoSelecionar(regiao.regiaoId)}
                                aria-pressed={destacada}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    gap: 1.5,
                                    p: 1.5,
                                    borderRadius: '8px',
                                    justifyContent: 'flex-start',
                                    textAlign: 'left',
                                    font: 'inherit',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 4,
                                        alignSelf: 'stretch',
                                        borderRadius: '2px',
                                        bgcolor: tom.forte,
                                    }}
                                />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                                        {regiao.nome}
                                    </Typography>
                                    <Typography
                                        sx={{ fontSize: 12, fontWeight: 500, color: tom.texto }}
                                    >
                                        {rotuloNivel(regiao.nivelAtencao)}
                                    </Typography>
                                </Box>
                                <Typography
                                    sx={{
                                        fontFamily: FONTE_NUMEROS,
                                        fontSize: 13,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {regiao.sinalizacoesAbertas} · {regiao.acoesAbertas ?? '—'}
                                </Typography>
                            </ButtonBase>
                            {destacada ? (
                                <Button
                                    component={Link}
                                    to={`/regioes/${regiao.regiaoId}`}
                                    size="small"
                                    endIcon={<ChevronRightIcon />}
                                    sx={{ mr: 1, color: cores.marcaClara }}
                                >
                                    Abrir
                                </Button>
                            ) : (
                                <ChevronRightIcon
                                    fontSize="small"
                                    sx={{ mr: 1.5, color: 'text.disabled' }}
                                />
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}
