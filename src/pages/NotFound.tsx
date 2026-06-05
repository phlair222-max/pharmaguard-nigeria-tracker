import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Pill } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        {/* Green pharmacy cross logo */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#16a36e] text-white shadow-lg">
            <Pill className="h-10 w-10" />
          </div>
        </div>

        {/* Error message */}
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-[#16a36e]">404</h1>
          <h2 className="text-2xl font-semibold text-foreground">Page Not Found</h2>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate("/")}
            className="bg-[#16a36e] hover:bg-[#138a5c] text-white"
          >
            Go to Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
        </div>

        {/* Branding */}
        <p className="text-sm text-muted-foreground">
          PharmaGuard NG — Nigeria Pharma Tracker
        </p>
      </div>
    </div>
  );
};

export default NotFound;
