import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Error</p>
        <h1 className="mt-2 text-5xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "Outfit, sans-serif" }}>
          404
        </h1>
        <p className="mt-3 text-muted-foreground">This page doesn&apos;t exist or was moved.</p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-orange-500/20 transition-opacity hover:opacity-[0.97]"
        >
          <Home className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
