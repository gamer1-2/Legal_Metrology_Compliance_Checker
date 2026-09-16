import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  Camera,
  Upload,
  ArrowRight,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Trash2,
  Building2,
  UserCheck,
  FileText,
  Package,
  DollarSign,
  Calendar,
  Phone,
  Scale,
  Eye,
  MapPin,
  Barcode,
  Check,
  ChevronRight,
  ZoomIn,
  Aperture,
  Power,
  Server,
  Wifi,
  Settings,
  Key,
} from 'lucide-react';
import { InspectionResult } from '../types/compliance';
import {
  analyzeProductImage,
  isNativeApkRuntime,
  getStoredBackendUrl,
  getApiBaseUrl,
} from '../services/complianceEngine';
import { optimizeImageForOcr } from '../utils/imageOptimizer';

interface ScannerViewProps {
  onScanComplete: (result: InspectionResult) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  recentInspections?: InspectionResult[];
  onSelectInspection?: (inspection: InspectionResult) => void;
  onViewAllHistory?: () => void;
  onOpenServerSettings?: () => void;
}

type IngestMode = 'camera' | 'upload';
type TargetSlot = 'pdp' | 'back' | 'side' | 'macro';

// Helper to generate automatically allocated Inspection Reference ID
const generateInspectionReferenceId = () => `INSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export const ScannerView: React.FC<ScannerViewProps> = ({
  onScanComplete,
  isScanning,
  setIsScanning,
  recentInspections = [],
  onSelectInspection,
  onViewAllHistory,
  onOpenServerSettings,
}) => {
  const [sourceMode, setSourceMode] = useState<IngestMode>('camera');

  // Multi-panel captured evidence (4 statutory slots + extra supporting angles)
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);
  const [macroImage, setMacroImage] = useState<string | null>(null);
  const [supportingImages, setSupportingImages] = useState<string[]>([]);
  const [activeSlot, setActiveSlot] = useState<TargetSlot>('pdp');

  // Inspection metadata - automatically allocated reference ID
  const [docketNumber, setDocketNumber] = useState<string>(() => generateInspectionReferenceId());
  const [officerName, setOfficerName] = useState<string>('Inspector, Quality & Compliance Wing');
  const [inspectionPremise, setInspectionPremise] = useState<string>('Retail Store / Warehouse Checkpoint');
  const [showMetadata, setShowMetadata] = useState<boolean>(false);

  // Camera stream controls
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(true);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  // Analysis progress & error feedback
  const [scanStep, setScanStep] = useState<string>('Initializing Scanner...');
  const [scanError, setScanError] = useState<string | null>(null);

  // Package metadata hints
  const [packageType, setPackageType] = useState<string>('RECTANGULAR_BOX');
  const [commodityCategory, setCommodityCategory] = useState<string>('FOOD_AND_BEVERAGES');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const takeNativePhoto = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 85,
        width: 1600,
        height: 1600,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (photo?.dataUrl) {
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 140);

        // Pre-optimize the photo immediately so UI state and memory remain lean
        const optimizedPhotoUrl = await optimizeImageForOcr(photo.dataUrl, 1600, 0.85);

        if (activeSlot === 'pdp') {
          setFrontImage(optimizedPhotoUrl);
          setCaptureNotice('Front Label captured! Moving to Back Panel.');
          setActiveSlot('back');
          setDocketNumber(generateInspectionReferenceId());
        } else if (activeSlot === 'back') {
          setBackImage(optimizedPhotoUrl);
          setCaptureNotice('Back Panel captured! Moving to Side / Flap Panel.');
          setActiveSlot('side');
        } else if (activeSlot === 'side') {
          setSideImage(optimizedPhotoUrl);
          setCaptureNotice('Side Panel captured! Moving to Close-Up Detail.');
          setActiveSlot('macro');
        } else {
          setMacroImage(optimizedPhotoUrl);
          setCaptureNotice('Close-Up Detail captured! All slots ready.');
        }
        setTimeout(() => setCaptureNotice(null), 3000);
      }
    } catch (err: any) {
      console.warn('Native camera capture skipped or error:', err);
    }
  };

  const startCamera = async (target: TargetSlot = 'pdp') => {
    setActiveSlot(target);
    setCameraError(null);
    setIsCameraActive(true);

    // 1. Native Android Permission check when running inside APK
    if (Capacitor.isNativePlatform()) {
      try {
        const check = await CapCamera.checkPermissions();
        if (check.camera !== 'granted') {
          const req = await CapCamera.requestPermissions({ permissions: ['camera'] });
          if (req.camera !== 'granted') {
            setCameraError(
              'Camera permission was not granted. Please allow Camera permission in your phone Settings > Apps.'
            );
            setIsCameraActive(false);
            return;
          }
        }
      } catch (capErr) {
        console.warn('Capacitor native permission check error:', capErr);
      }
    }

    if (
      streamRef.current &&
      streamRef.current.active &&
      streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
    ) {
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        try {
          await videoRef.current.play();
        } catch {
          // ignore play interruption
        }
      }
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
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
    } catch (err: any) {
      console.warn('High-res camera stream failed, falling back to standard video:', err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        if (Capacitor.isNativePlatform()) {
          setCameraError('Inline video not available. Tap to use System Camera.');
        } else {
          setCameraError(
            fallbackErr?.message || 'Unable to access camera device. Please check permissions or upload photos.'
          );
        }
        setIsCameraActive(false);
      }
    }
  };

  useEffect(() => {
    if (sourceMode === 'camera' && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [sourceMode, activeSlot, isCameraActive]);

  const selectSlotAndEnsureCamera = (slot: TargetSlot) => {
    setActiveSlot(slot);
    if (sourceMode === 'camera') {
      startCamera(slot);
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
  };

  const captureFrame = () => {
    if (Capacitor.isNativePlatform() && (!streamRef.current || !videoRef.current)) {
      takeNativePhoto();
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 140);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (zoomLevel > 1.0) {
      const cropWidth = width / zoomLevel;
      const cropHeight = height / zoomLevel;
      const startX = (width - cropWidth) / 2;
      const startY = (height - cropHeight) / 2;
      ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, width, height);
    } else {
      ctx.drawImage(video, 0, 0, width, height);
    }

    if (enhanceContrast) {
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;
        const contrast = 1.18;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < d.length; i += 4) {
          d[i] = factor * (d[i] - 128) + 128;
          d[i + 1] = factor * (d[i + 1] - 128) + 128;
          d[i + 2] = factor * (d[i + 2] - 128) + 128;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.warn('Contrast enhancement skipped:', err);
      }
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);

    if (activeSlot === 'pdp') {
      setFrontImage(dataUrl);
      setCaptureNotice('Front Label captured! Moving to Back Panel.');
      setActiveSlot('back');
      setDocketNumber(generateInspectionReferenceId());
    } else if (activeSlot === 'back') {
      setBackImage(dataUrl);
      setCaptureNotice('Back Panel captured! Moving to Side / Flap Panel.');
      setActiveSlot('side');
    } else if (activeSlot === 'side') {
      setSideImage(dataUrl);
      setCaptureNotice('Side Panel captured! Moving to Close-Up Detail.');
      setActiveSlot('macro');
    } else {
      setMacroImage(dataUrl);
      setCaptureNotice('Close-Up Detail captured! All slots ready.');
    }

    setTimeout(() => setCaptureNotice(null), 3000);
  };

  const runAnalysisWithImages = async (
    primaryImg: string,
    backImg?: string | null,
    sideImg?: string | null,
    macroImg?: string | null,
    referenceId?: string,
    extraImages?: string[]
  ) => {
    setScanError(null);
    setIsScanning(true);

    const allocatedId = referenceId || generateInspectionReferenceId();
    setDocketNumber(allocatedId);

    setScanStep('Optimizing packaging photos for rapid analysis...');
    const extrasToPass = extraImages ?? supportingImages;

    try {
      const [optPrimary, optBack, optSide, optMacro] = await Promise.all([
        optimizeImageForOcr(primaryImg, 1600, 0.85),
        backImg ? optimizeImageForOcr(backImg, 1600, 0.85) : Promise.resolve(undefined),
        sideImg ? optimizeImageForOcr(sideImg, 1600, 0.85) : Promise.resolve(undefined),
        macroImg ? optimizeImageForOcr(macroImg, 1600, 0.85) : Promise.resolve(undefined),
      ]);

      setScanStep('Reading packaging label with AI Vision...');
      const stepTimer1 = setTimeout(() => {
        setScanStep('Extracting Product Name, Net Weight, MRP & Unit Price...');
      }, 1200);
      const stepTimer2 = setTimeout(() => {
        setScanStep('Checking Dates, Manufacturer Address & Customer Care...');
      }, 2400);
      const stepTimer3 = setTimeout(() => {
        setScanStep('Verifying text size and readability across all mandatory features...');
      }, 3600);

      const result = await analyzeProductImage(
        optPrimary,
        optPrimary.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/jpeg',
        {
          category: commodityCategory,
          packageType,
          backPanelBase64: optBack && optBack !== optPrimary ? optBack : undefined,
          sidePanelBase64: optSide && optSide !== optPrimary ? optSide : undefined,
          macroBase64: optMacro && optMacro !== optPrimary ? optMacro : undefined,
          additionalImages: extrasToPass.length > 0 ? extrasToPass : undefined,
          inspectorInfo: {
            name: officerName,
            badgeId: allocatedId,
            jurisdiction: 'District Quality Wing',
            inspectionLocation: inspectionPremise,
          },
        }
      );

      // Ensure the automatically allocated reference ID and timestamp are attached to the result
      result.id = allocatedId;
      if (!result.timestamp) {
        result.timestamp = new Date().toISOString();
      }
      if (result.inspectorInfo) {
        result.inspectorInfo.badgeId = allocatedId;
      }

      result.images = {
        pdpImage: optPrimary,
        backPanelImage: optBack && optBack !== optPrimary ? optBack : undefined,
        sidePanelImage: optSide && optSide !== optPrimary ? optSide : undefined,
        mrpStampImage: optMacro && optMacro !== optPrimary ? optMacro : undefined,
        supportingImages: extrasToPass.length > 0 ? extrasToPass : undefined,
      };

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      onScanComplete(result);
    } catch (err: any) {
      console.error('Packaging audit error:', err);
      setScanError(
        err?.message ||
          'Failed to extract packaging label text. Please make sure the photo is sharp and well-lit, then try again.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    // Read and optimize all uploaded pictures concurrently
    const readPromises = fileList.map((file) => {
      return optimizeImageForOcr(file, 1600, 0.85);
    });

    try {
      const dataUrls = await Promise.all(readPromises);
      if (dataUrls.length === 0) return;

      let primary: string = dataUrls[0];
      let back: string | null = null;
      let side: string | null = null;
      let macro: string | null = null;
      let extras: string[] = [];

      if (dataUrls.length >= 4) {
        primary = dataUrls[0];
        back = dataUrls[1];
        side = dataUrls[2];
        macro = dataUrls[3];
        extras = dataUrls.slice(4);
        setFrontImage(dataUrls[0]);
        setBackImage(dataUrls[1]);
        setSideImage(dataUrls[2]);
        setMacroImage(dataUrls[3]);
        setSupportingImages(extras);
        setActiveSlot('macro');
      } else if (dataUrls.length === 3) {
        primary = dataUrls[0];
        back = dataUrls[1];
        side = dataUrls[2];
        setFrontImage(dataUrls[0]);
        setBackImage(dataUrls[1]);
        setSideImage(dataUrls[2]);
        setSupportingImages([]);
        setActiveSlot('side');
      } else if (dataUrls.length === 2) {
        primary = dataUrls[0];
        back = dataUrls[1];
        setFrontImage(dataUrls[0]);
        setBackImage(dataUrls[1]);
        setSupportingImages([]);
        setActiveSlot('back');
      } else {
        // 1 picture uploaded
        if (activeSlot === 'pdp' || !frontImage) {
          primary = dataUrls[0];
          setFrontImage(dataUrls[0]);
          back = backImage;
          side = sideImage;
          macro = macroImage;
          setActiveSlot('back');
        } else if (activeSlot === 'back') {
          primary = frontImage || dataUrls[0];
          back = dataUrls[0];
          setBackImage(dataUrls[0]);
          side = sideImage;
          macro = macroImage;
          setActiveSlot('side');
        } else if (activeSlot === 'side') {
          primary = frontImage || dataUrls[0];
          side = dataUrls[0];
          setSideImage(dataUrls[0]);
          back = backImage;
          macro = macroImage;
          setActiveSlot('macro');
        } else {
          primary = frontImage || dataUrls[0];
          macro = dataUrls[0];
          setMacroImage(dataUrls[0]);
          back = backImage;
          side = sideImage;
        }
      }

      // Automatically allocate fresh Inspection Reference ID
      const allocatedId = generateInspectionReferenceId();
      setDocketNumber(allocatedId);

      // Automatically proceed with the analysis of the product
      await runAnalysisWithImages(primary, back, side, macro, allocatedId, extras);
    } catch (err) {
      console.error('Packaging photo processing failed:', err);
      setScanError('Failed to read selected photos. Please try again.');
    } finally {
      e.target.value = '';
    }
  };

  const openUploaderFor = (slot?: TargetSlot) => {
    if (slot) setActiveSlot(slot);
    fileInputRef.current?.click();
  };

  const clearSlot = (slot: TargetSlot, e: React.MouseEvent) => {
    e.stopPropagation();
    if (slot === 'pdp') setFrontImage(null);
    if (slot === 'back') setBackImage(null);
    if (slot === 'side') setSideImage(null);
    if (slot === 'macro') setMacroImage(null);
  };

  const handleExecuteScan = async () => {
    const primaryImg = frontImage || backImage || sideImage || macroImage;
    if (!primaryImg) {
      setScanError('Please capture or upload at least one packaging image (Front Label, Back Panel, etc.).');
      return;
    }

    const allocatedId = generateInspectionReferenceId();
    setDocketNumber(allocatedId);

    await runAnalysisWithImages(
      primaryImg,
      backImage && backImage !== primaryImg ? backImage : undefined,
      sideImage && sideImage !== primaryImg ? sideImage : undefined,
      macroImage && macroImage !== primaryImg ? macroImage : undefined,
      allocatedId,
      supportingImages
    );
  };

  // List of all mandatory features checked by the app
  const mandatoryFeatures = [
    { name: 'Product Name & Category', icon: Package, desc: 'Common/generic commodity name' },
    { name: 'Net Quantity & Units', icon: Scale, desc: 'Statutory metric weight/volume (g, kg, ml, l)' },
    { name: 'MRP & Tax Statement', icon: DollarSign, desc: 'Max retail price with "inclusive of all taxes"' },
    { name: 'Unit Sale Price (USP)', icon: DollarSign, desc: 'Price per gram, ml, or piece' },
    { name: 'Mfg & Expiry Dates', icon: Calendar, desc: 'Month & year of packing & best before' },
    { name: 'Manufacturer Details', icon: MapPin, desc: 'Complete postal address with 6-digit PIN' },
    { name: 'Consumer Helpline', icon: Phone, desc: 'Toll-free number, email, and care office' },
    { name: 'Country of Origin', icon: Building2, desc: 'Declared country of manufacture/import' },
    { name: 'Text Readability', icon: Eye, desc: 'Clear contrast and legible font size' },
    { name: 'Batch & License Info', icon: Barcode, desc: 'Batch number & statutory license/barcode' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Hidden canvas for snapshot rendering */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Clean, Modern Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Packaging Compliance Scanner
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">
              Product Label Inspector
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Capture or upload packaging photographs to instantly inspect all mandatory product declarations, pricing, dates, and label standards.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>{showMetadata ? 'Hide Case Details' : 'Case Details'}</span>
            </button>
            <span className="text-xs font-mono font-bold px-3 py-2 rounded-xl bg-slate-900 text-white">
              {docketNumber}
            </span>
          </div>
        </div>

        {/* Optional Case Metadata */}
        {showMetadata && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Inspection Reference ID</label>
              <input
                type="text"
                value={docketNumber}
                onChange={(e) => setDocketNumber(e.target.value)}
                placeholder="Auto-allocated on inspection"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-medium mb-1">Premise / Store Name</label>
              <input
                type="text"
                value={inspectionPremise}
                onChange={(e) => setInspectionPremise(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-medium mb-1">Inspector Name</label>
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Quick History Access Strip (Synced with real investigations - top recent only) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${recentInspections.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
            <span className="text-xs font-bold text-slate-800 truncate">Quick History Access</span>
          </div>
          {recentInspections.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">Tap to load investigated case</span>
              {onViewAllHistory && (
                <button
                  onClick={onViewAllHistory}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer flex items-center gap-0.5"
                >
                  <span>All History ({recentInspections.length})</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 font-medium">Real investigation archive</span>
          )}
        </div>

        {recentInspections.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x items-stretch">
            {recentInspections.slice(0, 4).map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectInspection?.(item)}
                className="shrink-0 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 text-left transition-all cursor-pointer w-[210px] space-y-1.5 shadow-2xs group"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 truncate">{item.brandName || 'Product'}</span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                      item.overallVerdict === 'COMPLIANT'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.overallVerdict === 'SERIOUS_VIOLATION'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.overallVerdict === 'COMPLIANT' ? 'COMPLIANT' : 'VIOLATION'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                  {item.productName}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <span className="font-mono text-slate-400 truncate max-w-[100px]">{item.id}</span>
                  <span className="font-semibold text-slate-700 shrink-0">{item.complianceScore}% score</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-4 px-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-1">
            <p className="text-xs font-medium text-slate-700">No investigated products recorded yet</p>
            <p className="text-[11px] text-slate-400 max-w-md">
              Capture or upload packaging photos below to investigate a product. Real investigated records will automatically sync here.
            </p>
          </div>
        )}
      </div>

      {/* Main Scanner Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewfinder & Photos (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Mode Switcher */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSourceMode('camera');
                  startCamera(activeSlot);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  sourceMode === 'camera'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Live Viewfinder</span>
              </button>

              <button
                onClick={() => {
                  setSourceMode('upload');
                  stopCamera();
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Gallery / Files</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
          </div>

          {/* Packaging Evidence Slots */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Inspection Evidence Panels
                </span>
                <span className="hidden sm:inline-block text-[10px] font-semibold text-slate-400">
                  (4 Statutory Slots)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  {[frontImage, backImage, sideImage, macroImage].filter(Boolean).length} of 4 Staged
                </span>
                {[frontImage, backImage, sideImage, macroImage].some(Boolean) && (
                  <button
                    onClick={() => {
                      setFrontImage(null);
                      setBackImage(null);
                      setSideImage(null);
                      setMacroImage(null);
                      setSupportingImages([]);
                      setScanError(null);
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    title="Clear all staged photos"
                  >
                    Reset All
                  </button>
                )}
              </div>
            </div>

            {/* 4 Slots Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {/* Slot 1: Front PDP */}
              <button
                type="button"
                onClick={() => selectSlotAndEnsureCamera('pdp')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  activeSlot === 'pdp'
                    ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs ring-2 ring-emerald-500/20'
                    : frontImage
                    ? 'bg-white border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Slot 01</span>
                  {frontImage ? (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Captured
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      Primary
                    </span>
                  )}
                </div>

                {frontImage ? (
                  <div className="space-y-1.5 w-full">
                    <div className="relative w-full h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 group">
                      <img src={frontImage} alt="Front label" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => clearSlot('pdp', e)}
                        className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-600 hover:text-white text-slate-600 rounded-md transition-all shadow-xs cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate">Front Label</div>
                    <div className="text-[10px] text-emerald-600 font-medium truncate">Ready for audit</div>
                  </div>
                ) : (
                  <div className="space-y-1 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          activeSlot === 'pdp' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">Front Label</div>
                        <div className="text-[10px] text-slate-500 truncate">Product &amp; Net Wt</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 pt-1 border-t border-slate-100 truncate">
                      {activeSlot === 'pdp' ? '● Ready to shoot' : '+ Tap to select'}
                    </div>
                  </div>
                )}
              </button>

              {/* Slot 2: Back Panel */}
              <button
                type="button"
                onClick={() => selectSlotAndEnsureCamera('back')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  activeSlot === 'back'
                    ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs ring-2 ring-emerald-500/20'
                    : backImage
                    ? 'bg-white border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Slot 02</span>
                  {backImage ? (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Captured
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      Mandatory
                    </span>
                  )}
                </div>

                {backImage ? (
                  <div className="space-y-1.5 w-full">
                    <div className="relative w-full h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 group">
                      <img src={backImage} alt="Back panel" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => clearSlot('back', e)}
                        className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-600 hover:text-white text-slate-600 rounded-md transition-all shadow-xs cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate">Back Panel</div>
                    <div className="text-[10px] text-emerald-600 font-medium truncate">Ready for audit</div>
                  </div>
                ) : (
                  <div className="space-y-1 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          activeSlot === 'back' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">Back Panel</div>
                        <div className="text-[10px] text-slate-500 truncate">MRP, USP &amp; Mfg</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 pt-1 border-t border-slate-100 truncate">
                      {activeSlot === 'back' ? '● Ready to shoot' : '+ Tap to select'}
                    </div>
                  </div>
                )}
              </button>

              {/* Slot 3: Side / Flap */}
              <button
                type="button"
                onClick={() => selectSlotAndEnsureCamera('side')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  activeSlot === 'side'
                    ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs ring-2 ring-emerald-500/20'
                    : sideImage
                    ? 'bg-white border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Slot 03</span>
                  {sideImage ? (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Captured
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      Declarations
                    </span>
                  )}
                </div>

                {sideImage ? (
                  <div className="space-y-1.5 w-full">
                    <div className="relative w-full h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 group">
                      <img src={sideImage} alt="Side panel" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => clearSlot('side', e)}
                        className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-600 hover:text-white text-slate-600 rounded-md transition-all shadow-xs cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate">Side / Flap</div>
                    <div className="text-[10px] text-emerald-600 font-medium truncate">Ready for audit</div>
                  </div>
                ) : (
                  <div className="space-y-1 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          activeSlot === 'side' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Barcode className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">Side / Flap</div>
                        <div className="text-[10px] text-slate-500 truncate">Care, Lic &amp; Barcode</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 pt-1 border-t border-slate-100 truncate">
                      {activeSlot === 'side' ? '● Ready to shoot' : '+ Tap to select'}
                    </div>
                  </div>
                )}
              </button>

              {/* Slot 4: Macro Close-Up */}
              <button
                type="button"
                onClick={() => selectSlotAndEnsureCamera('macro')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  activeSlot === 'macro'
                    ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs ring-2 ring-emerald-500/20'
                    : macroImage
                    ? 'bg-white border-emerald-300 hover:border-emerald-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Slot 04</span>
                  {macroImage ? (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Check className="w-2.5 h-2.5 stroke-[3]" /> Captured
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      Forensic
                    </span>
                  )}
                </div>

                {macroImage ? (
                  <div className="space-y-1.5 w-full">
                    <div className="relative w-full h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 group">
                      <img src={macroImage} alt="Macro close-up" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => clearSlot('macro', e)}
                        className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-600 hover:text-white text-slate-600 rounded-md transition-all shadow-xs cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="font-bold text-xs text-slate-900 truncate">Close-Up Stamp</div>
                    <div className="text-[10px] text-emerald-600 font-medium truncate">Ready for audit</div>
                  </div>
                ) : (
                  <div className="space-y-1 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          activeSlot === 'macro' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">Close-Up Stamp</div>
                        <div className="text-[10px] text-slate-500 truncate">Date &amp; Batch Seals</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 pt-1 border-t border-slate-100 truncate">
                      {activeSlot === 'macro' ? '● Ready to shoot' : '+ Tap to select'}
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Camera Viewfinder */}
          {sourceMode === 'camera' && (
            <div
              className="relative w-full aspect-[4/4.5] bg-black rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 select-none cursor-pointer"
              onClick={() => {
                if (!isCameraActive) {
                  startCamera(activeSlot);
                }
              }}
            >
              {/* Shutter Flash effect */}
              {isFlashing && (
                <div className="absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150 opacity-95" />
              )}

              {/* Full-bleed Live Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transition-transform duration-200 ${
                  zoomLevel === 1.5 ? 'scale-125' : zoomLevel === 2.0 ? 'scale-150' : zoomLevel === 3.0 ? 'scale-200' : 'scale-100'
                }`}
              />

              {/* Camera Top Bar */}
              {isCameraActive && (
                <div className="absolute top-3.5 inset-x-3.5 z-30 flex items-center justify-between pointer-events-none">
                  {/* Active Target Indicator */}
                  <div className="pointer-events-auto bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white/90 text-xs font-medium flex items-center gap-2 border border-white/10 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>
                      {activeSlot === 'pdp'
                        ? 'Front Label (PDP)'
                        : activeSlot === 'back'
                        ? 'Back Panel'
                        : activeSlot === 'side'
                        ? 'Side / Flap'
                        : 'Close-Up Detail'}
                    </span>
                  </div>

                  {/* Turn Off / Pause Camera */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      stopCamera();
                    }}
                    className="pointer-events-auto w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Turn off camera"
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Classic Smartphone Focus Box */}
              {isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-24 h-24 border border-amber-300/80 rounded-md relative flex items-center justify-center transition-all animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-1.5 h-1.5 bg-amber-300/80 rounded-full" />
                    {/* Subtle Reticle Ticks */}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-0.5 bg-amber-300/80" />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-0.5 bg-amber-300/80" />
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-0.5 bg-amber-300/80" />
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 h-2 w-0.5 bg-amber-300/80" />
                  </div>
                </div>
              )}

              {/* Floating On-Screen Zoom Controls (Directly above shutter button) */}
              {isCameraActive && (
                <div className="absolute bottom-24 inset-x-0 flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full p-1 flex items-center gap-1 border border-white/15 shadow-md">
                    {[1.0, 2.0].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomLevel(level);
                        }}
                        className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                          zoomLevel === level
                            ? 'bg-amber-300 text-black font-bold shadow-xs'
                            : 'text-white/75 hover:text-white'
                        }`}
                      >
                        {level === 1.0 ? '1x' : '2x'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Floating capture notification */}
              {captureNotice && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md text-neutral-900 text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-neutral-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="whitespace-nowrap">{captureNotice}</span>
                </div>
              )}

              {/* Inactive Camera Screen (Clean, Simple & Aesthetic) */}
              {!isCameraActive && (
                <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white space-y-3 z-20">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 transition-transform hover:scale-105">
                    <Camera className="w-7 h-7 stroke-[1.5]" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">Tap to Open Camera</p>
                    <p className="text-xs text-neutral-400">
                      {activeSlot === 'pdp'
                        ? 'Slot 1: Front Label (PDP)'
                        : activeSlot === 'back'
                        ? 'Slot 2: Back Panel'
                        : activeSlot === 'side'
                        ? 'Slot 3: Side / Flap'
                        : 'Slot 4: Close-Up Detail'}
                    </p>
                  </div>

                  {cameraError && (
                    <div className="space-y-2 flex flex-col items-center">
                      <div className="text-xs text-rose-300 max-w-xs bg-rose-950/50 px-3 py-2 rounded-xl border border-rose-800/60">
                        {cameraError}
                      </div>
                      {Capacitor.isNativePlatform() && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            takeNativePhoto();
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer pointer-events-auto"
                        >
                          Use System Camera
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Transparent Floating Bottom Camera Bar */}
              <div className="absolute bottom-0 inset-x-0 z-30 px-8 py-5 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex items-center justify-center pointer-events-none">
                {/* Center: Iconic Camera Shutter Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCameraActive) {
                      captureFrame();
                    } else {
                      startCamera(activeSlot);
                    }
                  }}
                  className="pointer-events-auto w-16 h-16 rounded-full border-4 border-white p-1 flex items-center justify-center transition-transform hover:scale-105 active:scale-90 cursor-pointer shadow-lg shadow-black/60"
                  title={isCameraActive ? 'Capture Photo' : 'Open Camera'}
                >
                  <div className="w-full h-full rounded-full bg-white transition-opacity active:opacity-80" />
                </button>

                {/* Right: Switch to Gallery / Upload */}
                <div className="absolute right-8 flex items-center justify-center pointer-events-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSourceMode('upload');
                      stopCamera();
                    }}
                    className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-xs text-white/90 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                    title="Switch to Photo Upload"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload Mode */}
          {sourceMode === 'upload' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div
                onClick={() => openUploaderFor()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/60 hover:bg-emerald-50/30 space-y-3"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Upload Packaging Photographs
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Select all clicked pictures at once from your device (Front Label, Back Panel, and Close-Up). The system will stage the panels and proceed directly with compliance analysis.
                  </p>
                </div>
                <button
                  type="button"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Upload Pictures at Once
                </button>
              </div>
            </div>
          )}

          {/* Category & Packaging Type Selection */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Product Category</label>
              <select
                value={commodityCategory}
                onChange={(e) => setCommodityCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="FOOD_AND_BEVERAGES">Food &amp; Edible Commodities</option>
                <option value="PERSONAL_CARE">Personal Care &amp; Cosmetics</option>
                <option value="HOUSEHOLD">Household Goods &amp; Cleaning</option>
                <option value="ELECTRONICS">Electronics &amp; Appliances</option>
                <option value="COMMODITIES">General Industrial / Agri Goods</option>
                <option value="PHARMA_OTC">Over-The-Counter Healthcare</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Packaging Form</label>
              <select
                value={packageType}
                onChange={(e) => setPackageType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="RECTANGULAR_BOX">Carton / Folding Box</option>
                <option value="POUCH_OR_SACHET">Pouch / Sachet</option>
                <option value="BOTTLE_OR_CAN">Bottle / Can</option>
                <option value="TUBE">Paste / Cream Tube</option>
                <option value="WRAPPER">Flow-Wrap / Overwrap</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Evidence Preview & Mandatory Features (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                STAGED PACKAGING PHOTOS
              </span>
              {onOpenServerSettings && (
                <button
                  type="button"
                  onClick={onOpenServerSettings}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer border border-slate-200"
                  title="Configure Backend Server"
                >
                  <Server className="w-2.5 h-2.5 text-emerald-600" />
                  <span className="truncate max-w-[120px]">
                    {getStoredBackendUrl() ? getStoredBackendUrl().replace(/^https?:\/\//, '') : isNativeApkRuntime() ? 'USB / Localhost' : 'Sandbox Ready'}
                  </span>
                </button>
              )}
            </div>

            {/* Evidence Display */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center p-3 aspect-4/5 relative">
              {frontImage || backImage || sideImage || macroImage ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <img
                    src={
                      activeSlot === 'pdp' && frontImage
                        ? frontImage
                        : activeSlot === 'back' && backImage
                        ? backImage
                        : activeSlot === 'side' && sideImage
                        ? sideImage
                        : activeSlot === 'macro' && macroImage
                        ? macroImage
                        : frontImage || backImage || sideImage || macroImage || ''
                    }
                    alt="Packaging preview"
                    className="max-h-[75%] max-w-full object-contain rounded-xl shadow-xs"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {frontImage && (
                      <button
                        type="button"
                        onClick={() => setActiveSlot('pdp')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all ${
                          activeSlot === 'pdp'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Front Label
                      </button>
                    )}
                    {backImage && (
                      <button
                        type="button"
                        onClick={() => setActiveSlot('back')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all ${
                          activeSlot === 'back'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Back Panel
                      </button>
                    )}
                    {sideImage && (
                      <button
                        type="button"
                        onClick={() => setActiveSlot('side')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all ${
                          activeSlot === 'side'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Side / Flap
                      </button>
                    )}
                    {macroImage && (
                      <button
                        type="button"
                        onClick={() => setActiveSlot('macro')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all ${
                          activeSlot === 'macro'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Close-Up
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-400 space-y-2 p-6">
                  <ImageIcon className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-700">No Photo Staged</p>
                  <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto leading-relaxed">
                    Capture or upload product photos using the viewfinder on the left.
                  </p>
                </div>
              )}
            </div>

            {/* Error Display */}
            {scanError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    {scanError.includes('GEMINI_API_KEY')
                      ? 'Server Connected: Gemini API Key Required'
                      : scanError.includes('503') ||
                        scanError.toLowerCase().includes('high demand') ||
                        scanError.toLowerCase().includes('unavailable')
                      ? 'AI Vision Service High Demand'
                      : scanError.toLowerCase().includes('timeout')
                      ? 'Connection Timed Out'
                      : scanError.includes('APK_SANDBOX_AUTH_REDIRECT') || scanError.includes('status 200')
                      ? 'Android APK: Server Connection Required'
                      : 'Scan Notice'}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-rose-800">
                  {scanError.includes('GEMINI_API_KEY')
                    ? 'Your phone is successfully connected to your PC server! To enable AI label inspection, your PC needs a GEMINI_API_KEY in its .env file.'
                    : scanError.includes('503') ||
                      scanError.toLowerCase().includes('high demand') ||
                      scanError.toLowerCase().includes('unavailable')
                    ? 'Google Gemini AI servers are currently experiencing a brief traffic surge. The app has switched to resilient high-availability fallback models. Tap "Retry Scan" to analyze your packaging now.'
                    : scanError.toLowerCase().includes('timeout')
                    ? 'The analysis request timed out waiting for the server. Packaging photos are now automatically compressed for fast transfer. Please check that your PC server is running ("npm run dev") and your phone is on the same Wi-Fi network.'
                    : scanError.includes('APK_SANDBOX_AUTH_REDIRECT') || scanError.includes('status 200')
                    ? 'The standalone Android APK cannot connect to the cloud development sandbox directly (login redirect). Please point the app to the backend server running on your computer or a deployed host.'
                    : scanError}
                </p>

                {/* Show server connected badge on upstream AI errors */}
                {(scanError.includes('503') ||
                  scanError.toLowerCase().includes('high demand') ||
                  scanError.toLowerCase().includes('unavailable')) && (
                  <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between text-[11px] text-emerald-800">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Phone connected to server successfully</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-100/80 px-2 py-0.5 rounded">Backend Online</span>
                  </div>
                )}

                {scanError.includes('GEMINI_API_KEY') ? (
                  <div className="p-3 bg-white/90 rounded-lg border border-amber-200 space-y-2 text-[11px] text-slate-700">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-600" />
                      <span>How to add your API key on your PC:</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-slate-600">
                      <p>
                        1. In your project folder on your PC, create or open <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-800">.env</code>
                      </p>
                      <p>
                        2. Add this line with your key:
                      </p>
                      <div className="bg-slate-900 text-emerald-400 p-2 rounded font-mono text-[10px] select-all">
                        GEMINI_API_KEY=your_gemini_api_key_here
                      </div>
                      <p>
                        3. Restart the dev server on your PC: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-800">npm run dev</code>
                      </p>
                    </div>
                  </div>
                ) : (scanError.includes('APK_SANDBOX_AUTH_REDIRECT') ||
                  scanError.includes('status 200') ||
                  scanError.includes('Failed to fetch') ||
                  scanError.includes('NetworkError') ||
                  scanError.includes('ECONNREFUSED')) ? (
                  <div className="p-2.5 bg-white/80 rounded-lg border border-rose-200 space-y-1 text-[11px] text-slate-700">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Server className="w-3 h-3 text-emerald-600" />
                      <span>Quick Local Setup (USB or Wi-Fi):</span>
                    </div>
                    <p className="text-[10px] text-slate-600">
                      1. On your PC, start server: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">npm run dev</code>
                    </p>
                    <p className="text-[10px] text-slate-600">
                      2. If using USB: run <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">adb reverse tcp:3000 tcp:3000</code> then set URL to <strong className="text-slate-800">http://localhost:3000</strong>
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onOpenServerSettings && (
                    <button
                      type="button"
                      onClick={onOpenServerSettings}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Configure Server URL</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExecuteScan}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Retry Scan
                  </button>
                </div>
              </div>
            )}

            {/* Main Action Button */}
            <button
              onClick={handleExecuteScan}
              disabled={isScanning}
              className="w-full py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-xs">{scanStep}</span>
                </>
              ) : (
                <>
                  <span>Inspect Packaging Now</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Mandatory Features Checklist Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Mandatory Packaging Checks
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                10 Automated Checks
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {mandatoryFeatures.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate text-[11px]">{item.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
