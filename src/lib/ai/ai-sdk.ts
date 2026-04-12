import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export interface ProviderConfig {
  protocol: string;
  baseUrl: string;
  apiKey: string;
  secretKey?: string;
  modelId: string;
}

export function createLanguageModel(config: ProviderConfig): LanguageModel {
  switch (config.protocol) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider.chat(config.modelId);
    }
    case "gemini": {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      });
      return provider(config.modelId);
    }
    default:
      throw new Error(`Unsupported protocol: ${config.protocol}`);
  }
}

/**
 * Strip markdown code fences from AI response if present.
 */
export function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = match ? match[1].trim() : text.trim();

  // Step 1: Remove BOM and other invisible characters
  raw = raw.replace(/\uFEFF/g, "");

  // Step 2: Remove control characters that break JSON.parse (except \n \r \t)
  raw = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  // Step 3: Handle Unicode line/paragraph separators
  raw = raw.replace(/\u2028/g, "\\n").replace(/\u2029/g, "\\n");

  // Step 4: Remove any remaining problematic Unicode characters
  raw = raw.replace(/[\u007F-\u009F]/g, "");

  // Step 5: Fix unescaped special characters within strings
  raw = fixUnescapedCharacters(raw);

  // Step 6: Fix common JSON structural issues from AI output
  raw = fixJSONStructure(raw);

  return raw;
}

/**
 * Fix unescaped characters in JSON strings that might break parsing.
 */
function fixUnescapedCharacters(json: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // If we're inside a string and encounter a problematic character, escape or remove it
    if (inString) {
      const code = char.charCodeAt(0);
      // Control characters inside strings should be escaped or removed
      if (code < 32) {
        if (char === "\n") result += "\\n";
        else if (char === "\r") result += "\\r";
        else if (char === "\t") result += "\\t";
        else result += " ";
        continue;
      }
    }

    result += char;
  }

  return result;
}

/**
 * Fix common JSON structural issues from AI model output.
 */
function fixJSONStructure(json: string): string {
  let result = json;

  // Fix trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");

  // Fix unescaped quotes within strings by finding the actual JSON boundaries
  result = fixUnescapedQuotesInStrings(result);

  // Fix single quotes to double quotes for JSON keys and string values
  result = fixSingleQuotes(result);

  // Remove any markdown list markers or other non-JSON content
  result = trimToJSON(result);

  return result;
}

/**
 * Attempt to fix unescaped quotes within JSON strings.
 * This is a best-effort approach that tries to find valid JSON.
 */
function fixUnescapedQuotesInStrings(json: string): string {
  try {
    // First, try the standard approach - just return as-is
    JSON.parse(json);
    return json;
  } catch {
    // If it fails, try to find the actual JSON boundaries
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < json.length; i++) {
      const char = json[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        // Check if this is an unescaped quote inside a string
        if (inString) {
          // Check if the next significant char suggests this is a real quote
          const afterQuote = json.slice(i + 1).trimStart();
          // Common patterns after a string: colon, comma, closing brace, closing bracket
          const closingPattern = /^[:,\}\]]/;
          if (closingPattern.test(afterQuote)) {
            // This is a closing quote
            inString = false;
            result += char;
          } else {
            // This might be an unescaped quote inside the string
            // Check if we have a reasonable number of unescaped quotes
            const beforeQuote = result;
            const quoteCount = (beforeQuote.match(/"/g) || []).length - (beforeQuote.match(/\\"/g) || []).length;
            // If we already have a pair of quotes, this might be unescaped
            if (quoteCount % 2 === 0) {
              // We have complete pairs, this should close
              inString = false;
              result += char;
            } else {
              // Unescaped quote inside string - replace with escaped quote
              result += '\\"';
              continue;
            }
          }
        } else {
          // Opening quote
          inString = true;
          result += char;
        }
        continue;
      }

      result += char;
    }

    return result;
  }
}

/**
 * Fix single quotes to double quotes where appropriate for JSON.
 */
function fixSingleQuotes(json: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    const prevChar = i > 0 ? json[i - 1] : "";
    const nextChar = i < json.length - 1 ? json[i + 1] : "";

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // Replace single quotes with double quotes in specific contexts
    if (!inString) {
      // JSON keys and values should use double quotes
      if (char === "'") {
        // Check if this is at the start of a key/value
        const beforeTrim = result.trimEnd();
        const afterTrim = json.slice(i + 1).trimStart();

        // If followed by a word character and preceded by colon, brace, bracket, comma, or whitespace
        const wordCharPattern = /^[\w\u4e00-\u9fa5]/;
        const prefixPattern = /[:{\[\s,]/;
        if (wordCharPattern.test(afterTrim) && prefixPattern.test(beforeSlice(beforeTrim))) {
          result += '"';
          continue;
        }
        // If preceded by a word and followed by colon or whitespace
        if (/[\w\u4e00-\u9fa5]/.test(prevChar) && /^[\s:]/.test(afterTrim)) {
          result += '"';
          continue;
        }
      }
    }

    result += char;
  }

  return result;
}

function beforeSlice(str: string): string {
  return str.slice(-1);
}

/**
 * Trim content to only include valid JSON structure.
 */
function trimToJSON(json: string): string {
  // Find the first { or [ that could be the start
  let startIdx = 0;
  for (let i = 0; i < json.length; i++) {
    if (json[i] === "{" || json[i] === "[") {
      startIdx = i;
      break;
    }
  }

  // Find the last } or ] that could be the end
  let endIdx = json.length;
  for (let i = json.length - 1; i >= 0; i--) {
    if (json[i] === "}" || json[i] === "]") {
      endIdx = i + 1;
      break;
    }
  }

  if (startIdx < endIdx) {
    return json.slice(startIdx, endIdx);
  }

  return json;
}
