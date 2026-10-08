import { PainelDaRadio } from '@/components/radio/PainelDaRadio';

/**
 * Rádio Comércio (rota /dashboard/radio). F-162: o menu lateral não tem mais esta opção — a rádio é ligada em cada tela,
 * pelo cartão "Rádio Comércio" da página da tela, que abre este mesmo painel numa janela.
 */
export default function RadioComercio() {
  return <PainelDaRadio />;
}
