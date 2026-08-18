import { useEffect, useState, useCallback } from 'react';
import { useRbac } from '@/hooks/useRbac';
import { corporateUsersService } from '@/services/corporateUsers.service';

export interface PermissoesRepresentantes {
  podeVer: boolean;
  podeEditar: boolean;
  podeAtivar: boolean;
  podeDesativar: boolean;
  podeEditarClientes: boolean;
  podeVerDesempenho: boolean;
  carregado: boolean;
}

const VAZIO: PermissoesRepresentantes = {
  podeVer: false,
  podeEditar: false,
  podeAtivar: false,
  podeDesativar: false,
  podeEditarClientes: false,
  podeVerDesempenho: false,
  carregado: false,
};

/**
 * Permissões do módulo Representantes derivadas da Central de Acessos
 * (get_my_admin_permissions). O OWNER possui tudo implicitamente; os
 * demais perfis (incluindo ADMIN) somente com delegação explícita.
 * A autorização definitiva é sempre reforçada no backend pelas RPCs.
 */
export function usePermissoesRepresentantes(): PermissoesRepresentantes {
  const { isOwner } = useRbac();
  const [perms, setPerms] = useState<string[]>([]);
  const [carregado, setCarregado] = useState(false);

  const carregar = useCallback(() => {
    let ativo = true;
    corporateUsersService
      .getMyPermissions()
      .then((p) => {
        if (ativo) {
          setPerms(p);
          setCarregado(true);
        }
      })
      .catch(() => {
        if (ativo) {
          setPerms([]);
          setCarregado(true);
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!carregado) return VAZIO;

  return {
    podeVer: isOwner || perms.includes('representantes.view'),
    podeEditar: isOwner || perms.includes('representantes.edit'),
    podeAtivar: isOwner || perms.includes('representantes.activate'),
    podeDesativar: isOwner || perms.includes('representantes.deactivate'),
    podeEditarClientes: isOwner || perms.includes('representantes.edit_clients'),
    podeVerDesempenho: isOwner || perms.includes('representantes.view_performance'),
    carregado: true,
  };
}