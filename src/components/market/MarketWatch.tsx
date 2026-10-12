import CurrencyCard from './CurrencyCard';
import MetalsCard from './MetalsCard';
import IpoCard from './IpoCard';
import PulseCard from './PulseCard';

/** Four equal cards in the slot the single USD card used: 1 column on phones, 2 on tablets, 4 on desktop. */
export default function MarketWatch() {
  return (
    <section aria-label="Market watch" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CurrencyCard />
      <MetalsCard />
      <IpoCard />
      <PulseCard />
    </section>
  );
}
