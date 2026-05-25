import React, { useState, useRef, useMemo, useEffect } from "react";
import { TableSummary, ThemeStyle, ExportSettings } from "./types";
import SummaryTable from "./components/SummaryTable";
import PDFPageCropper from "./components/PDFPageCropper";
import { toPng, toJpeg } from "html-to-image";
import JSZip from "jszip";
import { 
  UploadCloud, FileSpreadsheet, Download, RefreshCw, Sparkles, 
  PlusCircle, Search, Trash2, CheckCircle2, Sliders, Check, 
  AlertCircle, HelpCircle, FileText, FileUp, Database, ArrowRightLeft,
  X, Layers, Scissors
} from "lucide-react";

// Fallback demo summaries in case they want a live test right away
const SAMPLE_SUMMARIES: TableSummary[] = [
  {
    id: "sample-1",
    title: "Q4 Financial Summary & Balance Highlights",
    headers: ["Reporting Segment", "Annual Target", "Q4 Actuals", "Variance %", "Status"],
    rows: [
      ["Enterprise SaaS Revenue", "$14.20M", "$15.45M", "+8.8%", "Exceeded"],
      ["Professional Services", "$3.50M", "$3.12M", "-10.85%", "At Risk"],
      ["Consumer Self-Serve ARR", "$6.10M", "$6.42M", "+5.24%", "On Track"],
      ["Cost of Goods Sold (COGS)", "$4.80M", "$4.40M", "+8.33%", "Efficient"],
      ["Net Operating Income", "$5.20M", "$5.94M", "+14.23%", "Outstanding"]
    ],
    notes: "Variance calculations are compiled post-consolidation. SaaS gains driven primarily by multi-year commitment contracts."
  },
  {
    id: "sample-2",
    title: "Product Marketing Conversion Statistics",
    headers: ["Acquisition Channel", "Impressions", "Clicks", "CTR %", "Assigned CAC"],
    rows: [
      ["Organic Google Search", "364,500", "11,820", "3.24%", "$12.40"],
      ["Paid Retargeting Ads", "1,240,000", "18,450", "1.49%", "$48.50"],
      ["Weekly Tech Newsletter", "85,000", "3,140", "3.69%", "$18.20"],
      ["Community Referral Link", "42,000", "2,460", "5.86%", "$6.10"],
      ["Direct Inbound Access", "150,000", "9,800", "6.53%", "$0.00"]
    ],
    notes: "Newsletter click-through metrics include seasonal product campaign launches. Community referrals have achieved record-low client acquisition cost (CAC)."
  }
];

