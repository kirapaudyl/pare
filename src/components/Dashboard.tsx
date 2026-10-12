import ThoughtInput from './ThoughtInput';
import TaskList from './TaskList';
import MindMap from './MindMap';
import ProgressByDomain from './ProgressByDomain';
import ForexCard from './ForexCard';
import Spotlight from './Spotlight';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <ForexCard />
      <div className="grid gap-6 lg:grid-cols-2">
        <ThoughtInput />
        <TaskList />
      </div>
      <Spotlight />
      <MindMap />
      <ProgressByDomain />
    </div>
  );
}
