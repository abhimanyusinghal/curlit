import { useState, useEffect, useCallback } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  FileCode,
  Globe,
  Keyboard,
  Zap,
  GripVertical,
  GripHorizontal,
  Sun,
  Moon,
  Archive,
} from 'lucide-react';
import { useAppStore } from './store';
import { RequestTabs } from './components/RequestTabs';
import { UrlBar } from './components/UrlBar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { Sidebar } from './components/Sidebar';
import { CurlImportModal } from './components/CurlImportModal';
import { CurlExportModal } from './components/CurlExportModal';
import { OpenApiImportModal } from './components/OpenApiImportModal';
import { SaveRequestModal } from './components/SaveRequestModal';
import { BackupModal } from './components/BackupModal';
import { useResizable } from './hooks/useResizable';
import { disconnectWebSocket } from './utils/websocket';

function App() {
  const activeTabId = useAppStore(s => s.activeTabId);
  const tabs = useAppStore(s => s.tabs);
  const requests = useAppStore(s => s.requests);
  const responses = useAppStore(s => s.responses);
  const loadingRequests = useAppStore(s => s.loadingRequests);
  const sidebarOpen = useAppStore(s => s.sidebarOpen);
  const toggleSidebar = useAppStore(s => s.toggleSidebar);
  const theme = useAppStore(s => s.theme);
  const toggleTheme = useAppStore(s => s.toggleTheme);
  const activeEnvironmentId = useAppStore(s => s.activeEnvironmentId);
  const environments = useAppStore(s => s.environments);

  const [showCurlImport, setShowCurlImport] = useState(false);
  const [showCurlExport, setShowCurlExport] = useState(false);
  const [showOpenApiImport, setShowOpenApiImport] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeRequest = activeTab ? requests[activeTab.requestId] : null;
  const activeResponse = activeTab ? responses[activeTab.requestId] : null;
  const activeLoading = activeTab ? loadingRequests[activeTab.requestId] : false;
  const activeEnv = environments.find(e => e.id === activeEnvironmentId);

  const { size: sidebarWidth, handleMouseDown: handleSidebarResize } = useResizable({
    direction: 'horizontal',
    initialSize: 280,
    minSize: 200,
    maxSize: 500,
    storageKey: 'curlit-sidebar-width',
  });

  const { size: requestHeight, handleMouseDown: handleVerticalResize } = useResizable({
    direction: 'vertical',
    initialSize: 300,
    minSize: 150,
    maxSize: 600,
    storageKey: 'curlit-request-height',
  });

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'i':
          e.preventDefault();
          setShowCurlImport(true);
          break;
        case 'e':
          e.preventDefault();
          setShowCurlExport(true);
          break;
        case 'b':
          e.preventDefault();
          toggleSidebar();
          break;
        case 'n':
          e.preventDefault();
          useAppStore.getState().addTab();
          break;
        case 'd':
          e.preventDefault();
          useAppStore.getState().duplicateTab();
          break;
        case 's':
          e.preventDefault();
          {
            const result = useAppStore.getState().saveActiveRequest();
            if (result === 'needs-collection') {
              setShowSaveModal(true);
            }
          }
          break;
      }
    }
  }, [toggleSidebar]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close all WebSocket connections on page unload
  useEffect(() => {
    const cleanup = () => {
      const state = useAppStore.getState();
      for (const requestId of Object.keys(state.webSocketSessions)) {
        if (state.webSocketSessions[requestId]?.status === 'connected') {
          disconnectWebSocket(requestId);
        }
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, []);

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-dark-800 border-b border-dark-600 select-none flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-accent-orange" />
            <span className="text-sm font-bold text-dark-100 tracking-wide">CurlIt</span>
          </div>
          <div className="h-4 w-px bg-dark-600" />
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-dark-400 hover:text-dark-200 rounded transition-colors cursor-pointer"
            title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 text-dark-400 hover:text-dark-200 rounded transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeEnv && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent-green/10 border border-accent-green/30 rounded-md">
              <Globe size={12} className="text-accent-green" />
              <span className="text-[11px] text-accent-green font-medium">{activeEnv.name}</span>
            </div>
          )}

          <button
            onClick={() => setShowBackup(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-md transition-colors cursor-pointer"
            title="Backup & Restore all data"
          >
            <Archive size={13} />
            Backup
          </button>
          <button
            onClick={() => setShowOpenApiImport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-md transition-colors cursor-pointer"
            title="Import OpenAPI / Swagger"
          >
            <FileCode size={13} />
            OpenAPI
          </button>
          <button
            onClick={() => setShowCurlImport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-md transition-colors cursor-pointer"
            title="Import cURL (Ctrl+I)"
          >
            <Terminal size={13} />
            Import cURL
          </button>
          <button
            onClick={() => setShowCurlExport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded-md transition-colors cursor-pointer"
            title="Export as cURL (Ctrl+E)"
          >
            <FileCode size={13} />
            Export cURL
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 h-full overflow-hidden">
              <Sidebar />
            </div>
            <div
              onMouseDown={handleSidebarResize}
              className="w-1.5 flex-shrink-0 bg-dark-700 hover:bg-accent-blue/50 cursor-col-resize transition-colors flex items-center justify-center group"
            >
              <GripVertical size={10} className="text-dark-500 opacity-0 group-hover:opacity-100" />
            </div>
          </>
        )}

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Request tabs */}
          <RequestTabs />

          {activeRequest ? (
            <>
              {/* URL bar */}
              <UrlBar request={activeRequest} />

              {/* Request panel */}
              <div style={{ height: requestHeight }} className="flex-shrink-0 overflow-hidden border-b border-dark-600">
                <RequestPanel request={activeRequest} />
              </div>

              {/* Resize handle */}
              <div
                onMouseDown={handleVerticalResize}
                className="h-1.5 flex-shrink-0 bg-dark-700 hover:bg-accent-blue/50 cursor-row-resize transition-colors flex items-center justify-center group"
              >
                <GripHorizontal size={10} className="text-dark-500 opacity-0 group-hover:opacity-100" />
              </div>

              {/* Response panel */}
              <div className="flex-1 overflow-hidden">
                <ResponsePanel
                  key={activeRequest.id}
                  response={activeResponse ?? null}
                  loading={!!activeLoading}
                  requestId={activeRequest.id}
                  protocol={activeRequest.protocol}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-dark-400">
              <p>No request selected</p>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between px-3 py-1 bg-dark-800 border-t border-dark-600 text-[10px] text-dark-400 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span>CurlIt v1.0.0</span>
          <span>|</span>
          <span>{tabs.length} tab{tabs.length !== 1 ? 's' : ''} open</span>
        </div>
        <div className="flex items-center gap-1">
          <Keyboard size={10} />
          <span>Ctrl+S Save | Ctrl+N New | Ctrl+D Duplicate | Ctrl+I Import | Ctrl+E Export | Ctrl+B Sidebar</span>
        </div>
      </footer>

      {/* Modals */}
      <CurlImportModal open={showCurlImport} onClose={() => setShowCurlImport(false)} />
      <CurlExportModal open={showCurlExport} onClose={() => setShowCurlExport(false)} request={activeRequest} />
      <OpenApiImportModal open={showOpenApiImport} onClose={() => setShowOpenApiImport(false)} />
      <SaveRequestModal open={showSaveModal} onClose={() => setShowSaveModal(false)} />
      <BackupModal open={showBackup} onClose={() => setShowBackup(false)} />
    </div>
  );
}

export default App;
