import { clienteService, empresaService, contratoService, campanhaService, financeiroService } from '../services';

export function useCrmServices() {
  return {
    clienteService,
    empresaService,
    contratoService,
    campanhaService,
    financeiroService,
  };
}
