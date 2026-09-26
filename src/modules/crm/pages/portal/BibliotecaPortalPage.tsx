import { BibliotecaMidias } from '@/components/biblioteca/BibliotecaMidias';

/** Biblioteca de Mídias no Portal do Anunciante: ver, buscar e usar nas playlists/telas do portal (somente leitura do acervo). */
export default function BibliotecaPortalPage() {
  return (
    <div className="p-4 sm:p-6">
      <BibliotecaMidias contexto="portal" />
    </div>
  );
}
