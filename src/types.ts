export type DomainId = string;

export interface Domain {
  id: DomainId;
  name: string;
  color: string;
}

export type TaskStatus = 'pending' | 'completed';

export interface Task {
  id: string;
  title: string;
  domainId: DomainId;
  status: TaskStatus;
  dateAdded: string;
  isFromYesterday: boolean;
}

export interface Resource {
  id: string;
  title: string;
  platform: string;
  url: string;
  domainId: DomainId;
}

export interface DomainNode {
  id: DomainId;
  name: string;
  progressPercentage: number;
  color: string;
  linkedResources: Resource[];
}

export interface JournalEntry {
  id: string;
  title?: string;
  content: string;
  timestamp: string;
}