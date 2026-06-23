import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';

/**
 * Wraps Sidebar for responsive behavior. No prop changes to Sidebar.
 * <768px: sidebar does NOT exist in layout; fixed header + overlay drawer only.
 * >=768px: sidebar in flow (pixel-identical to current).
 */
export function MobileSidebarWrapper() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Mobile-only header: fixed, does not occupy layout flow. */}
      <div className="flex md:hidden h-14 items-center justify-between border-b bg-background px-4 fixed top-0 left-0 right-0 z-30">
        <Link to="/" className="flex items-center shrink-0">
          <img src="/sahaya-logo.png" alt="Sahaya" className="h-8 w-auto object-contain" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="p-2 -m-2 rounded-md text-foreground hover:bg-muted"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Desktop-only: sidebar in flow. On mobile this div does not render (hidden). */}
      <div className="hidden md:flex md:w-64 md:flex-shrink-0 md:border-r md:border-sidebar-border md:bg-sidebar">
        <Sidebar />
      </div>

      {/* Mobile drawer: fixed overlay; does not affect layout. */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            className="fixed left-0 top-0 bottom-0 z-50 w-56 max-h-screen bg-sidebar shadow-lg md:hidden overflow-y-auto"
            role="dialog"
            aria-label="Menu"
          >
            <Sidebar />
          </div>
        </>
      )}
    </>
  );
}
