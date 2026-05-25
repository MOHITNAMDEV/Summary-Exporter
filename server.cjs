var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var PORT = 3e3;
var apiKey = process.env.GEMINI_API_KEY;
var ai = new import_genai.GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
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
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
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
          temperature: 0,
          // Hard determinism for parsing and coordinate estimation tasks
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              tables: {
                type: import_genai.Type.ARRAY,
                description: "Array of extracted tables with structural entries and spatial crop positions",
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    id: {
                      type: import_genai.Type.STRING,
                      description: "A unique, URL-friendly lowercase string ID (e.g., table-1)"
                    },
                    title: {
                      type: import_genai.Type.STRING,
                      description: "The complete verbatim heading or title of the table from the PDF document"
                    },
                    page: {
                      type: import_genai.Type.INTEGER,
                      description: "The 1-indexed page number containing this table"
                    },
                    ymin: {
                      type: import_genai.Type.NUMBER,
                      description: "Top boundary of the table (0.0 - 1000.0)"
                    },
                    xmin: {
                      type: import_genai.Type.NUMBER,
                      description: "Left boundary of the table (0.0 - 1000.0)"
                    },
                    ymax: {
                      type: import_genai.Type.NUMBER,
                      description: "Bottom boundary of the table (0.0 - 1000.0)"
                    },
                    xmax: {
                      type: import_genai.Type.NUMBER,
                      description: "Right boundary of the table (0.0 - 1000.0)"
                    },
                    headers: {
                      type: import_genai.Type.ARRAY,
                      description: "List of ALL table columns as they appear in the source PDF. You MUST capture 100% of the columns.",
                      items: { type: import_genai.Type.STRING }
                    },
                    rows: {
                      type: import_genai.Type.ARRAY,
                      description: "List of ALL rows in the table. Each row must be an array of string cells. The length of each row's array MUST be exactly equal to the length of the headers array.",
                      items: {
                        type: import_genai.Type.ARRAY,
                        items: { type: import_genai.Type.STRING }
                      }
                    },
                    notes: {
                      type: import_genai.Type.STRING,
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
    } catch (error) {
      console.error("Error in table extraction api:", error);
      return res.status(500).json({
        error: error.message || "Failed to parse PDF and extract tabular content"
      });
    }
  });
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
          temperature: 0,
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              title: {
                type: import_genai.Type.STRING,
                description: "The verbatim heading or title of this cropped table"
              },
              headers: {
                type: import_genai.Type.ARRAY,
                description: "List of ALL table columns as they appear in the crop. You MUST capture 100% of the columns.",
                items: { type: import_genai.Type.STRING }
              },
              rows: {
                type: import_genai.Type.ARRAY,
                description: "List of ALL rows in the table. Each row must be an array of string cells. The length of each row's array MUST be exactly equal to the length of the headers array.",
                items: {
                  type: import_genai.Type.ARRAY,
                  items: { type: import_genai.Type.STRING }
                }
              },
              notes: {
                type: import_genai.Type.STRING,
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
    } catch (error) {
      console.error("Error in image table extraction api:", error);
      return res.status(500).json({
        error: error.message || "Failed to parse crop image and extract tabular content"
      });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
