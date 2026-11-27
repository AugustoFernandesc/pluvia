import { DependencyList, useCallback, useEffect, useState } from 'react';

import { mensagemErro } from './erros';

export interface Consulta<T> {
    dados: T | undefined;
    carregando: boolean;
    /** Frase pronta para a tela, ou undefined. */
    erro: string | undefined;
    recarregar: () => void;
}

/**
 * Busca os dados de uma tela e refaz a busca quando `deps` muda ou `recarregar` é chamado.
 * A resposta de uma busca antiga, ou de uma tela que já saiu, é descartada.
 *
 *     const { dados, carregando, erro, recarregar } = useConsulta(obterPainel, []);
 */
export function useConsulta<T>(consulta: () => Promise<T>, deps: DependencyList): Consulta<T> {
    const [dados, setDados] = useState<T>();
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string>();
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        let ativa = true;
        setCarregando(true);
        setErro(undefined);
        consulta()
            .then((resultado) => {
                if (ativa) setDados(resultado);
            })
            .catch((falha) => {
                if (ativa) setErro(mensagemErro(falha));
            })
            .finally(() => {
                if (ativa) setCarregando(false);
            });
        return () => {
            ativa = false;
        };
        // `consulta` muda a cada render; quem decide quando refazer é `deps`.
    }, [...deps, versao]);

    const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);
    return { dados, carregando, erro, recarregar };
}
