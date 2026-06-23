import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Camera, RotateCcw, CheckCircle, AlertTriangle, Loader2, ScanLine } from "lucide-react";

interface ScanResult {
  expiryDate: string | null;
  rawExpiryText: string | null;
  productName: string | null;
  nafdac: string | null;
  batchNo: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

interface ExpiryScannerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (result: {
    expiryDate: string;
    productName?: string;
    nafdac?: string;
    batchNo?: string;
  }) => void;
}

export function ExpiryScanner({ open, onOpenChange, onConfirm }: ExpiryScannerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
    setImageBase64(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const captureOrUpload = () => {
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError(null);
    setResult(null);

    const mime = file.type || "image/jpeg";
    setMimeType(mime);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreview(url);

    // Convert to base64
    const base64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        // Strip the "data:image/jpeg;base64," prefix — Gemini wants raw base64
        res(dataUrl.split(",")[1]);
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    setImageBase64(base64);
    // Auto-scan immediately after capture
    await runScan(base64, mime);
  };

  const runScan = async (b64: string, mime: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("scan-expiry", {
        body: { imageBase64: b64, mimeType: mime },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setResult(data as ScanResult);
    } catch (e: any) {
      setError(e?.message || "Scan failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result?.expiryDate) return;
    onConfirm({
      expiryDate: result.expiryDate,
      productName: result.productName || undefined,
      nafdac: result.nafdac || undefined,
      batchNo: result.batchNo || undefined,
    });
    handleClose();
  };

  const confidenceColor = {
    high: "border-success text-success",
    medium: "border-warning text-warning",
    low: "border-destructive text-destructive",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4 text-primary" />
            Scan Expiry Date
          </DialogTitle>
        </DialogHeader>

        {/* Hidden file/camera input — capture="environment" triggers rear camera on mobile */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
        />

        <div className="space-y-4">
          {/* Image preview */}
          {preview ? (
            <div className="relative rounded-lg overflow-hidden border bg-black" style={{ aspectRatio: "4/3" }}>
              <img src={preview} alt="Captured label" className="w-full h-full object-contain" />
              {loading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-sm text-white">Reading with Gemini AI…</span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={captureOrUpload}
              className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-3 py-10"
            >
              <Camera className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Take a photo of the label</p>
                <p className="text-xs text-muted-foreground mt-0.5">Gemini AI will read the expiry date</p>
              </div>
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scan Result</span>
                <Badge variant="outline" className={confidenceColor[result.confidence]}>
                  {result.confidence} confidence
                </Badge>
              </div>

              {result.expiryDate ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{result.expiryDate}</p>
                    {result.rawExpiryText && (
                      <p className="text-xs text-muted-foreground">Found: "{result.rawExpiryText}"</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-sm text-muted-foreground">No expiry date found in image</p>
                </div>
              )}

              {/* Bonus fields */}
              {(result.productName || result.nafdac || result.batchNo) && (
                <div className="border-t pt-2 mt-2 space-y-1">
                  {result.productName && (
                    <p className="text-xs"><span className="text-muted-foreground">Product:</span> {result.productName}</p>
                  )}
                  {result.nafdac && (
                    <p className="text-xs"><span className="text-muted-foreground">NAFDAC:</span> {result.nafdac}</p>
                  )}
                  {result.batchNo && (
                    <p className="text-xs"><span className="text-muted-foreground">Batch:</span> {result.batchNo}</p>
                  )}
                </div>
              )}

              {result.notes && (
                <p className="text-[11px] text-muted-foreground italic border-t pt-2">{result.notes}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {preview && (
            <Button size="sm" variant="outline" onClick={() => { reset(); }} disabled={loading}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retake
            </Button>
          )}
          {!preview && (
            <Button size="sm" variant="ghost" onClick={handleClose}>Cancel</Button>
          )}
          {preview && !loading && (
            <>
              {!result && imageBase64 && (
                <Button size="sm" variant="outline" onClick={() => runScan(imageBase64, mimeType)}>
                  Retry scan
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!result?.expiryDate}
              >
                Use this date
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