// Helper to convert ArrayBuffer to Base64 in standard environments
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default function App() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  // PDFjs documents client side state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  // Tracking on-demand AI table extraction per crop box
  const [extractingMap, setExtractingMap] = useState<Record<string, boolean>>({});

  // Custom states matching status info
  const [uploadedFileName, setUploadedFileName] = useState<string>("Quarterly_Audit_Final.pdf");
  const [uploadedFileSize, setUploadedFileSize] = useState<string>("4.2 MB");
  
  // Custom export configurations
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    scale: 3, // Ultra-sharp (3x) by default for pristine high-end clarity
    format: "png",
    theme: "classic"
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selector mappings
  const allSelected = useMemo(() => {
    return tables.length > 0 && selectedIds.size === tables.length;
  }, [tables, selectedIds]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tables.map(t => t.id)));
    }
  };

  const toggleSelectTable = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Mutate individual extracted table in local state
  const handleUpdateTable = (updated: TableSummary) => {
    setTables(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const onUpdateCropBoxes = (updatedBoxes: TableSummary[]) => {
    setTables(updatedBoxes);
  };

  const handleDeleteTable = (id: string) => {
    setTables(prev => prev.filter(t => t.id !== id));
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const handleAddNewTable = () => {
    const newId = `manual-table-${Date.now()}`;
    const newTable: TableSummary = {
      id: newId,
      title: `Table 0${tables.length + 1} — Projection Summary`,
      headers: ["Department", "Budget Cap", "YTD Spend", "Variance"],
      rows: [
        ["Product Engineering", "$450,000", "$442,500", "-1.6%"],
        ["Growth Marketing", "$280,000", "$291,400", "+4.0%"],
        ["Client Success", "$150,000", "$148,150", "-1.2%"]
      ],
      notes: "The values are auto-calculated on-demand driven by internal segment metrics."
    };
    setTables(prev => [...prev, newTable]);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(newId);
      return next;
    });
  };

  // Convert File object to Base64 schema & load inside PDF.js Client
  const handleUploadFile = (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setErrorStatus("Selected file format is invalid. Please drop or upload a standard PDF file.");
      return;
    }

    setUploadedFileName(file.name);
    const mbs = (file.size / (1024 * 1024)).toFixed(1);
    setUploadedFileSize(`${mbs} MB`);

    setIsLoading(true);
    setErrorStatus(null);
    setLoadingStep("Reading PDF document file structure...");

    const reader = new FileReader();
    reader.onerror = () => {
      setErrorStatus("Failed to correctly parse the uploaded file binary.");
      setIsLoading(false);
    };

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Convert to Base64 first while the ArrayBuffer is guaranteed intact and non-detached
        const base64Str = arrayBufferToBase64(arrayBuffer);

        // 1. Initialise and render on PDFJS vector layer
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error("PDF.js renderer failed to initialize. Please verify CDN script tags.");
        }
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

        setLoadingStep("Mounting vectorized document workspace...");
        // Pass a slice copy of the array buffer data to protect integrity of downstream references
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);

        // 2. Parse summaries using Gemini AI to automate bounding-box detection
        setLoadingStep("Invoking Gemini-3.5-flash table layout auto-detection...");
        await extractSummariesFromBase64(base64Str, file.name);
      } catch (err: any) {
        console.error("Reader load exception:", err);
        setErrorStatus(err.message || "Failed to initialize standard document parser.");
        setIsLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Call express backend to execute multi-modal extraction
  const extractSummariesFromBase64 = async (base64Data: string, fileName: string) => {
    try {
      const res = await fetch("/api/extract-tables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pdfBase64: base64Data })
      });

      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.error || "A server error occurred during extraction");
      }

      const parsed = await res.json();
      
      if (!parsed.tables || !Array.isArray(parsed.tables)) {
        throw new Error("Invalid response format received from extraction. No tables key present.");
      }

      if (parsed.tables.length === 0) {
        setErrorStatus("Gemini evaluated the PDF but did not detect any structured grids automatically. Click and drag on any page to crop elements manually!");
        setTables([]);
        setIsLoading(false);
        return;
      }

      // Add unique timestamp-based suffix
      const finalTables = parsed.tables.map((t: any, index: number) => ({
        ...t,
        id: t.id || `table-${index}-${Date.now()}`
      }));

      setTables(finalTables);
      setSelectedIds(new Set(finalTables.map((t: any) => t.id)));
    } catch (err: any) {
      console.error(err);
      setErrorStatus(err.message || "AI Layout evaluation timed out. You can still manually draw perfect crops anytime on the left page!");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleExtractTableFromImage = async (tableId: string) => {
    const tableToExtract = tables.find(t => t.id === tableId);
    if (!tableToExtract || !tableToExtract.croppedImageUrl) {
      alert("No cropped image is available for this table. Please wait for the page to render or adjust the cropped area.");
      return;
    }

    setExtractingMap(prev => ({ ...prev, [tableId]: true }));
    setErrorStatus(null);

    try {
      const res = await fetch("/api/extract-table-from-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ imageBase64: tableToExtract.croppedImageUrl })
      });

      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.error || "A server error occurred during table extraction");
      }

      const parsed = await res.json();
      
      const updatedTable: TableSummary = {
        ...tableToExtract,
        title: parsed.title || tableToExtract.title,
        headers: parsed.headers || [],
        rows: parsed.rows || [],
        notes: parsed.notes || tableToExtract.notes || "High precision table extracted verbatim via Gemini 3.5-flash."
      };

      handleUpdateTable(updatedTable);
    } catch (err: any) {
      console.error("Extracting from crop failed:", err);
      setErrorStatus(`Gemini Extraction Error: ${err.message || err}. Tip: Adjust the crop margins slightly and retry.`);
    } finally {
      setExtractingMap(prev => ({ ...prev, [tableId]: false }));
    }
  };

  // Download Bulk items as single structured ZIP containing clear, high-DPI original cropped files
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  const handleDownloadSelectionAsZip = async () => {
    const selectedTables = tables.filter(t => selectedIds.has(t.id));
    if (selectedTables.length === 0) {
      alert("Please select at least one summary card to export.");
      return;
    }

    setIsBulkExporting(true);
    const zip = new JSZip();

    try {
      for (const table of selectedTables) {
        let base64Bytes: string;

        // If visual PDF crop exists, inject it directly into the zip!
        // This runs instantly with 100% fidelity and 0 pixelation!
        if (table.croppedImageUrl) {
          base64Bytes = table.croppedImageUrl.split(",")[1];
        } else {
          // Fallback to html-to-image style rendering
          const node = document.getElementById(`export-node-${table.id}`);
          if (!node) continue;

          const options = {
            pixelRatio: exportSettings.scale,
            quality: 0.98
          };
          const dataUrl = await toPng(node, options);
          base64Bytes = dataUrl.split(",")[1];
        }

        const filename = `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || table.id}.${exportSettings.format}`;
        zip.file(filename, base64Bytes, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `extracted_summaries_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("Bulk zip generation failed:", err);
      alert(`ZIP preparation failed: ${err.message || err}`);
    } finally {
      setIsBulkExporting(false);
    }
  };

  // Drag-and-drop file upload event listeners
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const loadSampleData = () => {
    setErrorStatus(null);
    setUploadedFileName("Quarterly_Audit_Final.pdf");
    setUploadedFileSize("4.2 MB");
    setTables(SAMPLE_SUMMARIES);
    setSelectedIds(new Set(SAMPLE_SUMMARIES.map(t => t.id)));
    setPdfDoc(null); // No interactive doc for fallback sample
  };

  const clearWorkspace = () => {
    setTables([]);
    setPdfDoc(null);
    setSelectedIds(new Set());
    setErrorStatus(null);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
      
      {/* 1. Navigation Bar */}
      <nav id="navbar-id" className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 z-10 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 flex items-center justify-center rounded-xs text-white shadow-sm">
            <Layers className="h-4 w-4" />
          </div>
          <h1 className="font-bold text-lg tracking-tight uppercase">
            Tabula<span className="text-blue-600">Extract</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Process Status</span>
            <span className="text-xs font-mono text-green-600 font-semibold uppercase">
              {tables.length > 0 ? `${selectedIds.size}/${tables.length} CLIPS PREPARED` : "System Engine Ready"}
            </span>
          </div>
          
          {tables.length > 0 && (
            <button
              onClick={handleDownloadSelectionAsZip}
              disabled={selectedIds.size === 0 || isBulkExporting}
              className="bg-slate-900 text-white px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 cursor-pointer transition-all shrink-0 rounded-xs"
            >
              {isBulkExporting ? "Zipping..." : "Download Original Layouts (ZIP)"}
            </button>
          )}
        </div>
      </nav>

      {/* 2. Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Control Sidebar */}
        <aside id="sidebar-id" className="w-72 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 overflow-y-auto shrink-0 select-none">
          
          {/* Source Document Details */}
          <div className="space-y-4">
            <div>
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Source Document</h2>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-sm">
                <p className="text-xs font-bold truncate text-slate-800" title={uploadedFileName}>
                  {pdfDoc ? uploadedFileName : "No PDF File Loaded"}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold font-mono">
                  {pdfDoc ? `${tables.length} table crops • ${uploadedFileSize}` : "Waiting for upload"}
                </p>
              </div>
            </div>

            {/* Configs */}
            <div>
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Crop Capture Settings</h2>
              
              <div className="space-y-4">
                {/* Image Resolution */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium font-sans">Retina Scale Factor</span>
                    <span className="font-mono text-blue-600 font-bold">
                      {exportSettings.scale}X Scale
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-sm">
                    {[1, 2, 3].map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setExportSettings({ ...exportSettings, scale: sc })}
                        className={`text-[9.5px] font-mono leading-none py-1.5 font-bold transition-all cursor-pointer ${
                          exportSettings.scale === sc
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {sc}X DPI
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Formats */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium font-sans">Image Extension</span>
                    <span className="font-mono text-blue-600 font-bold uppercase">{exportSettings.format}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-sm">
                    {["png", "jpeg"].map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setExportSettings({ ...exportSettings, format: fmt as "png" | "jpeg" })}
                        className={`text-[9.5px] font-mono leading-none py-1.5 font-bold uppercase transition-all cursor-pointer ${
                          exportSettings.format === fmt
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Styled Presets Style Selector (Applicable for Spreadsheet Grids) */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium font-sans">Corporate Spreadsheet Theme</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {[
                      { id: "classic", label: "Classic Business" },
                      { id: "ocean", label: "Ocean Corporate" },
                      { id: "obsidian", label: "Midnight Dark" },
                      { id: "editorial", label: "Editorial Serif" }
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setExportSettings({ ...exportSettings, theme: st.id as ThemeStyle })}
                        className={`w-full text-left px-3 py-2 rounded-sm text-[11px] transition-all flex items-center justify-between cursor-pointer border ${
                          exportSettings.theme === st.id
                            ? "bg-blue-50/50 text-blue-700 border-blue-200/60 font-bold"
                            : "hover:bg-slate-50 text-slate-650 border-transparent"
                        }`}
                      >
                        <span>{st.label}</span>
                        {exportSettings.theme === st.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto p-4 bg-slate-900/5 border border-slate-200/60 rounded text-slate-600">
            <p className="text-[10px] leading-relaxed font-bold uppercase tracking-wider mb-1 text-slate-800 flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-blue-600" /> Human & AI Crops
            </p>
            <p className="text-[10.5px] leading-relaxed font-medium">
              We extract table dimensions accurately via Gemini, render pages, and let you modify margins or draw additions for exact copies!
            </p>
          </div>
        </aside>

        {/* Workspace Display Stage Area */}
        <section className="flex-1 flex overflow-hidden">
          {tables.length === 0 && !isLoading ? (
            /* Upload Center stage */
            <div className="flex-1 grid-bg p-8 flex flex-col justify-center select-none">
              <div className="max-w-xl mx-auto w-full bg-white border border-slate-200 shadow-md p-10 rounded-sm">
                <div className="text-center mb-6">
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 font-mono text-[9.5px] uppercase tracking-wider px-3.5 py-1 rounded-full mb-3 font-semibold">
                    <Sparkles className="w-3 h-3 text-blue-600" /> Vector Rasterizer Engaged
                  </span>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
                    Premium Table Image Crop Tool
                  </h2>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed font-medium">
                    Upload your raw PDF. The engine renders clean pages client-side, allows custom interactive crops, and exports high resolution tables.
                  </p>
                </div>

                {/* Drop Drag Box */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerFileSelect}
                  className={`border border-dashed rounded p-12 cursor-pointer text-center transition-all ${
                    dragActive 
                      ? "border-blue-500 bg-blue-50/25 shadow-inner" 
                      : "border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-white hover:shadow-xs"
                  }`}
                >
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="application/pdf"
                    onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])}
                    className="hidden" 
                  />
                  
                  <UploadCloud className="w-10 h-10 text-blue-500 mx-auto mb-3 stroke-1.2" />
                  <h3 className="font-bold text-slate-800 text-xs mb-1 uppercase tracking-wider">
                    Select or drag PDF file here
                  </h3>
                  <p className="text-slate-400 text-[10px] mb-2 uppercase font-semibold tracking-wider font-mono">
                    High scale vector-to-raster crop
                  </p>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-slate-150 pt-5">
                  <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Want fallback sample dataset?</span>
                  <button
                    type="button"
                    onClick={loadSampleData}
                    className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-xs uppercase tracking-wide transition-colors cursor-pointer"
                  >
                    Load fallback demo data
                  </button>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            /* Loading State Block */
            <div className="flex-1 grid-bg p-8 flex flex-col justify-center select-none">
              <div className="max-w-md mx-auto w-full bg-white border border-slate-200 shadow-md p-8 text-center rounded-sm">
                <div className="relative w-12 h-12 mx-auto mb-4">
                  <div className="absolute inset-0 border-2 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-widest mb-1 font-sans">Evaluating Layout</h3>
                <p className="text-slate-500 text-[10px] leading-relaxed font-mono uppercase tracking-wide px-4 font-bold">
                  {loadingStep}
                </p>
              </div>
            </div>
          ) : (
            /* ACTIVE WORKSPACE GRID: Split layout if PDF loaded, normal if sample fallback data */
            <div className="flex-1 flex overflow-hidden">
              
              {pdfDoc ? (
                /* PDF doc exists -> beautiful Interactive Split Screen! */
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                  
                  {/* Left Column: Canvas Cropper */}
                  <div className="flex-1 lg:w-[50%] p-6 overflow-y-auto flex flex-col border-r border-slate-200">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1">
                        <Scissors className="w-4 h-4 text-blue-600 shrink-0" /> Dual-Pane PDF Page Crop Editor
                      </h2>
                    </div>
                    <PDFPageCropper
                      pdfDoc={pdfDoc}
                      cropBoxes={tables}
                      onUpdateCropBoxes={onUpdateCropBoxes}
                      onSelectBox={setSelectedBoxId}
                      selectedBoxId={selectedBoxId}
                    />
                  </div>

                  {/* Right Column: Crops summaries list */}
                  <div className="flex-1 lg:w-[50%] p-6 overflow-y-auto flex flex-col bg-slate-100/50">
                    
                    {/* Select All action dashboard banner matches mock layout */}
                    <div className="bg-white rounded-sm border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none shadow-xs mb-6 shrink-0">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-700 hover:text-blue-600 cursor-pointer"
                        >
                          <div className={`flex items-center justify-center w-4 h-4 rounded-xs border transition-all ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {allSelected && <Check className="w-2.5 h-2.5 stroke-[3.5]" />}
                          </div>
                          <span>{allSelected ? "Clear Checkbox" : "Bulk Select All"}</span>
                        </button>
                        <span className="text-slate-200">|</span>
                        <span className="text-xs font-semibold text-slate-500 font-mono text-blue-600">
                          {tables.length} CROPPED {tables.length === 1 ? "TABLE" : "TABLES"}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={clearWorkspace}
                          className="flex items-center gap-1.5 text-[10px] text-rose-700 bg-rose-50 hover:bg-rose-100 font-extrabold px-3 py-2 rounded-xs uppercase tracking-wider border border-rose-100 cursor-pointer transition-colors"
                        >
                          Reset App
                        </button>
                      </div>
                    </div>

                    {/* Error display banner */}
                    {errorStatus && (
                      <div className="bg-rose-50 border border-rose-150 rounded p-4 text-rose-800 flex items-start gap-3 mb-6 shrink-0">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="flex-1 text-xs">
                          <h4 className="font-bold text-rose-950 mb-1 leading-none uppercase">Extraction Alert</h4>
                          <p>{errorStatus}</p>
                        </div>
                        <button onClick={() => setErrorStatus(null)} className="text-rose-450 hover:text-rose-900 font-black">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Table summaries list */}
                    <div className="space-y-6 flex-1">
                      {tables.map((table) => (
                        <div 
                          key={table.id}
                          className={`transition-all duration-300 ${
                            table.id === selectedBoxId 
                              ? "scale-[1.01] ring-2 ring-blue-500/20" 
                              : ""
                          }`}
                          onClick={() => setSelectedBoxId(table.id)}
                        >
                          <SummaryTable
                            table={table}
                            activeTheme={exportSettings.theme}
                            exportSettings={exportSettings}
                            onUpdate={handleUpdateTable}
                            onDelete={() => handleDeleteTable(table.id)}
                            isSelected={selectedIds.has(table.id)}
                            onToggleSelect={() => toggleSelectTable(table.id)}
                            onExtract={handleExtractTableFromImage}
                            isExtracting={extractingMap[table.id] || false}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                /* No pdfDoc loaded (Sample dataset viewing fallback list) */
                <div className="flex-1 p-8 overflow-y-auto bg-slate-100/50">
                  <div className="space-y-6 max-w-4xl mx-auto w-full">
                    {/* Dashboard controls */}
                    <div className="bg-white rounded-sm border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none shadow-xs">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-700 hover:text-blue-600 cursor-pointer"
                        >
                          <div className={`flex items-center justify-center w-4 h-4 rounded-xs border transition-all ${allSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {allSelected && <Check className="w-2.5 h-2.5 stroke-[3.5]" />}
                          </div>
                          <span>{allSelected ? "Deselect All" : "Select All Summaries"}</span>
                        </button>
                        <span className="text-slate-200">|</span>
                        <span className="text-xs font-semibold text-slate-500 font-mono text-blue-600">
                          {tables.length} DEMO {tables.length === 1 ? "TABLE" : "TABLES"}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddNewTable}
                          className="flex items-center gap-1.5 text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 font-extrabold px-3 py-2 rounded-xs uppercase tracking-wider border border-blue-100 cursor-pointer transition-colors"
                        >
                          New Grid
                        </button>

                        <button
                          type="button"
                          onClick={clearWorkspace}
                          className="flex items-center gap-1.5 text-[10px] text-rose-700 bg-rose-50 hover:bg-rose-100 font-extrabold px-3 py-2 rounded-xs uppercase tracking-wider border border-rose-100 cursor-pointer transition-colors"
                        >
                          Clear App
                        </button>
                      </div>
                    </div>

                    {/* Tables list rendering */}
                    <div className="grid grid-cols-1 gap-6">
                      {tables.map((table) => (
                        <SummaryTable
                          key={table.id}
                          table={table}
                          activeTheme={exportSettings.theme}
                          exportSettings={exportSettings}
                          onUpdate={handleUpdateTable}
                          onDelete={() => handleDeleteTable(table.id)}
                          isSelected={selectedIds.has(table.id)}
                          onToggleSelect={() => toggleSelectTable(table.id)}
                          onExtract={handleExtractTableFromImage}
                          isExtracting={extractingMap[table.id] || false}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          )}
        </section>
      </main>

      {/* 3. Footer */}
      <footer className="h-10 bg-slate-900 text-slate-400 text-[10px] uppercase tracking-[0.2em] flex items-center justify-between px-8 select-none shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            System: Offline Ready
          </span>
          <span className="text-slate-700">|</span>
          <span>Vector Workspace v2.0</span>
        </div>
        <div>
          <span>Tabular layout preserving engine verifies crispness</span>
        </div>
      </footer>
    </div>
  );
}
