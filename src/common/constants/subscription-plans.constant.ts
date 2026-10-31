export type SubscriptionPlanCode = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface PlanFeatureConfig {
  code: SubscriptionPlanCode;
  name: string;
  priceVnd: number;
  aiChatboxMonthlyLimit: number;
  docAnalysisMonthlyLimit: number;
  storageGbLimit: number;
  maxOrganizations: number;
  expertConsultingSessionsPerMonth?: number;
  features: {
    digitalProfile: boolean;
    legalSearch: boolean;
    basicAudit: boolean;
    deadlineAlerts: boolean;
    basicReport: boolean;
    advancedAudit: boolean;
    aiRecommendation: boolean;
    autoTaskChecklist: boolean;
    kanbanTaskBoard: boolean;
    citLedgerTaxAnalysis: boolean;
    b4DeepRiskDetection: boolean;
    expertConsulting: boolean;
    prioritySupport: boolean;
    multiDocAnalysis: boolean;
  };
}

export const SUBSCRIPTION_PLANS_BACKEND: Record<SubscriptionPlanCode, PlanFeatureConfig> = {
  STARTER: {
    code: 'STARTER',
    name: 'Gói Starter',
    priceVnd: 699000,
    aiChatboxMonthlyLimit: 100,
    docAnalysisMonthlyLimit: 20,
    storageGbLimit: 2,
    maxOrganizations: 1,
    features: {
      digitalProfile: true,
      legalSearch: true,
      basicAudit: true,
      deadlineAlerts: true,
      basicReport: true,
      advancedAudit: false,
      aiRecommendation: false,
      autoTaskChecklist: false,
      kanbanTaskBoard: false,
      citLedgerTaxAnalysis: false,
      b4DeepRiskDetection: false,
      expertConsulting: false,
      prioritySupport: false,
      multiDocAnalysis: false,
    },
  },
  PROFESSIONAL: {
    code: 'PROFESSIONAL',
    name: 'Gói Professional',
    priceVnd: 1599000,
    aiChatboxMonthlyLimit: 500,
    docAnalysisMonthlyLimit: 100,
    storageGbLimit: 10,
    maxOrganizations: 1,
    features: {
      digitalProfile: true,
      legalSearch: true,
      basicAudit: true,
      deadlineAlerts: true,
      basicReport: true,
      advancedAudit: true,
      aiRecommendation: true,
      autoTaskChecklist: true,
      kanbanTaskBoard: true,
      citLedgerTaxAnalysis: true,
      b4DeepRiskDetection: true,
      expertConsulting: false,
      prioritySupport: false,
      multiDocAnalysis: false,
    },
  },
  ENTERPRISE: {
    code: 'ENTERPRISE',
    name: 'Gói Enterprise',
    priceVnd: 4299000,
    aiChatboxMonthlyLimit: 1000,
    docAnalysisMonthlyLimit: 200,
    storageGbLimit: 30,
    maxOrganizations: 1,
    expertConsultingSessionsPerMonth: 2,
    features: {
      digitalProfile: true,
      legalSearch: true,
      basicAudit: true,
      deadlineAlerts: true,
      basicReport: true,
      advancedAudit: true,
      aiRecommendation: true,
      autoTaskChecklist: true,
      kanbanTaskBoard: true,
      citLedgerTaxAnalysis: true,
      b4DeepRiskDetection: true,
      expertConsulting: true,
      prioritySupport: true,
      multiDocAnalysis: true,
    },
  },
};
