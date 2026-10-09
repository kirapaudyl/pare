import DOMAINS from '../store/seed';
import type { DomainId } from '../types';

export default function DomainPill({ domainId }: { domainId: DomainId }) {
  const d = DOMAINS.find((x: any) => x.id === domainId)!;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: d.color, backgroundColor: `${d.color}1A` }}
    >
      {d.name}
    </span>
  );
}
