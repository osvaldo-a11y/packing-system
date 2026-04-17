import { Outlet } from 'react-router-dom';

/** Tarja TAR + vínculo proceso: alta de pallet hacia Existencias PT (una sola vista; sin sub-navegación). */
export function UnidadPtLayout() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Outlet />
    </div>
  );
}
