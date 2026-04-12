import { useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { isAccessTokenExpired } from '@/api';
import { AuthProvider, useAuth } from './AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { ExistenciasPtLayout } from './layouts/ExistenciasPtLayout';
import { UnidadPtLayout } from './layouts/UnidadPtLayout';
import { AboutPage } from './pages/AboutPage';
import { ConsumptionsPage } from './pages/ConsumptionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DispatchesPage } from './pages/DispatchesPage';
import { ExistenciaPtDetailPage } from './pages/ExistenciaPtDetailPage';
import { ExistenciasPtPage } from './pages/ExistenciasPtPage';
import { PtPackingListDetailPage } from './pages/PtPackingListDetailPage';
import { PtPackingListsPage } from './pages/PtPackingListsPage';
import { RepalletPage } from './pages/RepalletPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { MastersPage } from './pages/MastersPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { PlantPage } from './pages/PlantPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { PtTagsPage } from './pages/PtTagsPage';
import { ReceptionPage } from './pages/ReceptionPage';
import { RecipesPage } from './pages/RecipesPage';
import { ReportingPage } from './pages/ReportingPage';
import { SystemFlowGuidePage } from './pages/SystemFlowGuidePage';
import { SalesOrderProgressPage } from './pages/SalesOrderProgressPage';
import { SalesOrdersPage } from './pages/SalesOrdersPage';

function ProtectedLayout() {
  const { token, logout } = useAuth();
  const expired = Boolean(token && isAccessTokenExpired(token));
  useEffect(() => {
    if (expired) logout();
  }, [expired, logout]);
  if (!token || expired) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function NavigateFallback() {
  const { token } = useAuth();
  return <Navigate to={token ? '/' : '/login'} replace />;
}

/** Compat: `#/existencias-pt/:id` numérico → detalle de existencia PT. */
function LegacyExistenciaBareNumericId() {
  const { id } = useParams();
  if (id && /^\d+$/.test(id)) {
    return <Navigate to={`/existencias-pt/detalle/${id}`} replace />;
  }
  return <Navigate to="/existencias-pt/inventario" replace />;
}

function RedirectLegacyFolioPathToDetalle() {
  const { id } = useParams();
  return <Navigate to={`/existencias-pt/detalle/${id}`} replace />;
}

function RedirectPtTagsFolioToExistencias() {
  const { id } = useParams();
  return <Navigate to={`/existencias-pt/detalle/${id}`} replace />;
}

function RedirectPtTagsPackingListToExistencias() {
  const { id } = useParams();
  return <Navigate to={`/existencias-pt/packing-lists/${id}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/plant" element={<PlantPage />} />
          <Route path="/masters" element={<MastersPage />} />
          <Route path="/receptions" element={<ReceptionPage />} />
          <Route path="/packaging/materials" element={<MaterialsPage />} />
          <Route path="/packaging/recipes" element={<RecipesPage />} />
          <Route path="/packaging/consumptions" element={<ConsumptionsPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/processes" element={<ProcessesPage />} />
          <Route path="/pt-tags" element={<UnidadPtLayout />}>
            <Route index element={<PtTagsPage />} />
          </Route>
          <Route path="/pt-tags/carga" element={<Navigate to="/pt-tags" replace />} />
          <Route path="/pt-tags/inventario" element={<Navigate to="/existencias-pt/inventario" replace />} />
          <Route path="/pt-tags/repaletizar" element={<Navigate to="/existencias-pt/repaletizar" replace />} />
          <Route path="/pt-tags/packing-lists" element={<Navigate to="/existencias-pt/packing-lists" replace />} />
          <Route path="/pt-tags/packing-lists/:id" element={<RedirectPtTagsPackingListToExistencias />} />
          <Route path="/pt-tags/folio/:id" element={<RedirectPtTagsFolioToExistencias />} />
          <Route path="/existencias-pt" element={<ExistenciasPtLayout />}>
            <Route index element={<Navigate to="inventario" replace />} />
            <Route path="carga" element={<Navigate to="/existencias-pt/inventario" replace />} />
            <Route path="inventario" element={<ExistenciasPtPage />} />
            <Route path="preparacion" element={<Navigate to="/pt-tags" replace />} />
            <Route path="repaletizar" element={<RepalletPage />} />
            <Route path="packing-lists" element={<PtPackingListsPage />} />
            <Route path="packing-lists/:id" element={<PtPackingListDetailPage />} />
            <Route path="detalle/:id" element={<ExistenciaPtDetailPage />} />
            <Route path="folio/:id" element={<RedirectLegacyFolioPathToDetalle />} />
            <Route path=":id" element={<LegacyExistenciaBareNumericId />} />
          </Route>
          <Route path="/unidades-pt" element={<Navigate to="/pt-tags" replace />} />
          <Route path="/final-pallets" element={<Navigate to="/existencias-pt/inventario" replace />} />
          <Route path="/sales-orders" element={<SalesOrdersPage />} />
          <Route path="/sales-orders/:id/avance" element={<SalesOrderProgressPage />} />
          <Route path="/dispatches" element={<DispatchesPage />} />
          <Route path="/reporting" element={<ReportingPage />} />
          <Route path="/guide/sistema" element={<SystemFlowGuidePage />} />
        </Route>
      </Route>
      <Route path="*" element={<NavigateFallback />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AppRoutes />
        </div>
      </AuthProvider>
    </HashRouter>
  );
}
