import React, { useEffect, useRef, useState } from "react";
import { TableSummary } from "../types";
import { 
  ChevronLeft, ChevronRight, Eye, RefreshCw, ZoomIn, ZoomOut, 
  Crop, Trash2, PlusCircle, CheckCircle2, Sliders, Check, HelpCircle
} from "lucide-react";

interface PDFPageCropperProps {
  pdfDoc: any; // Checked window.pdfjsLib document
  cropBoxes: TableSummary[];
  onUpdateCropBoxes: (boxes: TableSummary[]) => void;
  onSelectBox: (boxId: string) => void;
  selectedBoxId: string | null;
}

export default function PDFPageCropper({
  pdfDoc,
  cropBoxes,
  onUpdateCropBoxes,
  onSelectBox,
  selectedBoxId
}: PDFPageCropperProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(2.0); // Normal viewing crispness
  const [isRenderLoading, setIsRenderLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // States for interactive rectangle manipulation
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [tempRect, setTempRect] = useState<{ xmin: number; ymin: number; xmax: number; ymax: number } | null>(null);

  const [activeAction, setActiveAction] = useState<'draw' | 'adjust' | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null); // e.g. "top-left", "bottom-right", "move", etc.
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null); // offset from top-left of box during drag

  const cropBoxesRef = useRef<TableSummary[]>(cropBoxes);
  useEffect(() => {
    cropBoxesRef.current = cropBoxes;
  }, [cropBoxes]);

  useEffect(() => {
    if (pdfDoc) {
      setNumPages(pdfDoc.numPages);
      setCurrentPage(1);
    }
  }, [pdfDoc]);

  // Handle rendering of PDF page
  useEffect(() => {
    if (!pdfDoc) return;
    renderPage(currentPage);
  }, [pdfDoc, currentPage, scale]);

  const renderPage = async (pageNumber: number) => {
    setIsRenderLoading(true);
    setStatusMsg("Rendering vector layer...");
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Update actual rendered cropped images for cropBoxes on this page
      generateCropUrlsForPage(pageNumber);

      setStatusMsg("");
    } catch (err: any) {
      console.error("PDF page render error:", err);
      setStatusMsg("Oops, rendering aborted");
    } finally {
      setIsRenderLoading(false);
    }
  };

  // Convert normalised 0-1000 scales into actual visual pixel dimensions for the cropper crop region
  const generateCropImage = (
    canvas: HTMLCanvasElement,
    ymin: number,
    xmin: number,
    ymax: number,
    xmax: number
  ): string => {
    const W = canvas.width;
    const H = canvas.height;

    const x = (xmin / 1000) * W;
    const y = (ymin / 1000) * H;
    const w = ((xmax - xmin) / 1000) * W;
    const h = ((ymax - ymin) / 1000) * H;

    if (w <= 0 || h <= 0) return "";

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = Math.max(1, w);
    tempCanvas.height = Math.max(1, h);
    const ctx = tempCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    }
    return tempCanvas.toDataURL("image/png");
  };

  const generateCropUrlsForPage = (pageNumber: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentBoxes = cropBoxesRef.current;
    const updated = currentBoxes.map(box => {
      const bPage = box.page || 1;
      if (bPage === pageNumber && box.ymin !== undefined && box.xmin !== undefined && box.ymax !== undefined && box.xmax !== undefined) {
        const url = generateCropImage(canvas, box.ymin, box.xmin, box.ymax, box.xmax);
        return { ...box, croppedImageUrl: url };
      }
      return box;
    });

    // Check if anything actually changed physically to prevent recursion loops
    const changed = updated.some((box, idx) => {
      const orig = currentBoxes[idx];
      return !orig || box.croppedImageUrl !== orig.croppedImageUrl;
    });
    if (changed) {
      onUpdateCropBoxes(updated);
    }
  };

  const forceCropUpdateForBox = (boxId: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentBoxes = cropBoxesRef.current;
    const updated = currentBoxes.map(box => {
      if (box.id === boxId) {
        const url = generateCropImage(
          canvas,
          box.ymin ?? 0,
          box.xmin ?? 0,
          box.ymax ?? 1000,
          box.xmax ?? 1000
        );
        return { ...box, croppedImageUrl: url };
      }
      return box;
    });
    onUpdateCropBoxes(updated);
  };

  // Convert mouse events to normalized 0-1000 coordinates
  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = overlayRef.current;
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(1000, xPct * 1000)),
      y: Math.max(0, Math.min(1000, yPct * 1000))
    };
  };

  // Drawing event mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const coords = getNormalizedCoords(e);

    // If clicking on some handle or border, do not initiate a new draw!
    const target = e.target as HTMLElement;
    if (target.closest(".crop-box-outline") || target.closest(".resize-handle")) {
      return;
    }

    // Otherwise, start drawing a new manual crop box!
    setIsDrawing(true);
    setDrawStart(coords);
    onSelectBox(null);
    setTempRect({
      xmin: coords.x,
      ymin: coords.y,
      xmax: coords.x + 5,
      ymax: coords.y + 5
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDrawing && drawStart && tempRect) {
      const coords = getNormalizedCoords(e);
      setTempRect({
        xmin: Math.min(drawStart.x, coords.x),
        ymin: Math.min(drawStart.y, coords.y),
        xmax: Math.max(drawStart.x, coords.x),
        ymax: Math.max(drawStart.y, coords.y)
      });
      return;
    }

    if (activeAction && selectedBoxId) {
      const coords = getNormalizedCoords(e);
      const activeBox = cropBoxesRef.current.find(b => b.id === selectedBoxId);
      if (!activeBox) return;

      const updatedBoxes = cropBoxesRef.current.map(box => {
        if (box.id === selectedBoxId) {
          let { xmin, ymin, xmax, ymax } = box as any;

          if (activeHandle === "top-left") {
            xmin = Math.min(coords.x, xmax - 10);
            ymin = Math.min(coords.y, ymax - 10);
          } else if (activeHandle === "top-right") {
            xmax = Math.max(coords.x, xmin + 10);
            ymin = Math.min(coords.y, ymax - 10);
          } else if (activeHandle === "bottom-left") {
            xmin = Math.min(coords.x, xmax - 10);
            ymax = Math.max(coords.y, ymin + 10);
          } else if (activeHandle === "bottom-right") {
            xmax = Math.max(coords.x, xmin + 10);
            ymax = Math.max(coords.y, ymin + 10);
          } else if (activeHandle === "top-edge") {
            ymin = Math.min(coords.y, ymax - 10);
          } else if (activeHandle === "bottom-edge") {
            ymax = Math.max(coords.y, ymin + 10);
          } else if (activeHandle === "left-edge") {
            xmin = Math.min(coords.x, xmax - 10);
          } else if (activeHandle === "right-edge") {
            xmax = Math.max(coords.x, xmin + 10);
          } else if (activeHandle === "move" && dragOffset) {
            const w = xmax - xmin;
            const h = ymax - ymin;
            let nx = coords.x - dragOffset.x;
            let ny = coords.y - dragOffset.y;

            // Constrain movement inside page canvas
            if (nx < 0) nx = 0;
            if (ny < 0) ny = 0;
            if (nx + w > 1000) nx = 1000 - w;
            if (ny + h > 1000) ny = 1000 - h;

            xmin = nx;
            ymin = ny;
            xmax = nx + w;
            ymax = ny + h;
          }

          return { ...box, xmin, ymin, xmax, ymax };
        }
        return box;
      });

      onUpdateCropBoxes(updatedBoxes);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && tempRect && drawStart) {
      setIsDrawing(false);
      setDrawStart(null);

      // Confirm box is of sufficient size
      const width = tempRect.xmax - tempRect.xmin;
      const height = tempRect.ymax - tempRect.ymin;

      if (width > 20 && height > 20) {
        const newId = `crop-box-${Date.now()}`;
        const count = cropBoxesRef.current.length + 1;
        const newBox: TableSummary = {
          id: newId,
          title: `Crop Region 0${count}`,
          page: currentPage,
          ymin: Math.round(tempRect.ymin),
          xmin: Math.round(tempRect.xmin),
          ymax: Math.round(tempRect.ymax),
          xmax: Math.round(tempRect.xmax),
          headers: [], // Initialize empty for visual pending extraction state
          rows: [],
          notes: "Visual custom table crop selection."
        };

        const updated = [...cropBoxesRef.current, newBox];
        onUpdateCropBoxes(updated);
        onSelectBox(newId);

        // Render current crop canvas segment immediately
        setTimeout(() => {
          forceCropUpdateForBox(newId);
        }, 100);
      }
      setTempRect(null);
    }

    if (activeAction) {
      if (selectedBoxId) {
        forceCropUpdateForBox(selectedBoxId);
      }
      setActiveAction(null);
      setActiveHandle(null);
      setDragOffset(null);
    }
  };

  // Drag start for custom edge alignment
  const initiateAdjust = (e: React.MouseEvent, handle: string, boxId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectBox(boxId);
    setActiveAction("adjust");
    setActiveHandle(handle);

    const activeBox = cropBoxesRef.current.find(b => b.id === boxId);
    if (!activeBox) return;

    if (handle === "move") {
      const coords = getNormalizedCoords(e as any);
      setDragOffset({
        x: coords.x - (activeBox.xmin ?? 0),
        y: coords.y - (activeBox.ymin ?? 0)
      });
    }
  };

  const deleteBox = (boxId: string) => {
    const updated = cropBoxesRef.current.filter(box => box.id !== boxId);
    onUpdateCropBoxes(updated);
    if (selectedBoxId === boxId) {
      onSelectBox(null);
    }
  };

  const filteredBoxes = cropBoxes.filter(b => (b.page || 1) === currentPage);

  return (
    <div className="flex flex-col bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden flex-1 select-none">
      
      {/* Visual Navigation controls over the current PDF Document PDF page */}
      <div className="h-12 bg-slate-900 text-white flex items-center justify-between px-4 text-xs font-semibold select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
            disabled={currentPage <= 1 || isRenderLoading}
            className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <span className="font-mono bg-slate-800 text-slate-100 px-3 py-1 rounded">
            PAGE {currentPage} OF {numPages || "?"}
          </span>

          <button
            onClick={() => currentPage < numPages && setCurrentPage(currentPage + 1)}
            disabled={currentPage >= numPages || isRenderLoading}
            className="p-1 hover:bg-slate-800 rounded disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isRenderLoading ? (
            <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              RENDERING VECTOR ELEMENTS...
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {statusMsg || "Click & Drag on table to draw a crop"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <button 
            type="button"
            onClick={() => setScale(prev => Math.max(1, prev - 0.5))}
            className="p-1.5 hover:bg-slate-800 rounded cursor-pointer text-slate-300"
            title="Zoom Out Document"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-slate-400 text-[10px]">{Math.round(scale * 100)}%</span>
          <button 
            type="button"
            onClick={() => setScale(prev => Math.min(4, prev + 0.5))}
            className="p-1.5 hover:bg-slate-800 rounded cursor-pointer text-slate-300"
            title="Zoom In Document (Increases cropped sharpness)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas view rendering PDF page */}
      <div className="flex-1 overflow-auto bg-slate-800 flex justify-center items-start p-8 relative min-h-[500px]">
        <div className="relative shadow-2xl border border-slate-700 bg-white group/pdf max-w-full">
          
          {/* Output actual rendered PDF canvas */}
          <canvas 
            ref={canvasRef} 
            className="block max-w-full h-auto"
            style={{ pointerEvents: "none" }}
          />

          {/* Graphical Crop box layers absolutely aligned */}
          <div
            ref={overlayRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="absolute inset-0 cursor-crosshair z-10"
          >
            {/* Draw active boxes */}
            {filteredBoxes.map((box) => {
              const xmin = box.xmin ?? 0;
              const ymin = box.ymin ?? 0;
              const xmax = box.xmax ?? 1000;
              const ymax = box.ymax ?? 1000;

              const isSel = box.id === selectedBoxId;

              return (
                <div
                  key={box.id}
                  className={`absolute group crop-box-outline flex flex-col transition-shadow ${
                    isSel 
                      ? "border-2 border-blue-600 bg-blue-100/15 shadow-xl ring-2 ring-blue-500/20" 
                      : "border-2 border-dashed border-emerald-500 bg-emerald-500/5 hover:border-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                  }`}
                  style={{
                    left: `${xmin / 10}%`,
                    top: `${ymin / 10}%`,
                    width: `${(xmax - xmin) / 10}%`,
                    height: `${(ymax - ymin) / 10}%`
                  }}
                  onMouseDown={(e) => initiateAdjust(e, "move", box.id)}
                >
                  {/* Tiny label name header bar */}
                  <div className={`absolute top-0 left-0 -translate-y-full flex items-center gap-1.5 px-2 py-0.5 font-bold uppercase tracking-wider text-[9px] rounded-t-sm border-t ${
                    isSel 
                      ? "bg-blue-600 text-white border-blue-500" 
                      : "bg-emerald-600 text-white border-emerald-500"
                  }`}>
                    <Crop className="w-2.5 h-2.5 stroke-[2.5]" />
                    <span className="truncate max-w-[124px] pointer-events-none">{box.title || "Selected Table Crop"}</span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBox(box.id);
                      }}
                      className="ml-1 hover:bg-white/20 p-0.5 rounded cursor-pointer"
                      title="Delete Crop Area"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Handles for adjustable edges only if active selection is True */}
                  {isSel && (
                    <>
                      {/* Corners */}
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "top-left", box.id)}
                        className="resize-handle absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full -top-1.5 -left-1.5 cursor-nwse-resize z-20 hover:scale-125 transition-transform" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "top-right", box.id)}
                        className="resize-handle absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full -top-1.5 -right-1.5 cursor-nesw-resize z-20 hover:scale-125 transition-transform" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "bottom-left", box.id)}
                        className="resize-handle absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full -bottom-1.5 -left-1.5 cursor-nesw-resize z-20 hover:scale-125 transition-transform" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "bottom-right", box.id)}
                        className="resize-handle absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-full -bottom-1.5 -right-1.5 cursor-nwse-resize z-20 hover:scale-125 transition-transform" 
                      />

                      {/* Edges */}
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "top-edge", box.id)}
                        className="resize-handle absolute h-1 inset-x-2 -top-0.5 cursor-ns-resize hover:bg-blue-600 hover:opacity-100 opacity-0 z-15" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "bottom-edge", box.id)}
                        className="resize-handle absolute h-1 inset-x-2 -bottom-0.5 cursor-ns-resize hover:bg-blue-600 hover:opacity-100 opacity-0 z-15" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "left-edge", box.id)}
                        className="resize-handle absolute w-1 inset-y-2 -left-0.5 cursor-ew-resize hover:bg-blue-600 hover:opacity-100 opacity-0 z-15" 
                      />
                      <div 
                        onMouseDown={(e) => initiateAdjust(e, "right-edge", box.id)}
                        className="resize-handle absolute w-1 inset-y-2 -right-0.5 cursor-ew-resize hover:bg-blue-600 hover:opacity-100 opacity-0 z-15" 
                      />
                    </>
                  )}
                </div>
              );
            })}

            {/* Render temporary frame during manual drag-and-draw of new crop region */}
            {isDrawing && tempRect && (
              <div
                className="absolute border-2 border-solid border-blue-500 bg-blue-500/10 pointer-events-none"
                style={{
                  left: `${tempRect.xmin / 10}%`,
                  top: `${tempRect.ymin / 10}%`,
                  width: `${(tempRect.xmax - tempRect.xmin) / 10}%`,
                  height: `${(tempRect.ymax - tempRect.ymin) / 10}%`
                }}
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom instructional footer tip */}
      <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between font-medium text-[10.5px] text-slate-500 shrink-0 select-none">
        <div className="flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
          <span>Need exact format? Drag standard blue grids to any size or click empty space to draw clean visual summaries in-place!</span>
        </div>
        <div className="font-semibold uppercase tracking-widest text-[9.5px] text-emerald-600 font-mono border border-emerald-150 px-2 py-0.5 rounded-xs">
          Vector Rasterizer Active
        </div>
      </div>
    </div>
  );
}
