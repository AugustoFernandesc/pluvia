import Chip from '@mui/material/Chip';

import { rotuloEstado } from '../rotulos';
import { cores } from '../tema';

/** Etiqueta do estado de uma sinalização, de uma ação preventiva ou de uma SAGA. */
export function ChipEstado({ estado }: { estado: string | null | undefined }) {
    const tom = cores.estado(estado);
    return (
        <Chip
            size="small"
            label={rotuloEstado(estado)}
            sx={{
                bgcolor: tom.suave,
                color: tom.texto,
                border: `1px solid ${tom.forte}`,
                fontWeight: 700,
            }}
        />
    );
}
