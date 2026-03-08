import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import Plan from './pages/Plan';
import Recipes from './pages/Recipes';
import AddItem from './pages/AddItem';
import ItemDetail from './pages/ItemDetail';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/add" element={<AddItem />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
