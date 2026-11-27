import 'leaflet/dist/leaflet.css';

import Box from '@mui/material/Box';
import type { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { GeoJSON, MapContainer, TileLayer, Tooltip, useMap, ZoomControl } from 'react-leaflet';

import { rotuloNivel } from '../../rotulos';
import { cores } from '../../tema';
import type { RegiaoDoPainel } from './api';
import { NIVEIS } from './niveis';

/** Centro de Lavras, usado quando nenhuma região tem contorno. */
const CENTRO_DE_LAVRAS: L.LatLngTuple = [-21.245, -45.0];
const FUNDO_CLARO =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';

const limitesDe = (regioes: RegiaoDoPainel[]) =>
    L.featureGroup(
        regioes.map((regiao) => L.geoJSON(regiao.geometria as GeoJsonObject))
    ).getBounds();

/** Aproxima o mapa da região selecionada e volta ao enquadramento geral quando não há seleção. */
function Enquadramento({ limites }: { limites: L.LatLngBounds | undefined }) {
    const mapa = useMap();
    useEffect(() => {
        if (limites) mapa.flyToBounds(limites, { padding: [60, 60], duration: 0.6 });
    }, [mapa, limites]);
    return null;
}

interface MapaRegioesProps {
    regioes: RegiaoDoPainel[];
    selecionada: string | null;
    aoSelecionar: (regiaoId: string) => void;
}

/** Mapa da cidade com as regiões coloridas pelo nível de atenção. */
export function MapaRegioes({ regioes, selecionada, aoSelecionar }: MapaRegioesProps) {
    const comContorno = useMemo(() => regioes.filter((regiao) => regiao.geometria), [regioes]);
    const limites = useMemo(() => {
        const alvo = comContorno.filter(
            (regiao) => !selecionada || regiao.regiaoId === selecionada
        );
        return alvo.length ? limitesDe(alvo) : undefined;
    }, [comContorno, selecionada]);

    return (
        <Box
            sx={{
                position: 'relative',
                flex: '3 1 560px',
                minHeight: 480,
                borderRadius: 1,
                overflow: 'hidden',
                border: `1px solid ${cores.linha}`,
            }}
        >
            <MapContainer
                center={CENTRO_DE_LAVRAS}
                zoom={13}
                maxZoom={16}
                zoomControl={false}
                scrollWheelZoom={false}
                style={{ position: 'absolute', inset: 0, font: 'inherit' }}
            >
                <TileLayer url={FUNDO_CLARO} attribution="Tiles &copy; Esri" />
                <ZoomControl position="bottomright" />
                <Enquadramento limites={limites} />
                {comContorno.map((regiao) => {
                    const cor = cores.nivel(regiao.nivelAtencao).forte;
                    const destacada = regiao.regiaoId === selecionada;
                    return (
                        <GeoJSON
                            key={regiao.regiaoId}
                            data={regiao.geometria as GeoJsonObject}
                            style={{
                                color: cor,
                                fillColor: cor,
                                weight: destacada ? 3 : 1.5,
                                fillOpacity: destacada ? 0.5 : selecionada ? 0.15 : 0.3,
                            }}
                            eventHandlers={{ click: () => aoSelecionar(regiao.regiaoId) }}
                        >
                            <Tooltip sticky>
                                <strong>{regiao.nome}</strong> · {rotuloNivel(regiao.nivelAtencao)}
                            </Tooltip>
                        </GeoJSON>
                    );
                })}
            </MapContainer>
            <Box
                sx={{
                    position: 'absolute',
                    top: 14,
                    left: 14,
                    zIndex: 500,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.75,
                    px: 1.5,
                    py: 1.25,
                    fontSize: 12,
                    bgcolor: 'rgba(255, 255, 255, 0.95)',
                    border: `1px solid ${cores.linha}`,
                    borderRadius: '10px',
                    boxShadow: '0 4px 16px rgba(15, 27, 45, 0.08)',
                }}
            >
                {NIVEIS.map((nivel) => (
                    <Box key={nivel} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '3px',
                                bgcolor: cores.nivel(nivel).forte,
                            }}
                        />
                        {rotuloNivel(nivel)}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
