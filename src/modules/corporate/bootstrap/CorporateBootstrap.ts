import { supabase } from '@/lib/supabase';
import { identityService } from '@/core/identity/IdentityService';

export interface CorporateModule {
  id: string;
  name: string;
  key: string;
  route: string;
  icon?: string;
  subModules: CorporateModule[];
}

export interface CorporateContextData {
  organization: {
    id: string;
    name: string;
  } | null;
  navigation: CorporateModule[];
  settings: Record<string, unknown>;
}

interface CorporateNavigationRow {
  id: string;
  name: string;
  module_key: string;
  route?: string;
  icon?: string;
  parent_id?: string;
  permission_required?: string;
}

export class CorporateBootstrap {
  private static instance: CorporateBootstrap;
  private contextData: CorporateContextData | null = null;

  private constructor() {}

  public static getInstance(): CorporateBootstrap {
    if (!CorporateBootstrap.instance) {
      CorporateBootstrap.instance = new CorporateBootstrap();
    }
    return CorporateBootstrap.instance;
  }

  public async loadContext(): Promise<CorporateContextData | null> {
    const identity = identityService.getIdentity();
    if (!identity || !identity.organization) {
      console.warn('Cannot load corporate context without active organization identity');
      return null;
    }

    try {
      // Load Navigation
      const { data: navData, error: navError } = await supabase
        .from('corporate_navigation')
        .select('*')
        .eq('organization_id', identity.organization.id)
        .eq('visible', true)
        .eq('enabled', true)
        .order('display_order', { ascending: true });

      if (navError) throw navError;

      // Filter and build tree based on permissions
      const navigation = this.buildNavigationTree(navData || []);

      this.contextData = {
        organization: identity.organization,
        navigation,
        settings: {} // To be implemented with corporate_settings table
      };

      return this.contextData;
    } catch (error) {
      console.error('Failed to load corporate bootstrap', error);
      return null;
    }
  }

  private buildNavigationTree(flatNav: CorporateNavigationRow[]): CorporateModule[] {
    const modules: CorporateModule[] = [];
    const lookup: Record<string, CorporateModule> = {};

    // First pass: create all nodes
    flatNav.forEach(item => {
      // Permission Check via IdentityService
      if (item.permission_required && !identityService.can(item.permission_required)) {
        return; // Skip if user doesn't have permission
      }

      lookup[item.id] = {
        id: item.id,
        name: item.name,
        key: item.module_key,
        route: item.route || '',
        icon: item.icon,
        subModules: []
      };
    });

    // Second pass: link parents and children
    flatNav.forEach(item => {
      if (!lookup[item.id]) return; // Was filtered out

      if (item.parent_id && lookup[item.parent_id]) {
        lookup[item.parent_id].subModules.push(lookup[item.id]);
      } else if (!item.parent_id) {
        modules.push(lookup[item.id]);
      }
    });

    return modules;
  }

  public getContext(): CorporateContextData | null {
    return this.contextData;
  }
}

export const corporateBootstrap = CorporateBootstrap.getInstance();
