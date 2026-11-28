import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import LocationCityIcon from '@mui/icons-material/LocationCityOutlined';
import NotificationImportantIcon from '@mui/icons-material/NotificationImportantOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ReactNode, useState } from 'react';

import { Bastidores } from '../../bastidores';
import { EstadoTela } from '../../componentes/EstadoTela';
import { Pagina } from '../../componentes/Layout';
import { cores, FONTE_NUMEROS } from '../../tema';
import { haQuantoTempo } from '../../tempo';
import { useConsulta } from '../../useConsulta';
import { obterPainel } from './api';
import { MapaRegioes } from './MapaRegioes';
import { PainelRegioes } from './PainelRegioes';

interface IndicadorProps {
    icone: ReactNode;
    valor: number | null;
    rotulo: string;
}

function Indicador({ icone, valor, rotulo }: IndicadorProps) {
    return (
        <Paper sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
            <Box
                sx={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    bgcolor: cores.marcaSuave,
                    color: cores.marcaClara,
                }}
            >
                {icone}
            </Box>
            <Box>
                <Typography
                    sx={{
                        fontFamily: FONTE_NUMEROS,
                        fontSize: 28,
                        fontWeight: 600,
                        lineHeight: 1.1,
                    }}
                >
                    {valor ?? '—'}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{rotulo}</Typography>
            </Box>
        </Paper>
    );
}

function Atualizado({ em }: { em: string }) {
    const verde = cores.nivel('NORMAL');
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 13,
                color: 'text.secondary',
            }}
        >
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: verde.forte,
                    boxShadow: `0 0 0 3px ${verde.suave}`,
                }}
            />
            Atualizado {haQuantoTempo(em)}
        </Box>
    );
}

export default function VisaoGeral() {
    const { dados: painel, carregando, erro, recarregar } = useConsulta(obterPainel, []);
    const [selecionada, setSelecionada] = useState<string | null>(null);
    const alternarSelecao = (regiaoId: string) =>
        setSelecionada((atual) => (atual === regiaoId ? null : regiaoId));

    return (
        <Pagina
            titulo="Visão geral"
            sobretitulo="Lavras, MG"
            acoes={painel && <Atualizado em={painel.atualizadoEm} />}
        >
            <EstadoTela carregando={carregando && !painel} erro={erro} aoTentarDeNovo={recarregar}>
                {painel && (
                    <>
                        {painel.avisos.map((aviso) => (
                            <Alert key={aviso} severity="info" sx={{ mb: 2 }}>
                                {aviso}
                            </Alert>
                        ))}
                        <Box
                            sx={{
                                display: 'grid',
                                gap: 2,
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            }}
                        >
                            <Indicador
                                icone={<LocationCityIcon />}
                                valor={painel.regioes.length}
                                rotulo="Regiões acompanhadas"
                            />
                            <Indicador
                                icone={<NotificationImportantIcon />}
                                valor={painel.contadores.sinalizacoesAbertas}
                                rotulo="Sinalizações abertas"
                            />
                            <Indicador
                                icone={<AssignmentTurnedInIcon />}
                                valor={painel.contadores.acoesEmAndamento}
                                rotulo="Ações em andamento"
                            />
                        </Box>
                        <Box
                            sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 2,
                                mt: 2.5,
                                minHeight: 560,
                            }}
                        >
                            <MapaRegioes
                                regioes={painel.regioes}
                                selecionada={selecionada}
                                aoSelecionar={alternarSelecao}
                            />
                            <PainelRegioes
                                painel={painel}
                                selecionada={selecionada}
                                aoSelecionar={alternarSelecao}
                            />
                        </Box>
                        <Bastidores>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                GET /web/v1/painel · o BFF Web juntou Risco (modelo de leitura),
                                Operações e Território · atualizado em{' '}
                                {new Date(painel.atualizadoEm).toLocaleString('pt-BR')}
                            </Typography>
                        </Bastidores>
                    </>
                )}
            </EstadoTela>
        </Pagina>
    );
}
