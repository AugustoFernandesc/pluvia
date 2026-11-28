import Chip from '@mui/material/Chip';

import { rotuloNivel } from '../rotulos';
import { cores } from '../tema';

/** Etiqueta do nível de atenção de uma região ou sinalização. */
export function ChipNivel({ nivel }: { nivel: string | null | undefined }) {
    const tom = cores.nivel(nivel);
    return (
        <Chip
            size="small"
            label={rotuloNivel(nivel)}
            sx={{
                bgcolor: tom.suave,
                color: tom.texto,
                border: `1px solid ${tom.forte}`,
                fontWeight: 700,
            }}
        />
    );
}
