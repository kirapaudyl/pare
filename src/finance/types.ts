export type Bucket = 'needs' | 'wants' | 'savings';
export type TxKind =
  | 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
  | 'loan_payment' | 'loan_received' | 'lend' | 'collection';

/** Kinds that belong to a loan or a receivable. They are never income, spending or transfers. */
export const LOAN_KINDS: TxKind[] = ['loan_payment', 'loan_received'];
export const RECEIVABLE_KINDS: TxKind[] = ['lend', 'collection'];
export type DebtBucket = 'needs' | 'wants' | 'none';
export type AccountType = 'cash' | 'bank' | 'wallet' | 'card';
export type BudgetBase = 'target' | 'expected' | 'actual';

/** All money is stored as integer paisa (1 Rs = 100 paisa). Floats are never used for amounts. */
export interface FinAccount {
  id: string;
  name: string;
  type: AccountType;
  openingPaisa: number; // a card that owes money has a negative opening balance
  position: number;
  archived: boolean;
  lastCheckedAt: string | null;
  lastCheckedPaisa: number | null;
}

export interface FinCategory {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  bucket: Bucket | null; // null for income categories
  keywords: string[];
  position: number;
  archived: boolean;
}

/**
 * One row per event. `amountPaisa` is always positive, except for `adjustment`, which is signed.
 *  expense:    money leaves `accountId`
 *  income:     money enters `accountId`
 *  refund:     money enters `accountId`; reduces spending (never counted as income)
 *  transfer:   moves money `accountId` -> `toAccountId` (never income or spending)
 *  adjustment: reconciliation correction on `accountId` (never income, spending or budget)
 *  loan_payment:  money leaves `accountId` to repay `loanId`; lowers what you owe (an EMI is not an expense)
 *  loan_received: money enters `accountId` from borrowing on `loanId` (not income)
 *  lend:          money leaves `accountId` because you lent it to `receivableId` (not an expense)
 *  collection:    money enters `accountId` because `receivableId` repaid you (not income)
 */
export interface FinTx {
  id: string;
  kind: TxKind;
  amountPaisa: number;
  occurredAt: string; // ISO timestamp
  description: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  bucket: Bucket | null;
  refundOf: string | null;
  goalId: string | null;
  loanId: string | null;
  receivableId: string | null;
  note: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export type TxInput = Omit<FinTx, 'id' | 'createdAt' | 'deletedAt'>;

export interface FinGoal {
  id: string;
  name: string;
  targetPaisa: number;
  deadline: string | null; // yyyy-mm-dd
  plannedMonthlyPaisa: number;
  accountId: string | null; // where the goal's money is kept (default destination of contributions)
  archived: boolean;
}

export type LoanKind = 'bank' | 'personal';

/**
 * A loan you are repaying.
 *  bank:     paid in EMIs on fixed due dates (e.g. a phone loan)
 *  personal: from a friend or family. No EMI and no fixed date: you repay what you can, when you can.
 */
export interface FinLoan {
  id: string;
  name: string;
  lender: string | null;
  kind: LoanKind;
  /** What you still owed on `openingDate`. Payments recorded from that date on reduce it. */
  openingOutstandingPaisa: number;
  openingDate: string;      // yyyy-mm-dd
  emiPaisa: number | null;  // bank loans only
  firstDueOn: string | null; // bank loans only: the next EMI due as of `openingDate`; later due dates keep the same day of month
  returnBy: string | null;  // personal loans only: an optional reminder date, never a schedule
  emisPaidBefore: number;   // EMIs paid before you started tracking (information only, bank loans)
  originalPaisa: number | null; // total loan amount, if you want progress measured in rupees
  note: string | null;
  archived: boolean;
}

/** A way to cover the gap to your monthly income target: something you already have (resource) or could do (option). */
export interface FinGapItem {
  id: string;
  kind: 'resource' | 'option';
  title: string;
  expectedPaisa: number;
  note: string | null;
  done: boolean;
  position: number;
}

/** Money other people owe you. It is an asset in net worth but never available cash until collected. */
export interface FinReceivable {
  id: string;
  person: string;
  amountPaisa: number;
  lentOn: string;           // yyyy-mm-dd
  expectedOn: string | null;
  note: string | null;
  writtenOffPaisa: number;
  archived: boolean;
}

export interface FinSettings {
  incomeTargetPaisa: number;
  expectedIncomePaisa: number;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  budgetBase: BudgetBase;
  defaultAccountId: string | null;
  /** Which budget bucket loan payments count against. 'none' leaves them out of the 50/30/20 entirely. */
  debtBucket: DebtBucket;
}
