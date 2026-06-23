import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanLine, CameraOff, RefreshCw, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onScanned: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ open, onOpenChange, onScanned, title = "Scan Barcode" }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [tab, setTab] = useState<"camera" | "upload">("camera");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadProcessing, setUploadProcessing] = useState(false);

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

      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "itf", "data_matrix"],
        });
        const detect = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(detect); return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              stopCamera(); onScanned(barcodes[0].rawValue); onOpenChange(false); return;
            }
          } catch { /* frame not ready */ }
          rafRef.current = requestAnimationFrame(detect);
        };
        rafRef.current = requestAnimationFrame(detect);
      } else {
        try {
          const { BrowserMultiFormatReader, NotFoundException } = await import("@zxing/library");
          const reader = new BrowserMultiFormatReader();
          reader.decodeFromStream(stream, videoRef.current!, (result, err) => {
            if (result) { reader.reset(); stopCamera(); onScanned(result.getText()); onOpenChange(false); }
            if (err && !(err instanceof NotFoundException)) console.warn("ZXing:", err);
          });
        } catch {
          setError("Camera scanning not supported on this browser. Use the Upload tab.");
          setScanning(false);
        }
      }
    } catch (e: any) {
      if (e?.name === "NotAllowedError") setError("Camera permission denied. Use the Upload tab.");
      else if (e?.name === "NotFoundError") setError("No camera found. Use the Upload tab.");
      else setError("Could not start camera. Use the Upload tab.");
      setScanning(false);
    }
  };

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  // ── Image upload decode ───────────────────────────────────────────────────
  const decodeImageFile = async (file: File) => {
    setUploadProcessing(true);
    setError(null);

    // Read file as data URL and set preview
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    setUploadPreview(dataUrl);

    // Wait a tick for the img element to render with the new src
    await new Promise((r) => setTimeout(r, 100));

    try {
      // 1. Try native BarcodeDetector on the img element (Chrome Android — fast & reliable)
      if ("BarcodeDetector" in window && imgRef.current) {
        const detector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e", "itf", "data_matrix"],
        });
        try {
          const barcodes = await detector.detect(imgRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            setUploadProcessing(false);
            toast.success(`Barcode: ${code}`);
            onScanned(code); onOpenChange(false); return;
          }
        } catch (e) {
          console.warn("BarcodeDetector failed:", e);
        }
      }

      // 2. ZXing via DOM img element (Firefox, Safari, desktop Chrome)
      const { BrowserMultiFormatReader } = await import("@zxing/library");
      const zxing = new BrowserMultiFormatReader();

      if (imgRef.current) {
        try {
          const result = await zxing.decodeFromImageElement(imgRef.current);
          const code = result.getText();
          setUploadProcessing(false);
          toast.success(`Barcode: ${code}`);
          onScanned(code); onOpenChange(false); return;
        } catch (e) {
          console.warn("ZXing img element failed:", e);
        }
      }

      // 3. ZXing via canvas at multiple scales
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((res) => { img.onload = () => res(); });

      for (const scale of [1, 2, 1.5, 0.75]) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Put canvas in DOM briefly so ZXing can access it
          canvas.style.display = "none";
          document.body.appendChild(canvas);

          try {
            const result = await zxing.decodeFromCanvas(canvas);
            document.body.removeChild(canvas);
            const code = result.getText();
            setUploadProcessing(false);
            toast.success(`Barcode: ${code}`);
            onScanned(code); onOpenChange(false); return;
          } catch {
            document.body.removeChild(canvas);
          }
        } catch { /* try next scale */ }
      }

      // All methods failed
      setUploadProcessing(false);
      setError("Could not read a barcode. Try a clearer photo — flat surface, good lighting, barcode fills the frame.");

    } catch (e: any) {
      setUploadProcessing(false);
      setError("Decode failed: " + (e?.message || "unknown error"));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    decodeImageFile(file);
    e.target.value = "";
  };

  useEffect(() => {
    if (open && tab === "camera") startCamera(facingMode);
    else stopCamera();
    if (!open) { setError(null); setUploadPreview(null); setUploadProcessing(false); }
    return () => stopCamera();
  }, [open, tab]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) stopCamera(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "camera" | "upload")} className="w-full">
          <TabsList className="w-full rounded-none border-b grid grid-cols-2 h-9">
            <TabsTrigger value="camera" className="text-xs">📷 Camera</TabsTrigger>
            <TabsTrigger value="upload" className="text-xs">🖼️ Upload Image</TabsTrigger>
          </TabsList>

          {/* ── Camera tab ── */}
          <TabsContent value="camera" className="mt-0">
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
          </TabsContent>

          {/* ── Upload tab ── */}
          <TabsContent value="upload" className="mt-0 px-4 py-4">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

            {/* Hidden img element used by ZXing for DOM-based decode */}
            {uploadPreview && (
              <img ref={imgRef} src={uploadPreview} alt="" className="hidden" crossOrigin="anonymous" />
            )}

            {!uploadPreview && !uploadProcessing && (
              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium">Tap to snap or upload</p>
                  <p className="text-xs text-muted-foreground mt-1">Take a photo of the barcode or select from gallery</p>
                </div>
                <Button size="sm" variant="outline" className="mt-1">
                  <Upload className="h-3.5 w-3.5 mr-1" /> Choose Image
                </Button>
              </div>
            )}

            {uploadProcessing && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Reading barcode…</p>
              </div>
            )}

            {uploadPreview && !uploadProcessing && (
              <div className="flex flex-col items-center gap-3">
                <img src={uploadPreview} alt="Uploaded" className="max-h-48 rounded-lg object-contain border" />
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
                <div className="flex gap-2 w-full">
                  <Button size="sm" variant="outline" className="flex-1"
                    onClick={() => { setUploadPreview(null); setError(null); fileInputRef.current?.click(); }}>
                    Try another image
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
