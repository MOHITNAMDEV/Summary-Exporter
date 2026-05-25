export interface TableSummary {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  notes?: string;
  page?: number;     // 1-indexed page containing this table
  ymin?: number;     // 0 to 1000
  xmin?: number;     // 0 to 1000
  ymax?: number;     // 0 to 1000
  xmax?: number;     // 0 to 1000
  croppedImageUrl?: string; // High-resolution cropped visual image data URL
}

export type ThemeStyle = 'classic' | 'ocean' | 'obsidian' | 'editorial';

export interface ExportSettings {
  scale: number; // 1, 2, or 3 for DPI control
  format: 'png' | 'jpeg';
  theme: ThemeStyle;
}
