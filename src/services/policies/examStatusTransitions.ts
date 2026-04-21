import type { ExamStatus, StatusTransition } from '../../types/domain';

export const STATUS_TRANSITIONS: StatusTransition[] = [
  { from: 'draft', to: 'draft', allowed: true },
  { from: 'draft', to: 'in_review', allowed: true, requireActor: 'owner' },
  { from: 'draft', to: 'archived', allowed: true, requireActor: 'owner' },
  { from: 'in_review', to: 'draft', allowed: true, requireActor: 'reviewer' },
  { from: 'in_review', to: 'approved', allowed: true, requireActor: 'reviewer' },
  { from: 'in_review', to: 'rejected', allowed: true, requireActor: 'reviewer' },
  { from: 'approved', to: 'draft', allowed: true, requireActor: 'reviewer' },
  { from: 'approved', to: 'scheduled', allowed: true, requireActor: 'admin' },
  { from: 'approved', to: 'published', allowed: true, requireActor: 'admin' },
  { from: 'scheduled', to: 'published', allowed: true, requireActor: 'admin' },
  { from: 'scheduled', to: 'draft', allowed: true, requireActor: 'admin' },
  { from: 'published', to: 'unpublished', allowed: true, requireActor: 'admin' },
  { from: 'published', to: 'archived', allowed: true, requireActor: 'admin' },
  { from: 'unpublished', to: 'draft', allowed: true, requireActor: 'admin' },
  { from: 'unpublished', to: 'published', allowed: true, requireActor: 'admin' },
  { from: 'unpublished', to: 'archived', allowed: true, requireActor: 'admin' },
  { from: 'archived', to: 'draft', allowed: true, requireActor: 'admin' },
];

export function canTransition(from: ExamStatus, to: ExamStatus): boolean {
  return STATUS_TRANSITIONS.some((transition) => {
    return transition.from === from && transition.to === to && transition.allowed;
  });
}

