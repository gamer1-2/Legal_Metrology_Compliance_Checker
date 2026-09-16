import React, { useState, useRef, useEffect } from 'react';
import {
  Barcode,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Upload,
  Scale,
  Sparkles,
  SwitchCamera,
  Zap,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  Power,
  Check,
  Loader2,
  ArrowDown,
  Calculator,
  ChevronDown,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  calculateGs1CheckDigit,
  validateGs1CheckDigit,
  resolveGs1Country,
  verifyBarcodeProvenance,
  decodeBarcodeFromCanvasOrImage,
  GS1_PREFIX_TABLE,
} from '../utils/barcodeEngine';
import { BarcodeVerificationResult } from '../types/compliance';
import { ToolHeader } from './tools/ToolHeader';
import { AppPage } from './Sidebar';

export interface BarcodeProvenanceViewProps {
  onBack?: () => void;
  onSelectTool?: (tool: AppPage) => void;
}

export const BarcodeProvenanceView: React.FC<BarcodeProvenanceViewProps> = ({
  onBack,
  onSelectTool,
}) => {
  // Mode switcher: camera vs upload
  const [sourceMode, setSourceMode] = useState<'camera' | 'upload'>('camera');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Captured snapshot state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // Barcode & Provenance Data State
  const [barcodeInput, setBarcodeInput] = useState('8901030924514');
  const [declaredOrigin, setDeclaredOrigin] = useState('India');
  const [mfgDetails, setMfgDetails] = useState('Regd. Office: Mumbai, Maharashtra, India');
  const [verificationResult, setVerificationResult] = useState<BarcodeVerificationResult | null>(() =>
    verifyBarcodeProvenance('8901030924514', 'India', 'Regd. Office: Mumbai, Maharashtra, India')
  );
  const [isCheckingMath, setIsCheckingMath] = useState(false);
  const [decodeNotice, setDecodeNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const continuousScanTimerRef = useRef<any>(null);

  // Start Real-Time Camera Stream
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    setCameraError(null);
    stopCamera();

    // Check Capacitor native permissions if applicable
    if (Capacitor.isNativePlatform()) {
      try {
        const check = await CapCamera.checkPermissions();
        if (check.camera !== 'granted') {
          const req = await CapCamera.requestPermissions({ permissions: ['camera'] });
          if (req.camera !== 'granted') {
            setCameraError('Camera permission required. Please grant permission in device settings.');
            setIsCameraActive(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Capacitor check error:', err);
      }
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : null;
      if (capabilities && 'torch' in capabilities) {
        setHasTorch(true);
      } else {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.warn('Standard constraints failed, trying generic video:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
        setIsCameraActive(true);
      } catch (fallbackErr: any) {
        setCameraError(
          fallbackErr?.message || 'Unable to access camera. Please allow camera permissions or upload packaging photo.'
        );
        setIsCameraActive(false);
      }
    }
  };

  const stopCamera = () => {
    if (continuousScanTimerRef.current) {
      clearInterval(continuousScanTimerRef.current);
      continuousScanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  // Toggle Torch/Flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Flip Camera (Front / Back)
  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  // Click / Snap Picture from Real-Time Camera
  const capturePhotoAndAnalyze = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    // Native Capacitor fallback
    if (Capacitor.isNativePlatform() && (!streamRef.current || !videoRef.current)) {
      try {
        const photo = await CapCamera.getPhoto({
          quality: 92,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
        });
        if (photo?.dataUrl) {
          processImageData(photo.dataUrl);
        }
      } catch (err) {
        console.warn('Native photo capture cancelled:', err);
      } finally {
        setIsCapturing(false);
      }
      return;
    }

    if (!videoRef.current || !canvasRef.current) {
      setIsCapturing(false);
      return;
    }

    // Shutter flash animation
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (zoomLevel > 1.0) {
        const cropWidth = canvas.width / zoomLevel;
        const cropHeight = canvas.height / zoomLevel;
        const startX = (canvas.width - cropWidth) / 2;
        const startY = (canvas.height - cropHeight) / 2;
        ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedImage(dataUrl);
      await processImageData(dataUrl);
    }
    setIsCapturing(false);
  };

  // Process image data (from live snapshot or file upload)
  const processImageData = async (dataUrl: string) => {
    setIsAnalyzingImage(true);
    setDecodeNotice(null);
    try {
      const decoded = await decodeBarcodeFromCanvasOrImage(dataUrl);
      if (decoded && decoded.text) {
        const cleanDigits = decoded.text.replace(/\D/g, '');
        setBarcodeInput(cleanDigits);

        const activeOrigin = decoded.declaredOrigin || declaredOrigin;
        const activeMfg = decoded.manufacturerDetails || mfgDetails;

        if (decoded.declaredOrigin && !declaredOrigin) {
          setDeclaredOrigin(decoded.declaredOrigin);
        }
        if (decoded.manufacturerDetails && !mfgDetails) {
          setMfgDetails(decoded.manufacturerDetails);
        }

        const res = verifyBarcodeProvenance(cleanDigits, activeOrigin, activeMfg);
        setVerificationResult(res);

        const methodLabel =
          decoded.source === 'AI_VISION_SERVER'
            ? 'via AI Vision OCR'
            : decoded.source === 'NATIVE_BARCODE_DETECTOR'
            ? 'via Hardware Detector'
            : 'via Optical Reader';

        setDecodeNotice({
          type: res.isCheckDigitValid ? 'success' : 'warning',
          message: `Decoded ${decoded.format || 'EAN-13'} Barcode: ${cleanDigits} (${methodLabel}). Modulo-10 check is ${
            res.isCheckDigitValid ? 'VALID' : 'INVALID'
          }.`,
        });

        // Smooth scroll to results on mobile devices
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setTimeout(() => {
            document.getElementById('barcode-audit-report')?.scrollIntoView({ behavior: 'smooth' });
          }, 350);
        }
      } else {
        setDecodeNotice({
          type: 'error',
          message:
            'Could not detect barcode bars in this photograph. Please ensure good lighting and clear focus, or enter the printed barcode digits manually below.',
        });
      }
    } catch (err) {
      console.warn('Barcode decoding error:', err);
      setDecodeNotice({
        type: 'error',
        message: 'Optical reading encountered an issue. Please enter the barcode digits manually below.',
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Manual verify trigger with real working math feedback
  const handleManualVerify = (customCode?: string) => {
    const raw = (customCode !== undefined ? customCode : barcodeInput) || '';
    const cleanDigits = raw.replace(/\D/g, '');

    if (!cleanDigits) {
      setDecodeNotice({
        type: 'warning',
        message: 'Please enter at least 8 barcode digits (e.g. 13-digit EAN-13 or 12-digit UPC-A) to run the mathematical Modulo-10 check.',
      });
      return;
    }

    setIsCheckingMath(true);
    setBarcodeInput(cleanDigits);

    const res = verifyBarcodeProvenance(cleanDigits, declaredOrigin, mfgDetails);
    setVerificationResult(res);

    setTimeout(() => {
      setIsCheckingMath(false);
      if (res.isCheckDigitValid) {
        setDecodeNotice({
          type: 'success',
          message: `✓ Checksum Valid: Check digit (${res.actualCheckDigit}) matches calculated Modulo-10 (${res.calculatedCheckDigit}). Country: ${res.countryOfIssuance}.`,
        });
      } else {
        setDecodeNotice({
          type: 'error',
          message: `✗ Checksum Mismatch: Barcode ends with ${res.actualCheckDigit}, but Modulo-10 formula computed ${res.calculatedCheckDigit}! Damaged or invalid GTIN.`,
        });
      }
    }, 250);
  };

  // Apply quick test preset
  const applyPreset = (code: string, origin: string, mfg: string) => {
    setBarcodeInput(code);
    setDeclaredOrigin(origin);
    setMfgDetails(mfg);
    handleManualVerify(code);
  };

  // Retake / Resume Live Camera
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(cameraFacing);
  };

  // Initial camera mount
  useEffect(() => {
    startCamera('environment');
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {onBack && onSelectTool && (
        <ToolHeader
          currentTool="barcode"
          title="Barcode & Origin Verifier"
          subtitle="Real-time camera scanner, Modulo-10 checksum math, and GS1 member country origin cross-matching."
          statutoryReference="Rule 6(1)(n) / GS1 Spec"
          onBack={onBack}
          onSelectTool={onSelectTool}
        />
      )}

      {/* Hidden processing canvas & file input */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              setCapturedImage(dataUrl);
              processImageData(dataUrl);
            };
            reader.readAsDataURL(file);
          }
        }}
      />

      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                Rule 6(1)(n) &amp; Section 36
              </span>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                GS1 Modulo-10 Math Engine
              </span>
              <span className="rounded-md bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                Live Camera
              </span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Barcode className="h-6 w-6 text-blue-600" />
              Packaging Barcode &amp; Origin Cross-Verifier
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Snap a picture of the physical barcode from your camera in real time. The engine calculates the Modulo-10 checksum and flags illegal mismatches between the allocated GS1 member country and printed packaging origin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSourceMode('upload');
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              Upload Saved Photo
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid gap-6 lg:grid-cols-12 w-full max-w-full min-w-0">
        {/* Left Column: Real-Time Scanning Camera Viewfinder & Mode Switcher */}
        <div className="space-y-4 lg:col-span-6 w-full max-w-full min-w-0">
          {/* Mode Switcher Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('camera');
                  if (!isCameraActive && !capturedImage) {
                    startCamera(cameraFacing);
                  }
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  sourceMode === 'camera'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                <span>Live Camera Viewfinder</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode('upload');
                  stopCamera();
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>Upload From Gallery</span>
              </button>
            </div>
          </div>

          {/* Camera Viewfinder Mode */}
          {sourceMode === 'camera' ? (
            <div
              className="relative w-full aspect-[4/4.5] sm:aspect-square bg-black rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 select-none cursor-pointer"
              onClick={() => {
                if (!isCameraActive && !capturedImage) {
                  startCamera(cameraFacing);
                }
              }}
            >
              {/* White Shutter Flash Effect */}
              {isFlashing && (
                <div className="absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-150 opacity-95" />
              )}

              {/* Full-bleed Video Feed / Captured Snapshot */}
              {capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Captured Barcode Snapshot"
                  className="absolute inset-0 w-full h-full object-contain bg-black z-10"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-200 ${
                    zoomLevel === 2.0 ? 'scale-150' : 'scale-100'
                  }`}
                />
              )}

              {/* Inactive Standby Screen with graceful user activation */}
              {!isCameraActive && !capturedImage && (
                <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white space-y-3 z-20">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 transition-transform hover:scale-105 shadow-inner">
                    <Camera className="w-7 h-7 stroke-[1.5]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">Tap to Open Scanner Camera</p>
                    <p className="text-xs text-neutral-400 max-w-xs">
                      Center the packaging barcode or GTIN label inside the lens
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startCamera(cameraFacing);
                    }}
                    className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-lg shadow-indigo-900/40 transition-all cursor-pointer pointer-events-auto"
                  >
                    Start Camera Viewfinder
                  </button>
                  {cameraError && (
                    <div className="text-xs text-rose-300 max-w-xs bg-rose-950/70 px-3.5 py-2 rounded-xl border border-rose-800/60 mt-2">
                      {cameraError}
                    </div>
                  )}
                </div>
              )}

              {/* Top Camera HUD Overlay */}
              <div className="absolute top-3.5 inset-x-3.5 z-30 flex items-center justify-between pointer-events-none">
                {/* Left: Active Aiming Target Badge */}
                <div className="pointer-events-auto bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white/90 text-xs font-medium flex items-center gap-2 border border-white/15 shadow-sm">
                  <span className={`w-2 h-2 rounded-full ${capturedImage ? 'bg-indigo-400' : 'bg-indigo-500 animate-pulse'}`} />
                  <span className="font-semibold">
                    {capturedImage ? 'Captured Barcode Snapshot' : 'Barcode & Origin Scanner'}
                  </span>
                </div>

                {/* Right: Camera Action Buttons */}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  {hasTorch && !capturedImage && isCameraActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTorch();
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border border-white/15 transition-colors cursor-pointer ${
                        isTorchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-black/60 hover:bg-black/80 text-white/80 hover:text-white'
                      }`}
                      title="Toggle Flashlight / Torch"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!capturedImage && isCameraActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        flipCamera();
                      }}
                      className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Flip Camera (Front/Back)"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isCameraActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopCamera();
                      }}
                      className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Close Camera"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Floating Zoom Controls (1x, 2x) */}
              {!capturedImage && isCameraActive && (
                <div className="absolute bottom-24 inset-x-0 flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full p-1 flex items-center gap-1 border border-white/15 shadow-md">
                    {[1.0, 2.0].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomLevel(lvl);
                        }}
                        className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                          zoomLevel === lvl ? 'bg-amber-300 text-black font-bold shadow-xs' : 'text-white/75 hover:text-white'
                        }`}
                      >
                        {lvl === 1.0 ? '1x' : '2x'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyzing / Decoding Overlay */}
              {isAnalyzingImage && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-40">
                  <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
                  <span className="text-xs font-bold text-white tracking-wide">
                    Decoding GS1 Modulo-10 Barcode...
                  </span>
                </div>
              )}

              {/* Decode Notice Overlay inside viewfinder */}
              {decodeNotice && (
                <div className="absolute top-16 inset-x-4 z-40 flex justify-center pointer-events-none">
                  <div
                    className={`text-xs px-3.5 py-2 rounded-xl shadow-lg backdrop-blur-md max-w-sm text-center border ${
                      decodeNotice.type === 'success'
                        ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                        : decodeNotice.type === 'error'
                        ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                        : 'bg-amber-950/90 border-amber-800 text-amber-200'
                    }`}
                  >
                    {decodeNotice.message}
                  </div>
                </div>
              )}

              {/* Transparent Floating Bottom Camera Bar with Iconic Smartphone Shutter */}
              <div className="absolute bottom-0 inset-x-0 z-30 px-6 py-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between pointer-events-none">
                {/* Left Spacer to preserve center shutter alignment */}
                <div className="w-11" />

                {/* Center: Iconic Camera Shutter Button or Retake Button */}
                <div className="pointer-events-auto flex items-center justify-center">
                  {capturedImage ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetake();
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-black text-slate-900 shadow-xl hover:bg-slate-100 transition-all active:scale-95 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-600" />
                      Retake Photo
                    </button>
                  ) : (
                    <button
                      type="button"
                      id="btn-click-barcode-shutter"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCameraActive) {
                          capturePhotoAndAnalyze();
                        } else {
                          startCamera(cameraFacing);
                        }
                      }}
                      className="w-16 h-16 rounded-full border-4 border-white p-1 flex items-center justify-center transition-transform hover:scale-105 active:scale-90 cursor-pointer shadow-lg shadow-black/60"
                      title={isCameraActive ? 'Capture Picture & Verify Barcode' : 'Start Camera'}
                    >
                      <div className="w-full h-full rounded-full bg-white transition-opacity active:opacity-80" />
                    </button>
                  )}
                </div>

                {/* Right: Switch to Gallery / Upload */}
                <div className="pointer-events-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSourceMode('upload');
                      stopCamera();
                      setTimeout(() => fileInputRef.current?.click(), 100);
                    }}
                    className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xs text-white/90 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                    title="Switch to Photo Upload"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Upload Mode Container */
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/60 hover:bg-blue-50/30 space-y-3"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Upload Barcode Photograph
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Select a photograph of the 1D printed barcode on the packaging. The system will decode the GS1 digits and cross-verify with origin declarations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Select File from Device
                </button>
              </div>

              {isAnalyzingImage && (
                <div className="flex items-center justify-center gap-2.5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-800 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Scanning photograph with multi-resolution optical reader &amp; AI Vision...</span>
                </div>
              )}
            </div>
          )}

          {/* Manual Digits & Declared Origin Inputs Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-600" />
              Extracted Barcode &amp; Packaging Disclosures
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold uppercase tracking-wider text-slate-600">
                    Barcode Number (EAN-13 / GTIN)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {barcodeInput.replace(/\D/g, '').length} digits
                    {barcodeInput.replace(/\D/g, '').length === 13
                      ? ' (EAN-13)'
                      : barcodeInput.replace(/\D/g, '').length === 12
                      ? ' (UPC-A)'
                      : barcodeInput.replace(/\D/g, '').length === 8
                      ? ' (EAN-8)'
                      : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="e.g. 8901030924514"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleManualVerify()}
                    disabled={isCheckingMath}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 active:scale-95 transition-all shrink-0 flex items-center gap-1.5 shadow-sm shadow-blue-500/20 disabled:opacity-75 cursor-pointer"
                    title="Calculate GS1 Modulo-10 checksum and check issuing country"
                  >
                    {isCheckingMath ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking...</span>
                      </>
                    ) : (
                      <>
                        <Calculator className="w-3.5 h-3.5" />
                        <span>Run Math Check</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Decode or Verification Feedback Notice */}
                {decodeNotice && (
                  <div
                    className={`mt-2 flex items-start justify-between gap-2 rounded-lg p-2.5 text-xs font-medium border ${
                      decodeNotice.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : decodeNotice.type === 'error'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {decodeNotice.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : decodeNotice.type === 'error' ? (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>{decodeNotice.message}</span>
                    </div>
                    <button
                      onClick={() => setDecodeNotice(null)}
                      className="text-slate-400 hover:text-slate-600 text-sm font-bold px-1"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Instant Inline Math Check Verification Card */}
                {verificationResult && (
                  <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-blue-600" />
                        GS1 Modulo-10 Result:
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          verificationResult.isCheckDigitValid
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {verificationResult.isCheckDigitValid ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Valid Check Digit ({verificationResult.actualCheckDigit})
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Mismatch (Expected {verificationResult.calculatedCheckDigit}, Got {verificationResult.actualCheckDigit})
                          </>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500 block">GS1 Prefix:</span>
                        <strong className="text-slate-900 font-mono">
                          {verificationResult.prefix || 'N/A'} ({verificationResult.countryOfIssuance})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Provenance:</span>
                        <strong
                          className={
                            verificationResult.provenanceMatchStatus === 'VERIFIED_MATCH'
                              ? 'text-emerald-700'
                              : verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }
                        >
                          {verificationResult.provenanceMatchStatus === 'VERIFIED_MATCH'
                            ? '✓ Origin Matched'
                            : verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                            ? '✗ Discrepancy'
                            : 'Licensee / Import'}
                        </strong>
                      </div>
                    </div>

                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          document.getElementById('barcode-audit-report')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Step-by-Step Math Matrix</span>
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Declared Country of Origin on Packaging
                </label>
                <input
                  type="text"
                  value={declaredOrigin}
                  onChange={(e) => setDeclaredOrigin(e.target.value)}
                  placeholder="e.g. India, China, Vietnam"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Mandated text disclosure: &quot;Country of Origin: [Nation]&quot; or &quot;Made in [Nation]&quot;
                </span>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Manufacturer / Importer Address Declaration
                </label>
                <input
                  type="text"
                  value={mfgDetails}
                  onChange={(e) => setMfgDetails(e.target.value)}
                  placeholder="e.g. Regd. Office: Mumbai, Maharashtra, India"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                Quick Test Cases:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('8901030924514');
                    setDeclaredOrigin('India');
                    handleManualVerify('8901030924514');
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  🇮🇳 Valid India (890)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('6921234567890');
                    setDeclaredOrigin('India');
                    handleManualVerify('6921234567890');
                  }}
                  className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                >
                  🚨 Mismatch (692 vs India)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('8901030924519'); // Invalid check digit 9 instead of 4
                    setDeclaredOrigin('India');
                    handleManualVerify('8901030924519');
                  }}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 cursor-pointer"
                >
                  ⚠️ Checksum Failure
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Verification Results & GS1 Audit Report */}
        <div id="barcode-audit-report" className="space-y-4 lg:col-span-6 scroll-mt-6 w-full max-w-full min-w-0">
          {verificationResult ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              {/* Verdict Banner */}
              <div
                className={`rounded-xl border p-4.5 ${
                  verificationResult.provenanceMatchStatus === 'VERIFIED_MATCH'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                    ? 'border-rose-200 bg-rose-50 text-rose-950'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-3">
                  {verificationResult.provenanceMatchStatus === 'VERIFIED_MATCH' ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                  ) : verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH' ? (
                    <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold">
                        {verificationResult.provenanceMatchStatus === 'VERIFIED_MATCH'
                          ? 'GS1 Provenance Verified Match'
                          : verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                          ? 'Statutory Provenance Discrepancy'
                          : 'Third-Party Licensee / Importer Match'}
                      </h4>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          verificationResult.complianceVerdict === 'COMPLIANT'
                            ? 'bg-emerald-200 text-emerald-800'
                            : verificationResult.complianceVerdict === 'VIOLATION'
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-amber-200 text-amber-800'
                        }`}
                      >
                        {verificationResult.complianceVerdict}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed">
                      {verificationResult.observation}
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-[11px] text-slate-500 font-medium block">Barcode Symbology</span>
                  <p className="mt-0.5 text-base font-bold font-mono text-slate-900">
                    {verificationResult.symbology}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-[11px] text-slate-500 font-medium block">GS1 Country Prefix</span>
                  <p className="mt-0.5 text-base font-bold font-mono text-blue-600">
                    {verificationResult.prefix || 'N/A'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-slate-500 font-medium block">Issuing GS1 Member</span>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {verificationResult.countryOfIssuance}
                  </p>
                </div>
              </div>

              {/* Modulo-10 Check Digit Math Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-blue-600" />
                    GS1 Modulo-10 Checksum Verification
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      verificationResult.isCheckDigitValid ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {verificationResult.isCheckDigitValid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Checksum Valid
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" /> Checksum Invalid
                      </>
                    )}
                  </span>
                </div>

                <div className="rounded-lg bg-slate-50 p-3.5 font-mono text-xs space-y-2.5 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Calculated Modulo-10 Check Digit:</span>
                    <strong className="text-sm font-bold text-slate-900">
                      {verificationResult.calculatedCheckDigit}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Actual Printed Last Digit:</span>
                    <strong
                      className={`text-sm font-bold ${
                        verificationResult.isCheckDigitValid ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {verificationResult.actualCheckDigit}
                    </strong>
                  </div>

                  {/* Step-by-Step Mathematical Weighting Matrix */}
                  {verificationResult.mathBreakdown && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <span className="text-[11px] font-sans font-bold text-slate-700 block">
                        Positional Weighting Breakdown (GS1 Standard):
                      </span>
                      <div className="w-full max-w-full overflow-x-auto pb-1 min-w-0">
                        <table className="w-full text-center text-[10px] border-collapse min-w-0">
                          <thead>
                            <tr className="bg-slate-200/70 text-slate-600">
                              <th className="py-1 px-1 text-left font-sans">Row</th>
                              {verificationResult.mathBreakdown.digits.map((_, idx) => (
                                <th key={idx} className="py-1 px-1 font-mono">
                                  d{idx + 1}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-200 text-slate-800">
                              <td className="py-1 px-1 text-left font-sans font-semibold text-slate-500">Digit</td>
                              {verificationResult.mathBreakdown.digits.map((d, idx) => (
                                <td key={idx} className="py-1 px-1 font-bold">
                                  {d}
                                </td>
                              ))}
                            </tr>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <td className="py-1 px-1 text-left font-sans font-medium">Weight</td>
                              {verificationResult.mathBreakdown.weights.map((w, idx) => (
                                <td key={idx} className="py-1 px-1 text-blue-600 font-semibold">
                                  ×{w}
                                </td>
                              ))}
                            </tr>
                            <tr className="bg-blue-50/60 font-bold text-blue-950">
                              <td className="py-1 px-1 text-left font-sans text-blue-800">Product</td>
                              {verificationResult.mathBreakdown.products.map((p, idx) => (
                                <td key={idx} className="py-1 px-1">
                                  {p}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="rounded-md bg-white p-2.5 border border-slate-200 text-[11px] space-y-1 font-mono text-slate-700">
                        <div className="flex justify-between">
                          <span>Weighted Sum (Σ Products):</span>
                          <strong>{verificationResult.mathBreakdown.weightedSum}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Modulo 10 Remainder:</span>
                          <span>{verificationResult.mathBreakdown.weightedSum} % 10 = <strong>{verificationResult.mathBreakdown.moduloRemainder}</strong></span>
                        </div>
                        <div className="flex justify-between text-slate-900 font-bold">
                          <span>Check Digit Formula:</span>
                          <span>(10 - {verificationResult.mathBreakdown.moduloRemainder}) % 10 = <strong>{verificationResult.mathBreakdown.calculatedCheckDigit}</strong></span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] font-sans text-slate-500 pt-1 border-t border-slate-200">
                    Computed via alternating 3x and 1x positional weights modulo 10 according to GS1 General Specifications. A check digit mismatch indicates an invalid, counterfeit, or misprinted barcode.
                  </p>
                </div>
              </div>

              {/* Origin Provenance Cross-Reference Box */}
              <div className="rounded-xl border border-slate-200 p-4.5 bg-slate-50/50 space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Cross-Reference Analysis Matrix
                </h5>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block mb-0.5">Declared on Physical Carton:</span>
                    <strong className="text-slate-900 text-sm block">
                      {declaredOrigin || 'Not Specified'}
                    </strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block mb-0.5">Allocated GS1 Country:</span>
                    <strong className="text-slate-900 text-sm block">
                      {verificationResult.countryOfIssuance}
                    </strong>
                  </div>
                </div>

                {verificationResult.provenanceMatchStatus === 'SUSPECTED_MISMATCH' && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 space-y-1">
                    <strong className="block font-bold">Statutory Infraction:</strong>
                    <p>
                      The product claims origin in <strong>{declaredOrigin}</strong>, but carries a barcode registered under <strong>{verificationResult.countryOfIssuance}</strong> prefix without valid legal disclosures of imported status or licensed production under Rule 6(1)(a).
                    </p>
                  </div>
                )}
              </div>

              {/* Legal Reference Note */}
              <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>Governing Authority:</span>
                <span className="font-semibold text-slate-800">{verificationResult.legalCitation}</span>
              </div>
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              <Barcode className="h-10 w-10 text-slate-400 mb-2" />
              <span className="font-bold text-slate-700">No Barcode Verified Yet</span>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Click &quot;Click Picture &amp; Verify&quot; using your real-time camera above or enter numbers to inspect GS1 origin compliance.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
