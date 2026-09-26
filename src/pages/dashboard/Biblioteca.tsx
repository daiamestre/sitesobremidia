import { BibliotecaMidias } from '@/components/biblioteca/BibliotecaMidias';

/** Biblioteca de Mídias no painel: Owner/ADM administram; Gestor usa em playlists e telas próprias. */
export default function Biblioteca() {
  return <BibliotecaMidias contexto="painel" />;
}
