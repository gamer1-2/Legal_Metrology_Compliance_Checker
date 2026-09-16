import React, { useState, useRef, useEffect } from 'react';
import {
  QrCode,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Globe,
  Upload,
  RotateCcw,
  Zap,
  SwitchCamera,
  ShieldCheck,
  FileCheck,
  ShieldAlert,
  Search,
  Power,
  Check,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  decodeQrFromImage,
  verifyLiveQrEndpoint,
  evaluateLmpcQrExemption,
} from '../utils/qrEngine';
import { SmartQrVerificationResult } from '../types/compliance';
import { ToolHeader } from './tools/ToolHeader';
import { AppPage } from './Sidebar';

export interface SmartQrAuditorViewProps {
  onBack?: () => void;
  onSelectTool?: (tool: AppPage) => void;
}

export const SmartQrAuditorView: React.FC<SmartQrAuditorViewProps> = ({
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
  const [decodeMessage, setDecodeMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Captured snapshot state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isDecodingQr, setIsDecodingQr] = useState(false);

  // QR Payload & Live Audit State
  const [qrPayload, setQrPayload] = useState('https://amul.com/trace/taaza');
  const [isCrawlingUrl, setIsCrawlingUrl] = useState(false);
  const [liveAuditResult, setLiveAuditResult] = useState<{
    tested: boolean;
    ok: boolean;
    httpStatus: number;
    isAccessible: boolean;
    detectedDeclarations: {
      manufacturerNameAndAddress: boolean;
      commonGenericName: boolean;
      sizeAndDimensions: boolean;
      countryOfOrigin: boolean;
      consumerCareDetails: boolean;
      warrantyOrCustomerGuide: boolean;
    };
    sampleSnippet?: string;
    error?: string;
  } | null>(null);

  // Exemption Evaluation State
  const [exemptionResult, setExemptionResult] = useState<SmartQrVerificationResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start Real-Time Camera Stream
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    setCameraError(null);
    stopCamera();

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

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : null;
      if (capabilities && 'torch' in capabilities) {
        setHasTorch(true);
      } else {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.warn('Standard video stream failed, trying basic video:', err);
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
          fallbackErr?.message || 'Unable to access camera. Please allow permissions or upload QR code photo.'
        );
        setIsCameraActive(false);
      }
    }
  };

  const stopCamera = () => {
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

  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  // Click / Snap Picture from Real-Time Camera
  const capturePhotoAndAnalyze = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

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
        console.warn('Native capture cancelled:', err);
      } finally {
        setIsCapturing(false);
      }
      return;
    }

    if (!videoRef.current || !canvasRef.current) {
      setIsCapturing(false);
      return;
    }

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
    setIsDecodingQr(true);
    setDecodeMessage(null);
    try {
      const decoded = await decodeQrFromImage(dataUrl);
      if (decoded && decoded.rawPayload) {
        setQrPayload(decoded.rawPayload);

        // If URL, immediately audit live
        if (decoded.payloadType === 'URL' || decoded.payloadType === 'GS1_DIGITAL_LINK') {
          handleCrawlLiveUrl(decoded.rawPayload);
        }
      } else {
        setDecodeMessage('Could not decode QR code from this snapshot. Please ensure the QR code is clear, well-lit, and in focus.');
      }
    } catch (err) {
      console.warn('QR decode error:', err);
    } finally {
      setIsDecodingQr(false);
    }
  };

  // Live URL Crawler Trigger
  const handleCrawlLiveUrl = async (urlToCrawl?: string) => {
    const targetUrl = urlToCrawl || qrPayload;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      setDecodeMessage('Please provide a valid HTTP or HTTPS destination URL.');
      return;
    }

    setIsCrawlingUrl(true);
    setDecodeMessage(null);
    try {
      const liveData = await verifyLiveQrEndpoint(targetUrl);
      setLiveAuditResult({
        tested: true,
        ok: liveData.ok,
        httpStatus: liveData.httpStatus,
        isAccessible: liveData.isAccessible,
        detectedDeclarations: liveData.detectedDeclarations,
        sampleSnippet: liveData.sampleText,
        error: liveData.error,
      });

      // Also evaluate statutory exemption status
      const exemption = evaluateLmpcQrExemption(targetUrl, {}, 'ELECTRONIC_GOODS');
      setExemptionResult(exemption);
    } catch (err: any) {
      setLiveAuditResult({
        tested: true,
        ok: false,
        httpStatus: 0,
        isAccessible: false,
        detectedDeclarations: {
          manufacturerNameAndAddress: false,
          commonGenericName: false,
          sizeAndDimensions: false,
          countryOfOrigin: false,
          consumerCareDetails: false,
          warrantyOrCustomerGuide: false,
        },
        error: err?.message || 'Network connection failed',
      });
    } finally {
      setIsCrawlingUrl(false);
    }
  };

  // Quick preset loader
  const applyPresetLink = (url: string) => {
    setQrPayload(url);
    handleCrawlLiveUrl(url);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setDecodeMessage(null);
    startCamera(cameraFacing);
  };

  useEffect(() => {
    startCamera('environment');
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-6">
      {onBack && onSelectTool && (
        <ToolHeader
          currentTool="qr"
          title="Smart QR & Exemption Auditor"
          subtitle="Real-time camera QR scanner, endpoint crawler, and electronic goods digital label exemption audit under G.S.R. 540(E)."
          statutoryReference="G.S.R. 540(E) / Rule 6(1)"
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
              <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Notification G.S.R. 540(E)
              </span>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Digital Shelf Web Crawler
              </span>
              <span className="rounded-md bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                Live Camera
              </span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <QrCode className="h-6 w-6 text-indigo-600" />
              Smart QR &amp; 2022 Digital Declaration Auditor
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Snap a picture of the packaging QR code or GS1 Digital Link in real time. The engine checks compliance with Ministry of Consumer Affairs electronic disclosure exemptions, crawls destination landing pages, and enforces physical packaging safeguards.
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
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Real-Time Scanning Camera Viewfinder & Mode Switcher */}
        <div className="space-y-4 lg:col-span-6">
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
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
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
                <Upload className="w-3.5 h-3.5 text-indigo-400" />
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
                  alt="Captured QR Code Snapshot"
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
                      Center the packaging QR code or GS1 Digital Link inside the lens
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
                {/* Left: Active Target Badge */}
                <div className="pointer-events-auto bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white/90 text-xs font-medium flex items-center gap-2 border border-white/15 shadow-sm">
                  <span className={`w-2 h-2 rounded-full ${capturedImage ? 'bg-indigo-400' : 'bg-indigo-500 animate-pulse'}`} />
                  <span className="font-semibold">
                    {capturedImage ? 'Captured QR Snapshot' : 'QR & Digital Link Scanner'}
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

              {/* Decoding spinner / message overlay */}
              {isDecodingQr && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-40">
                  <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
                  <span className="text-xs font-bold text-white tracking-wide">
                    Reading QR Code Symbols &amp; URL...
                  </span>
                </div>
              )}

              {decodeMessage && (
                <div className="absolute top-16 inset-x-4 z-40 flex justify-center pointer-events-none">
                  <div className="bg-rose-950/90 border border-rose-800 text-rose-200 text-xs px-3.5 py-2 rounded-xl shadow-lg backdrop-blur-md max-w-sm text-center">
                    {decodeMessage}
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
                      id="btn-click-qr-shutter"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCameraActive) {
                          capturePhotoAndAnalyze();
                        } else {
                          startCamera(cameraFacing);
                        }
                      }}
                      className="w-16 h-16 rounded-full border-4 border-white p-1 flex items-center justify-center transition-transform hover:scale-105 active:scale-90 cursor-pointer shadow-lg shadow-black/60"
                      title={isCameraActive ? 'Capture Picture & Audit QR' : 'Start Camera'}
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
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/60 hover:bg-indigo-50/30 space-y-3"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Upload Packaging QR Photograph
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Select a photograph of the QR code or GS1 Digital Link on the product packaging. The system will decode the URL and run live electronic disclosure compliance audits.
                  </p>
                </div>
                <button
                  type="button"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Select File from Device
                </button>
              </div>
            </div>
          )}

          {/* QR Payload & Live Audit Input */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-indigo-600" />
              Decoded QR Target Webpage / GS1 Digital Link
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Destination Web URL / Digital Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={qrPayload}
                    onChange={(e) => setQrPayload(e.target.value)}
                    placeholder="https://brand.com/trace"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCrawlLiveUrl()}
                    disabled={isCrawlingUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isCrawlingUrl ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {isCrawlingUrl ? 'Crawling...' : 'Audit Live'}
                  </button>
                </div>
              </div>

              {/* Quick Preset Links */}
              <div className="border-t border-slate-100 pt-3">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  Test Live URLs:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      setQrPayload('https://amul.com/products');
                      handleCrawlLiveUrl('https://amul.com/products');
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Amul Products Directory
                  </button>
                  <button
                    onClick={() => {
                      setQrPayload('https://id.gs1.org/01/08901030924512');
                      handleCrawlLiveUrl('https://id.gs1.org/01/08901030924512');
                    }}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                  >
                    GS1 Digital Link URI
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Rules Summary Box */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4.5 text-xs text-slate-600 space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <FileCheck className="h-4 w-4 text-indigo-600" />
              Notification G.S.R. 540(E) Statutory Mandates
            </div>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-600">
              <li>
                <strong className="text-slate-800">Must Remain on Physical Carton:</strong> MRP (inclusive of all taxes), Net Quantity, Commodity Generic Name, Consumer Care contact.
              </li>
              <li>
                <strong className="text-slate-800">Permitted via QR Code:</strong> Detailed manufacturer/packer address, technical dimensions, country of origin, user manuals.
              </li>
              <li>
                <strong className="text-slate-800">Free Access Guarantee:</strong> The webpage must be publicly viewable without requiring sign-in, subscription, or mobile application downloads.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Web Crawler Audit Results */}
        <div className="space-y-4 lg:col-span-6">
          {liveAuditResult ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              {/* Verdict Status Banner */}
              <div
                className={`rounded-xl border p-4.5 ${
                  liveAuditResult.isAccessible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border-rose-200 bg-rose-50 text-rose-950'
                }`}
              >
                <div className="flex items-start gap-3">
                  {liveAuditResult.isAccessible ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold">
                        {liveAuditResult.isAccessible
                          ? `Destination Webpage Verified (HTTP ${liveAuditResult.httpStatus})`
                          : `Digital Shelf Destination Unreachable`}
                      </h4>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          liveAuditResult.isAccessible
                            ? 'bg-emerald-200 text-emerald-800'
                            : 'bg-rose-200 text-rose-800'
                        }`}
                      >
                        {liveAuditResult.isAccessible ? 'PUBLICLY ACCESSIBLE' : 'UNREACHABLE'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed">
                      {liveAuditResult.isAccessible
                        ? 'The destination page was successfully crawled live without paywalls or login barriers.'
                        : `Crawler failed to reach URL: ${liveAuditResult.error || 'Server error'}. Under G.S.R. 540(E), an inaccessible QR link constitutes non-compliance.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mandatory Digital Disclosures Found On Webpage */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Mandatory Declarations Crawled from Live Destination
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      label: 'Manufacturer / Packer Address',
                      present: liveAuditResult.detectedDeclarations.manufacturerNameAndAddress,
                    },
                    {
                      label: 'Commodity Generic Name',
                      present: liveAuditResult.detectedDeclarations.commonGenericName,
                    },
                    {
                      label: 'Technical Sizing / Dimensions',
                      present: liveAuditResult.detectedDeclarations.sizeAndDimensions,
                    },
                    {
                      label: 'Country of Origin Statement',
                      present: liveAuditResult.detectedDeclarations.countryOfOrigin,
                    },
                    {
                      label: 'Consumer Care / Helpline',
                      present: liveAuditResult.detectedDeclarations.consumerCareDetails,
                    },
                    {
                      label: 'User Manual / Warranty Terms',
                      present: liveAuditResult.detectedDeclarations.warrantyOrCustomerGuide,
                    },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                        item.present
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      {item.present ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Detected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <AlertTriangle className="h-3.5 w-3.5" /> Not Found
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Anti-Circumvention Physical Carton Safeguard Card */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4.5 text-xs text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Physical Carton Safeguard Audit (Anti-Circumvention)
                </div>
                <p className="leading-relaxed">
                  Even if the QR webpage contains exhaustive disclosures, remember: <strong>MRP, Net Quantity, and Commodity Generic Name MUST NOT be moved off the physical packaging</strong>. Check that they remain visibly printed on the outer carton.
                </p>
              </div>

              {/* Sample Snippet */}
              {liveAuditResult.sampleSnippet && (
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-slate-500">Live Crawled HTML Snippet:</span>
                  <p className="rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-700 border border-slate-200 line-clamp-4">
                    {liveAuditResult.sampleSnippet}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              <QrCode className="h-10 w-10 text-slate-400 mb-2" />
              <span className="font-bold text-slate-700">No QR Code Audited Yet</span>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Aim your camera at a QR code and click &quot;Click Picture &amp; Audit QR&quot; or click &quot;Audit Live&quot; on a web address above.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
