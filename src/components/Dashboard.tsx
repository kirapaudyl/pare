import ThoughtInput from './ThoughtInput';
import TaskList from './TaskList';
import MindMap from './MindMap';
import ProgressByDomain from './ProgressByDomain';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ThoughtInput />
        <TaskList />
      </div>
      <MindMap />
      <ProgressByDomain />
    </div>
  );
}
