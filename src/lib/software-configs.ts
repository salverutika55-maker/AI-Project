import { 
  Database, Cloud, Globe, Cpu, Box, LayoutGrid 
} from "lucide-react";

export type AccountingSoftware = 'TALLY' | 'ZOHO' | 'ODOO' | 'SAP' | 'QUICKBOOKS' | 'XERO';

export interface SoftwareConfig {
  id: AccountingSoftware;
  label: string;
  icon: any;
  color: string;
  bg: string;
  border: string;
  syncEndpoint: string;
  softwareType?: string;
}

export const SOFTWARE_CONFIGS: Record<AccountingSoftware, SoftwareConfig> = {
  TALLY: {
    id: 'TALLY',
    label: 'Tally Prime',
    icon: Cpu,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    syncEndpoint: '/sync/placeholder',
    softwareType: 'Tally'
  },
  ZOHO: {
    id: 'ZOHO',
    label: 'Zoho Books',
    icon: Cloud,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    syncEndpoint: '/sync/data',
  },
  QUICKBOOKS: {
    id: 'QUICKBOOKS',
    label: 'QuickBooks',
    icon: Globe,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    syncEndpoint: '/sync/placeholder',
    softwareType: 'QuickBooks'
  },
  XERO: {
    id: 'XERO',
    label: 'Xero',
    icon: LayoutGrid,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    syncEndpoint: '/sync/placeholder',
    softwareType: 'Xero'
  },
  ODOO: {
    id: 'ODOO',
    label: 'Odoo',
    icon: Database,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    syncEndpoint: '/sync/placeholder',
    softwareType: 'Odoo'
  },
  SAP: {
    id: 'SAP',
    label: 'SAP S/4HANA',
    icon: Box,
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    syncEndpoint: '/sync/placeholder',
    softwareType: 'SAP'
  },
};
