import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine, CameraOff, RefreshCw } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScanned: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ open, onOpenChange, onScanned, title = "Scan Barcode" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const stopCamera = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  const startCamera = async (facing: "environment" | "user") => {
    stopCamera();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanning(true);

      // Use BarcodeDetector if available (Chrome Android, Safari 17+)
      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "itf", "data_matrix"],
        });

        const detect = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(detect);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              stopCamera();
              onScanned(code);
              onOpenChange(false);
              return;
            }
          } catch { /* frame not ready */ }
          rafRef.current = requestAnimationFrame(detect);
        };
        rafRef.current = requestAnimationFrame(detect);

      } else {
        // Fallback: dynamically import ZXing only if BarcodeDetector not available
        try {
          const { BrowserMultiFormatReader, NotFoundException } = await import("@zxing/library");
          const reader = new BrowserMultiFormatReader();

          // decodeFromStream works without listVideoInputDevices
          reader.decodeFromStream(stream, videoRef.current!, (result, err) => {
            if (result) {
              reader.reset();
              stopCamera();
              onScanned(result.getText());
              onOpenChange(false);
            }
            if (err && !(err instanceof NotFoundException)) {
              console.warn("ZXing decode error:", err);
            }
          });
        } catch (zxingErr: any) {
          setError("Barcode scanning is not supported on this browser. Try Chrome on Android.");
          setScanning(false);
        }
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (e?.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera: " + (e?.message || "unknown error"));
      }
      setScanning(false);
    }
  };

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopCamera();
      setError(null);
    }
    return () => stopCamera();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) stopCamera(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-36">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br" />
                <div className="absolute left-1 right-1 h-0.5 bg-primary/80 animate-bounce" style={{ top: "50%" }} />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-xs text-white/80 bg-black/40 px-2 py-1 rounded">Point at barcode</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 p-4">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-center text-sm text-white">{error}</p>
              <Button size="sm" variant="outline" onClick={() => startCamera(facingMode)}>Try again</Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground">{scanning ? "Scanning…" : "Camera stopped"}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={switchCamera}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Flip
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
