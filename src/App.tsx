import { useState } from 'react';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import BottomPanel from './components/BottomPanel';
import StatusBar from './components/StatusBar';

export type ActivityItem = 'explorer' | 'search' | 'git' | 'ava' | 'extensions' | 'debug';
export type BottomTab = 'terminal' | 'problems' | 'output' | 'debug-console';

export default function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityItem>('explorer');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('terminal');

  const toggleActivity = (item: ActivityItem) => {
    if (activeActivity === item && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveActivity(item);
      setSidebarOpen(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ActivityBar active={activeActivity} onSelect={toggleActivity} sidebarOpen={sidebarOpen} />
        {sidebarOpen && <Sidebar activePanel={activeActivity} />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <EditorArea />
          {bottomPanelOpen && (
            <BottomPanel activeTab={activeBottomTab} onTabChange={setActiveBottomTab} onClose={() => setBottomPanelOpen(false)} />
          )}
        </div>
      </div>
      <StatusBar onToggleTerminal={() => setBottomPanelOpen(!bottomPanelOpen)} mode="Work" />
    </div>
  );
}
