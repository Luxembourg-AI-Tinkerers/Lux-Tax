export interface FreelanceBusinessProfileDto {
  id: string;
  workspaceId: string;
  ownerId: string; // spouse user id
  ownerEmail?: string | null;
  businessName: string;
  activityType: string;
  taxIdOrVat?: string | null;
  accountingType: 'CASH_BASIS' | 'ACCRUAL'; // Comptabilité recettes-dépenses vs Bilan
  createdAt: string;
  updatedAt: string;
}

export interface UpdateFreelanceProfileDto {
  businessName: string;
  activityType: string;
  taxIdOrVat?: string | null;
  accountingType?: 'CASH_BASIS' | 'ACCRUAL';
}

export interface FreelanceMetricsDto {
  workspaceId: string;
  ownerId?: string | null;
  totalGrossRevenue: number;
  totalBusinessExpenses: number;
  netBusinessProfit: number;
  totalDocumentsCount: number;
  invoicesCount: number;
  expensesCount: number;
  contractsCount: number;
  vatReturnsCount: number;
  vatCollected: number;
  vatDeductible: number;
  netVatPayable: number;
}
