import { createContext, ReactNode, useContext, useState } from 'react';

const CHAVE = 'pluvia.bastidores';

interface EstadoBastidores {
    ligado: boolean;
    alternar: () => void;
}

const Contexto = createContext<EstadoBastidores>({ ligado: false, alternar: () => undefined });

export function BastidoresProvider({ children }: { children: ReactNode }) {
    const [ligado, setLigado] = useState(() => localStorage.getItem(CHAVE) === '1');
    const alternar = () =>
        setLigado((atual) => {
            localStorage.setItem(CHAVE, atual ? '0' : '1');
            return !atual;
        });
    return <Contexto.Provider value={{ ligado, alternar }}>{children}</Contexto.Provider>;
}

export function useBastidores(): EstadoBastidores {
    return useContext(Contexto);
}

/**
 * Mostra os filhos só com o modo bastidores ligado. Todo detalhe técnico fica aqui dentro:
 * UUID, caminho de API, nome de enum, origem da resposta, latência e nome de mensagem.
 */
export function Bastidores({ children }: { children: ReactNode }) {
    return useBastidores().ligado ? <>{children}</> : null;
}
