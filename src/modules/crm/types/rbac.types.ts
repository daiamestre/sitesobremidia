export type CrmRole =
  | 'ADMIN'
  | 'GERENTE'
  | 'FINANCEIRO'
  | 'DESIGNER'
  | 'REPRESENTANTE'
  | 'CLIENTE';

export type CrmPermission =
  | 'contract:view_all'
  | 'contract:view_own'
  | 'contract:create'
  | 'contract:edit'
  | 'contract:delete'
  | 'contract:confirm_payment'
  | 'contract:cancel'
  | 'contract:reopen'
  | 'contract:upload_art'
  | 'contract:approve_art'
  | 'contract:request_art_changes'
  | 'contract:publish'
  | 'users:manage'
  | 'permissions:manage'
  | 'reports:view'
  | 'financeiro:view'
  | 'financeiro:edit'
  | 'settings:manage';

export interface CrmUserContext {
  id: string;
  nome: string;
  email: string;
  role: CrmRole;
}
