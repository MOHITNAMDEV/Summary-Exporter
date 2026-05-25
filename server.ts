import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();

  // Increase payload size limit for parsing larger PDF files (standard files can exceed 100KB)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route - Extract tables and summaries from uploaded PDF
  app.post("/api/extract-tables", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;

      if (!pdfBase64) {
        return res.status(400).json({ error: "No PDF content provided" });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      // Strip potential base64 prefix if the frontend sent the full Data URI scheme (e.g. "data:application/pdf;base64,...")
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

      // Execute Gemini call using 3.5-flash which is ideal and speedy for multi-modal text extraction tasks
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "application/pdf"
            }
          },
          "Parse this PDF page-by-page. Locate all structured tables and extract them with their visual crop bounding boxes (xmin, ymin, xmax, ymax) on a scale of 0 to 1000."
        ],
        config: {
          systemInstruction: `You are an expert, highly meticulous data processing engine and document layout analyzer.
Your job is to parse tables from PDF documents with 100% exact formatting and detect their bounding boxes on each page.

CRITICAL POSITIONING INSTRUCTIONS:
For every table detected, estimate its exact high-resolution visual bounding box on the respective page on a normalized scale of 0 to 1000 (where 0 is top-left, and 1000 is bottom-right):
1. 'page': The 1-indexed page integer where the table is physically located (e.g., 1, 2, ...).
2. 'ymin', 'xmin', 'ymax', 'xmax': The normalized bounding coordinates (0.0 to 1000.0) that box the table perfectly. Include the table header/title, all headers and grid rows, and any closely associated footnotes immediately below the table.
3. If multiple tables reside on the same page, return distinct bounding boxes for each of them.

CRITICAL DATA RECOVERY INSTRUCTIONS:
1. STRICT COLUMN INTEGRITY: You MUST extract EVERY SINGLE distinct column as it appears in the PDF. Do NOT merge, simplify, group, ignore, or drop columns. If a table has N column headers in the PDF, you must extract exactly N headers, and every single row must contain exactly N cell values.
2. VERBATIM headers: Maintain the exact wording, casing, and position of the original column headers.
3. VERBATIM rows: Extract every single row from the table verbatim in order. Do not skip, truncate, or consolidate rows.
4. CELL ALIGNMENT & BLANK HANDLING: Align cell values exactly under their respective columns. If a cell contains no value, represent it as an empty string "".`,
          responseMimeType: "application/json",
          temperature: 0.0, // Hard determinism for parsing and coordinate estimation tasks
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tables: {
                type: Type.ARRAY,
                description: "Array of extracted tables with structural entries and spatial crop positions",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { 
                      type: Type.STRING, 
                      description: "A unique, URL-friendly lowercase string ID (e.g., table-1)" 
                    },
                    title: { 
                      type: Type.STRING, 
                      description: "The complete verbatim heading or title of the table from the PDF document" 
                    },
                    page: {
                      type: Type.INTEGER,
                      description: "The 1-indexed page number containing this table"
                    },
                    ymin: {
                      type: Type.NUMBER,
                      description: "Top boundary of the table (0.0 - 1000.0)"
                    },
                    xmin: {
                      type: Type.NUMBER,
                      description: "Left boundary of the table (0.0 - 1000.0)"
                    },
                    ymax: {
                      type: Type.NUMBER,
                      description: "Bottom boundary of the table (0.0 - 1000.0)"
                    },
                    xmax: {
                      type: Type.NUMBER,
                      description: "Right boundary of the table (0.0 - 1000.0)"
                    },
                    headers: {
                      type: Type.ARRAY,
                      description: "List of ALL table columns as they appear in the source PDF. You MUST capture 100% of the columns.",
                      items: { type: Type.STRING }
                    },
                    rows: {
                      type: Type.ARRAY,
                      description: "List of ALL rows in the table. Each row must be an array of string cells. The length of each row's array MUST be exactly equal to the length of the headers array.",
                      items: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      }
                    },
                    notes: {
                      type: Type.STRING,
                      description: "Verbatim footnotes, source info, captions, or explanatory notes directly beneath the table"
                    }
                  },
                  required: ["id", "title", "page", "ymin", "xmin", "ymax", "xmax", "headers", "rows"]
                }
              }
            },
            required: ["tables"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response received from Gemini.");
      }

      const data = JSON.parse(text.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Error in table extraction api:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to parse PDF and extract tabular content" 
      });
    }
  });

  // API Route - Extract table from a high-dpi crop image
  app.post("/api/extract-table-from-image", async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "No image content provided" });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets." 
        });
      }

      // Strip potential base64 prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg);base64,/, "");

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/png"
            }
          },
          "Extract the complete structured table from this cropped image. You must be extremely meticulous and capture 100% of the columns and rows verbatim."
        ],
        config: {
          systemInstruction: `You are an expert, highly meticulous data processing engine and document layout analyzer.
Your job is to parse tables from cropped images with 100% exact formatting and cell recovery.

CRITICAL DATA RECOVERY INSTRUCTIONS:
1. STRICT COLUMN INTEGRITY: You MUST extract EVERY SINGLE distinct column as it appears in this table image. Do NOT merge, simplify, group, ignore, or drop columns. If a table has N column headers in the image, you must extract exactly N headers, and every single row must contain exactly N cell values. For example, if there are 12 columns, you must list all 12 column headers.
2. VERBATIM headers: Maintain the exact wording, casing, and position of the original column headers.
3. VERBATIM rows: Extract every single row from the table verbatim in order. Do not skip, truncate, or consolidate rows.
4. CELL ALIGNMENT & BLANK HANDLING: Align cell values exactly under their respective columns. If a cell contains no value, represent it as an empty string "".`,
          responseMimeType: "application/json",
          temperature: 0.0,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { 
                type: Type.STRING, 
                description: "The verbatim heading or title of this cropped table" 
              },
              headers: {
                type: Type.ARRAY,
                description: "List of ALL table columns as they appear in the crop. You MUST capture 100% of the columns.",
                items: { type: Type.STRING }
              },
              rows: {
                type: Type.ARRAY,
                description: "List of ALL rows in the table. Each row must be an array of string cells. The length of each row's array MUST be exactly equal to the length of the headers array.",
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              notes: {
                type: Type.STRING,
                description: "Verbatim footnotes, captions, legends, or explanatory notes directly below or on the table"
              }
            },
            required: ["title", "headers", "rows"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response received from Gemini.");
      }

      const data = JSON.parse(text.trim());
      return res.json(data);
    } catch (error: any) {
      console.error("Error in image table extraction api:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to parse crop image and extract tabular content" 
      });
    }
  });

  // Serve static UI assets or bind to client dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
