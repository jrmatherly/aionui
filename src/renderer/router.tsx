import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from './components/AppLoader';
import { useAuth } from './context/AuthContext';
import GlobalModels from './pages/admin/GlobalModels';
import GroupMappings from './pages/admin/GroupMappings';
import LoggingSettings from './pages/admin/LoggingSettings';
import UserManagement from './pages/admin/UserManagement';
import Conversation from './pages/conversation';
import Guid from './pages/guid';
import LoginPage from './pages/login';
import ProfilePage from './pages/profile/ProfilePage';
import About from './pages/settings/About';
import AgentSettings from './pages/settings/AgentSettings';
import ApiKeysSettings from './pages/settings/ApiKeysSettings';
import DisplaySettings from './pages/settings/DisplaySettings';
import KnowledgeBase from './pages/settings/KnowledgeBase';
import PythonEnvironment from './pages/settings/PythonEnvironment';
import GeminiSettings from './pages/settings/GeminiSettings';
import ModeSettings from './pages/settings/ModeSettings';
import SystemSettings from './pages/settings/SystemSettings';
import ToolsSettings from './pages/settings/ToolsSettings';
import WebuiSettings from './pages/settings/WebuiSettings';
import ComponentsShowcase from './pages/test/ComponentsShowcase';

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

/** Guard that requires admin role. Falls back to /guid for non-admins. */
const AdminGuard: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <Navigate to='/guid' replace />;
  }
  return children;
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route path='/login' element={status === 'authenticated' ? <Navigate to='/guid' replace /> : <LoginPage />} />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={<Guid />} />
          <Route path='/conversation/:id' element={<Conversation />} />
          <Route path='/settings/gemini' element={<GeminiSettings />} />
          <Route path='/settings/model' element={<ModeSettings />} />
          <Route path='/settings/agent' element={<AgentSettings />} />
          <Route path='/settings/display' element={<DisplaySettings />} />
          <Route path='/settings/apikeys' element={<ApiKeysSettings />} />
          <Route path='/settings/python' element={<PythonEnvironment />} />
          <Route path='/settings/knowledge' element={<KnowledgeBase />} />
          <Route path='/settings/webui' element={<WebuiSettings />} />
          <Route path='/settings/system' element={<SystemSettings />} />
          <Route path='/settings/about' element={<About />} />
          <Route path='/settings/tools' element={<ToolsSettings />} />
          <Route path='/settings' element={<Navigate to='/settings/gemini' replace />} />
          <Route path='/profile' element={<ProfilePage />} />
          <Route
            path='/admin/users'
            element={
              <AdminGuard>
                <UserManagement />
              </AdminGuard>
            }
          />
          <Route
            path='/admin/group-mappings'
            element={
              <AdminGuard>
                <GroupMappings />
              </AdminGuard>
            }
          />
          <Route
            path='/admin/models'
            element={
              <AdminGuard>
                <GlobalModels />
              </AdminGuard>
            }
          />
          <Route
            path='/admin/logging'
            element={
              <AdminGuard>
                <LoggingSettings />
              </AdminGuard>
            }
          />
          <Route path='/admin' element={<Navigate to='/admin/users' replace />} />
          <Route path='/test/components' element={<ComponentsShowcase />} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
