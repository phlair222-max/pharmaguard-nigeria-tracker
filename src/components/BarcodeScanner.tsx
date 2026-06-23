import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { ScanLine, CameraOff, RefreshCw } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScanned: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ open, onOpenChange, onScanned, title = "Scan Barcode" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);

  const startScanner = async (devIdx: number) => {
    setError(null);
    setScanning(true);

    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(videoDevices);

      if (videoDevices.length === 0) {
        setError("No camera found on this device.");
        setScanning(false);
        return;
      }

      // Prefer rear camera — look for "back" or "environment" in label
      const preferredIdx = videoDevices.findIndex((d) =>
        d.label.toLowerCase().includes("back") ||
        d.label.toLowerCase().includes("rear") ||
        d.label.toLowerCase().includes("environment")
      );
      const useIdx = devIdx < videoDevices.length ? devIdx : (preferredIdx >= 0 ? preferredIdx : 0);
      setDeviceIdx(useIdx);

      await reader.decodeFromVideoDevice(
        videoDevices[useIdx].deviceId,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const text = result.getText();
            reader.reset();
            onScanned(text);
            onOpenChange(false);
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error("Scanner error:", err);
          }
        }
      );
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        setError("Camera permission denied. Please allow camera access and try again.");
      } else if (e?.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera: " + (e?.message || "unknown error"));
      }
      setScanning(false);
    }
  };

  const stopScanner = () => {
    readerRef.current?.reset();
    readerRef.current = null;
    setScanning(false);
  };

  const switchCamera = () => {
    stopScanner();
    const nextIdx = (deviceIdx + 1) % Math.max(1, devices.length);
    startScanner(nextIdx);
  };

  useEffect(() => {
    if (open) {
      startScanner(deviceIdx);
    } else {
      stopScanner();
      setError(null);
    }
    return () => stopScanner();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) stopScanner(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />

          {/* Scanning overlay */}
          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-36">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br" />
                {/* Scan line animation */}
                <div className="absolute left-1 right-1 h-0.5 bg-primary/80 animate-bounce" style={{ top: "50%" }} />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-xs text-white/80 bg-black/40 px-2 py-1 rounded">
                  Point at barcode
                </span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 p-4">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-center text-sm text-white">{error}</p>
              <Button size="sm" variant="outline" onClick={() => startScanner(deviceIdx)}>
                Try again
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {scanning ? "Scanning…" : "Camera stopped"}
          </p>
          <div className="flex gap-2">
            {devices.length > 1 && (
              <Button size="sm" variant="outline" onClick={switchCamera}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Flip
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
