import { useBrainStore } from '../store/useBrainStore';
import type { DomainId } from '../types';

export default function DomainPill({ domainId }: { domainId: DomainId }) {
  const d = useBrainStore((s) => s.domains.find((x) => x.id === domainId));
  const color = d?.color ?? '#6B7085';
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      {d?.name ?? 'Unsorted'}
    </span>
  );
}
