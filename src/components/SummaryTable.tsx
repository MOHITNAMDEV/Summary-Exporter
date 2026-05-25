import React, { useState, useEffect } from "react";
import { TableSummary, ThemeStyle, ExportSettings } from "../types";
import { toPng, toJpeg } from "html-to-image";
import { 
  Download, Trash2, Plus, GripVertical, Check, Info, FileText, 
  ChevronDown, ChevronUp, Eye, Edit3, Save, Trash, HelpCircle,
  Image as ImageIcon, Grid as GridIcon, Sparkles
} from "lucide-react";

interface SummaryTableProps {
  key?: string | number;
  table: TableSummary;
  activeTheme: ThemeStyle;
  exportSettings: ExportSettings;
  onUpdate: (updated: TableSummary) => void;
  onDelete: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  onExtract?: (tableId: string) => Promise<void>;
  isExtracting?: boolean;
}

export default function SummaryTable({
  table,
  activeTheme,
  exportSettings,
  onUpdate,
  onDelete,
  isSelected,
  onToggleSelect,
  onExtract,
  isExtracting = false,
}: SummaryTableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Choose 'original' (Pristine PDF crop) by default if we have a cropped raw visual context!
  const [viewMode, setViewMode] = useState<'original' | 'styled'>('original');

  useEffect(() => {
    if (table.croppedImageUrl) {
      setViewMode('original');
    } else {
      setViewMode('styled');
    }
  }, [table.croppedImageUrl]);

  const updateTitle = (val: string) => {
    onUpdate({ ...table, title: val });
  };

  const updateHeader = (index: number, val: string) => {
    const nextHeaders = [...table.headers];
    nextHeaders[index] = val;
    onUpdate({ ...table, headers: nextHeaders });
  };

  const updateCell = (rowIndex: number, colIndex: number, val: string) => {
    const nextRows = table.rows.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const nextRow = [...row];
        nextRow[colIndex] = val;
        return nextRow;
      }
      return row;
    });
    onUpdate({ ...table, rows: nextRows });
  };

  const updateNotes = (val: string) => {
    onUpdate({ ...table, notes: val });
  };

  const addColumn = () => {
    const nextHeaders = [...table.headers, `Column ${table.headers.length + 1}`];
    const nextRows = table.rows.map(row => [...row, ""]);
    onUpdate({ ...table, headers: nextHeaders, rows: nextRows });
  };

  const deleteColumn = (colIndex: number) => {
    if (table.headers.length <= 1) return;
    const nextHeaders = table.headers.filter((_, idx) => idx !== colIndex);
    const nextRows = table.rows.map(row => row.filter((_, idx) => idx !== colIndex));
    onUpdate({ ...table, headers: nextHeaders, rows: nextRows });
  };

  const addRow = () => {
    const emptyRow = Array(table.headers.length).fill("");
    onUpdate({ ...table, rows: [...table.rows, emptyRow] });
  };

  const deleteRow = (rowIndex: number) => {
    if (table.rows.length <= 1) return;
    const nextRows = table.rows.filter((_, idx) => idx !== rowIndex);
    onUpdate({ ...table, rows: nextRows });
  };

  const getThemeStyles = (theme: ThemeStyle) => {
    switch (theme) {
      case "ocean":
        return {
          wrapper: "bg-gradient-to-br from-[#f8fafc] to-[#eff6ff] text-slate-800 border-blue-100",
          headerRow: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium font-sans border-b border-blue-200",
          headerCell: "text-white text-xs tracking-wider uppercase font-semibold",
          thCellClass: "px-4 py-3 border-r border-blue-500/20 last:border-r-0 text-left",
          tableRow: "hover:bg-blue-50/40 transition-colors duration-150 border-b border-blue-100",
          tableCell: "px-4 py-3 text-sm text-slate-700 border-r border-blue-50 last:border-r-0",
          altRow: "bg-[#f1f5f9]/40",
          notesArea: "border-t border-blue-100 bg-[#eff6ff]/50 text-slate-600 font-sans",
          titleClass: "font-sans font-bold text-lg text-indigo-950 tracking-tight",
        };
      case "obsidian":
        return {
          wrapper: "bg-[#090d16] text-[#e2e8f0] border-slate-800",
          headerRow: "bg-[#111827] text-cyan-400 font-bold font-mono border-b border-cyan-500/20",
          headerCell: "text-cyan-400 text-xs tracking-widest uppercase",
          thCellClass: "px-4 py-3 border-r border-slate-800 last:border-r-0 text-left",
          tableRow: "hover:bg-slate-900/50 transition-colors duration-150 border-b border-slate-800/80",
          tableCell: "px-4 py-3 text-sm font-mono text-cyan-50/90 border-r border-[#1e293b]/50 last:border-r-0",
          altRow: "bg-[#0f172a]/40",
          notesArea: "border-t border-slate-800 bg-[#0f172a]/20 text-slate-400 font-mono text-xs",
          titleClass: "font-mono font-black text-lg text-cyan-300 tracking-wide uppercase",
        };
      case "editorial":
        return {
          wrapper: "bg-[#FAF6EC] text-[#2c1d11] border-[#e6dcbe] font-serif",
          headerRow: "border-y border-rose-950 text-rose-950 font-bold",
          headerCell: "text-rose-950 font-serif text-sm tracking-tight italic",
          thCellClass: "px-4 py-3 border-r border-[#e6dcbe]/50 last:border-r-0 text-left",
          tableRow: "border-b border-[#e6dcbe] hover:bg-[#FAF6EC]/80",
          tableCell: "px-4 py-3 text-sm text-[#44301d] border-r border-[#e6dcbe]/40 last:border-r-0",
          altRow: "bg-[#f5eeda]/50",
          notesArea: "border-t border-rose-950/20 bg-[#f5eeda]/20 text-amber-900/80 font-serif italic text-xs",
          titleClass: "font-serif font-black text-xl text-amber-950 tracking-normal border-b border-amber-900/25 pb-2",
        };
      case "classic":
      default:
        return {
          wrapper: "bg-white text-slate-800 border-slate-200",
          headerRow: "bg-slate-100 text-slate-900 font-bold font-sans border-b border-slate-300",
          headerCell: "text-slate-800 text-xs uppercase tracking-wider font-bold",
          thCellClass: "px-4 py-3 border-r border-slate-200/80 last:border-r-0 text-left",
          tableRow: "hover:bg-slate-50 transition-colors duration-150 border-b border-slate-150",
          tableCell: "px-4 py-3 text-sm text-slate-700 border-r border-slate-100 last:border-r-0",
          altRow: "bg-slate-50/50",
          notesArea: "border-t border-slate-200 bg-slate-50/50 text-slate-500 font-sans",
          titleClass: "font-sans font-bold text-lg text-slate-900 tracking-tight",
        };
    }
  };

  const st = getThemeStyles(activeTheme);

  // Download logic which handles both Visual Crops and Re-rendered Tables flawlessly
  const triggerImageDownload = async () => {
    setIsExporting(true);
    setErrorMessage(null);

    // If viewing the pristine PDF vector crop, download the cropped base64 directly!
    // This runs instantly with 100% accuracy and ZERO pixel issues or missed columns!
    if (viewMode === "original" && table.croppedImageUrl) {
      try {
        let link = document.createElement("a");
        const cleanTitle = table.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `crop_${table.id}`;
        link.download = `${cleanTitle}.${exportSettings.format}`;
        link.href = table.croppedImageUrl;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err: any) {
        setErrorMessage(`Export failed: ${err.message || err}`);
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // Styled rendering mode (standard html-to-image rasterizer)
    const exportNode = document.getElementById(`export-node-${table.id}`);
    if (!exportNode) {
      setErrorMessage("Export target node not found in DOM");
      setIsExporting(false);
      return;
    }

    try {
      const options = {
        pixelRatio: exportSettings.scale,
        quality: 0.98,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        }
      };

      let link = document.createElement("a");
      const cleanTitle = table.title.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `summary_${table.id}`;
      link.download = `${cleanTitle}.${exportSettings.format}`;

      if (exportSettings.format === "png") {
        const dataUrl = await toPng(exportNode, options);
        link.href = dataUrl;
      } else {
        const dataUrl = await toJpeg(exportNode, options);
        link.href = dataUrl;
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("Export failure:", err);
      setErrorMessage(`Export failed: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`relative group/card bg-white rounded-sm transition-all duration-300 overflow-hidden ${
      isSelected 
        ? "border-2 border-blue-600 shadow-lg shadow-blue-50" 
        : "border border-slate-200 shadow-sm"
    }`}>
      {/* Top action indicator */}
      <div className={`h-10 px-4 flex items-center justify-between select-none border-b ${
        isSelected ? "bg-blue-600 text-white border-blue-700" : "bg-slate-100 text-slate-600 border-slate-200"
      }`}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSelect}
            className={`w-4 h-4 flex items-center justify-center rounded-xs border cursor-pointer transition-all ${
              isSelected 
                ? "bg-white text-blue-600 border-white" 
                : "bg-white border-slate-300 hover:border-slate-400 text-transparent"
            }`}
          >
            <Check className="w-3 h-3 stroke-[3.5]" />
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-wider">
            {table.title ? table.title : "Untitled Table Summary"}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {table.page && (
            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-sm uppercase ${
              isSelected ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700"
            }`}>
              PDF PAGE {table.page}
            </span>
          )}
          <span className="text-[10px] font-mono tracking-tight font-semibold opacity-80">
            {isSelected ? "SELECTED" : `HQ-CROP-${table.id.substring(0,6).toUpperCase()}`}
          </span>
        </div>
      </div>

      {/* Editor & download action toolbar, plus tab selections */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        
        {/* Toggle between Pristine PDF Crop and Parsed Text Grid */}
        <div className="flex bg-slate-200/80 p-0.5 rounded-sm">
          {table.croppedImageUrl && (
            <button
              type="button"
              onClick={() => setViewMode('original')}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                viewMode === 'original' 
                  ? "bg-white text-slate-900 shadow-xs" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ImageIcon className="w-3 h-3 text-blue-600" />
              Pristine PDF Crop
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode('styled')}
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
              viewMode === 'styled' 
                ? "bg-white text-slate-900 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <GridIcon className="w-3 h-3 text-blue-600" />
            Re-styled Grid
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onExtract && (
            <button
              type="button"
              disabled={isExtracting}
              onClick={() => {
                onExtract(table.id);
                // Switch to re-styled grid to show the extracted result
                setTimeout(() => {
                  setViewMode('styled');
                }, 100);
              }}
              className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded transition-all cursor-pointer border ${
                table.headers.length === 0
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 animate-pulse shadow-sm"
                  : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
              }`}
            >
              {isExtracting ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-emerald-300" />
                  <span>{table.headers.length === 0 ? "Extract Table with AI" : "Re-Extract Layout"}</span>
                </>
              )}
            </button>
          )}

          {viewMode === 'styled' && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded transition-all cursor-pointer ${
                isEditing 
                  ? "bg-amber-100 text-amber-950 border border-amber-300" 
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950 border border-transparent"
              }`}
            >
              {isEditing ? <Check className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
              {isEditing ? "Save Modifications" : "Edit Cells"}
            </button>
          )}

          {isEditing && viewMode === 'styled' && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={addRow}
                className="text-[9px] font-mono font-bold uppercase text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded transition-all cursor-pointer"
              >
                + Row
              </button>
              <button
                type="button"
                onClick={addColumn}
                className="text-[9px] font-mono font-bold uppercase text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded transition-all cursor-pointer"
              >
                + Col
              </button>
            </div>
          )}

          <div className="h-4 w-[1px] bg-slate-350 mx-1 hidden sm:block" />

          {/* Download and Trash operations */}
          <button
            type="button"
            disabled={isExporting}
            onClick={triggerImageDownload}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded cursor-pointer transition-all disabled:opacity-50"
            title="Download crisp visual crop as image"
          >
            {isExporting ? (
              <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            <span>Download {viewMode === 'original' ? 'Crop' : exportSettings.format.toUpperCase()}</span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded cursor-pointer transition-all"
            title="Trash this matrix"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-100 text-rose-700 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold hover:text-rose-900">Close</button>
        </div>
      )}

      {/* Main rendering view */}
      <div className="p-5 bg-slate-100/40 relative">
        {isSelected && <div className="scan-line pointer-events-none" />}

        {viewMode === 'original' && table.croppedImageUrl ? (
          /* High-Fidelity Pristine Crop directly from original document */
          <div className="flex flex-col gap-4 bg-white p-5 rounded-sm border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <input
                type="text"
                value={table.title}
                onChange={(e) => updateTitle(e.target.value)}
                className="w-full font-sans font-bold text-sm px-2 py-1 hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-400 rounded focus:outline-none"
                placeholder="Edit Title..."
              />
            </div>

            {/* Direct High-DPI Vector visual rendering cropped image preview */}
            <div className="relative flex items-center justify-center p-4 bg-slate-100/50 border border-slate-150 rounded-sm overflow-hidden select-none">
              {table.headers.length === 0 && (
                <div className="absolute top-2 left-2 right-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[9.5px] font-mono tracking-wide font-extrabold px-3 py-1.5 rounded shadow-xs z-10 flex items-center justify-between uppercase">
                  <span>Visual Table Crop Captured</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded text-[8.5px] animate-pulse">Click "Extract Table with AI" Above</span>
                </div>
              )}
              <img 
                src={table.croppedImageUrl} 
                alt={table.title} 
                className="max-w-full h-auto object-contain shadow-sm border border-white"
                referrerPolicy="no-referrer"
                style={{ imageRendering: "auto" }}
              />
            </div>

            {/* Annotation and notes for the cropped table area */}
            <div className="p-3 bg-slate-50 border border-slate-150 rounded-sm text-xs text-slate-600 italic">
              <div className="flex gap-2 items-start">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                <div className="flex-1">
                  <span className="font-bold uppercase tracking-wider text-[9px] not-italic text-slate-500 block mb-1">Cropped Table Annotations</span>
                  <textarea
                    value={table.notes || ""}
                    onChange={(e) => updateNotes(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-slate-800 not-italic focus:outline-blue-400"
                    placeholder="Describe key insights, legends, or footnotes verbatim here..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Re-styled Styled Spreadsheet Grid view */
          <div 
            id={`export-node-${table.id}`} 
            className={`flex flex-col p-6 rounded-xs border shadow-xs w-full min-w-[500px] transition-all duration-300 relative ${st.wrapper}`}
          >
            {/* Table Header / Title */}
            <div className="mb-4 flex items-center justify-between">
              {isEditing ? (
                <input
                  type="text"
                  value={table.title}
                  onChange={(e) => updateTitle(e.target.value)}
                  className="w-full font-sans font-bold text-base px-2 py-1 border border-blue-400/80 rounded focus:ring-2 focus:ring-blue-100 bg-white text-slate-900"
                  placeholder="Table Title"
                />
              ) : (
                <h3 id={`title-${table.id}`} className={st.titleClass}>{table.title || "Untitled Summary"}</h3>
              )}
            </div>

            {/* Table Grid details */}
            {table.headers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 bg-slate-550/5 border border-slate-500/10 rounded-sm mb-4">
                <Sparkles className="w-8 h-8 text-emerald-500 mb-3 animate-pulse" />
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
                  Ready for AI Table Extraction
                </h4>
                <p className="text-slate-500 text-[10.5px] max-w-sm text-center leading-relaxed font-sans font-medium">
                  Resize the canvas crop to tightly fits your PDF table, then click the highlighted <strong className="text-slate-850">"Extract Table with AI"</strong> button in the card toolbar. Gemini will automatically pull all rows and columns with pristine verbatim accuracy.
                </p>
              </div>
            ) : (
              <table className="w-full table-auto border-collapse mb-4 overflow-hidden rounded-xs">
              <thead>
                <tr className={st.headerRow}>
                  {table.headers.map((hdr, idx) => (
                    <th key={idx} className={st.thCellClass}>
                      <div className="relative group/th flex items-center gap-1">
                        {isEditing ? (
                          <div className="flex items-center gap-1 w-full">
                            <input
                              type="text"
                              value={hdr}
                              onChange={(e) => updateHeader(idx, e.target.value)}
                              className="w-full text-xs font-semibold text-slate-800 px-1.5 py-1 border border-blue-200 rounded bg-white text-left focus:ring-1 focus:ring-blue-200"
                            />
                            <button
                              type="button"
                              onClick={() => deleteColumn(idx)}
                              className="p-1 hover:bg-rose-100 rounded text-rose-500 hover:text-rose-700 cursor-pointer"
                              title="Delete column"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className={st.headerCell}>{hdr}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rIdx) => (
                  <tr 
                    key={rIdx} 
                    className={`${st.tableRow} ${rIdx % 2 === 1 ? st.altRow : ""}`}
                  >
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={st.tableCell}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                            className="w-full text-sm text-slate-900 px-1.5 py-1 border border-slate-200 rounded bg-white focus:border-indigo-400 focus:outline-none"
                          />
                        ) : (
                          <span>{cell}</span>
                        )}
                      </td>
                    ))}
                    {isEditing && (
                      <td className="px-2 text-center border-l border-slate-100/30">
                        <button
                          type="button"
                          onClick={() => deleteRow(rIdx)}
                          className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Delete Row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            )}

            {/* Explanatory notes */}
            {(table.notes || isEditing) && (
              <div className={`p-3.5 rounded-sm text-xs leading-relaxed ${st.notesArea}`}>
                {isEditing ? (
                  <div className="flex flex-col gap-1 w-full">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-sans">
                      Table Commentaries
                    </label>
                    <textarea
                      value={table.notes || ""}
                      onChange={(e) => updateNotes(e.target.value)}
                      className="w-full p-2 border border-slate-200 text-slate-800 rounded font-sans focus:outline-indigo-400 bg-white"
                      placeholder="Commentaries..."
                      rows={2}
                    />
                  </div>
                ) : (
                  <div className="flex gap-2 items-start text-inherit">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-75" />
                    <p className="flex-1 italic">{table.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
