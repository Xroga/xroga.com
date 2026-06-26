export type IntegrationStatus = 'connected' | 'not_connected';

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  description?: string;
  oauth?: boolean;
}

export {
  INTEGRATION_CATALOG as INTEGRATIONS,
  INTEGRATION_CATALOG_CATEGORIES as INTEGRATION_CATEGORIES,
} from './integrations-catalog';
