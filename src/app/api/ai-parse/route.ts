import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import type { SupportedCurrency } from "@/lib/trivago";

type ConversationMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type CollectedData = {
  hotelName?: string;
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  currentBestPrice?: string;
  currency?: SupportedCurrency;
};

type AiParseRequest = {
  message?: string;
  conversationHistory?: ConversationMessage[];
  collectedData?: CollectedData;
};

type ModelResponse = {
  extracted?: CollectedData;
  complete?: boolean;
  message?: string;
};

const supportedCurrencies: SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const requiredFieldLabels: Record<keyof CollectedData, string> = {
  hotelName: "hotel name",
  destination: "destination",
  checkIn: "check-in date",
  checkOut: "check-out date",
  adults: "adults",
  currentBestPrice: "current best price",
  currency: "currency",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const normalized = normalizeString(value);

  if (!normalized || !datePattern.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeAdults(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.round(value);
    return normalized >= 1 ? normalized : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      const normalized = Math.round(parsed);
      return normalized >= 1 ? normalized : undefined;
    }
  }

  return undefined;
}

function normalizePrice(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const parsed = Number.parseFloat(normalized);

    if (Number.isFinite(parsed) && parsed > 0) {
      return String(parsed);
    }
  }

  return undefined;
}

function normalizeCurrency(value: unknown): SupportedCurrency | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (!supportedCurrencies.includes(normalized as SupportedCurrency)) {
    return undefined;
  }

  return normalized as SupportedCurrency;
}

function sanitizeCollectedData(raw: unknown): CollectedData {
  if (!isRecord(raw)) {
    return {};
  }

  return {
    hotelName: normalizeString(raw.hotelName),
    destination: normalizeString(raw.destination),
    checkIn: normalizeDate(raw.checkIn),
    checkOut: normalizeDate(raw.checkOut),
    adults: normalizeAdults(raw.adults),
    currentBestPrice: normalizePrice(raw.currentBestPrice),
    currency: normalizeCurrency(raw.currency),
  };
}

function sanitizeConversationHistory(raw: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const messages: Anthropic.MessageParam[] = [];

  for (const entry of raw.slice(-20)) {
    if (!isRecord(entry)) {
      continue;
    }

    const role = entry.role;
    const content = normalizeString(entry.content);

    if ((role !== "user" && role !== "assistant") || !content) {
      continue;
    }

    messages.push({ role, content });
  }

  return messages;
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseModelResponse(raw: string): ModelResponse | null {
  try {
    const parsed = JSON.parse(extractJsonBlock(raw)) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    return {
      extracted: sanitizeCollectedData(parsed.extracted),
      complete: Boolean(parsed.complete),
      message: normalizeString(parsed.message),
    };
  } catch {
    return null;
  }
}

function hasValue(data: CollectedData, key: keyof CollectedData): boolean {
  if (key === "hotelName") {
    return Boolean(data.hotelName?.trim());
  }

  if (key === "destination") {
    return Boolean(data.destination?.trim());
  }

  if (key === "checkIn") {
    return Boolean(data.checkIn && datePattern.test(data.checkIn));
  }

  if (key === "checkOut") {
    return Boolean(data.checkOut && datePattern.test(data.checkOut));
  }

  if (key === "adults") {
    return Number.isFinite(data.adults) && Number(data.adults) >= 1;
  }

  if (key === "currentBestPrice") {
    const value = Number.parseFloat(data.currentBestPrice ?? "");
    return Number.isFinite(value) && value > 0;
  }

  if (key === "currency") {
    return Boolean(data.currency && supportedCurrencies.includes(data.currency));
  }

  return false;
}

function isComplete(data: CollectedData): boolean {
  const requiredKeys = Object.keys(requiredFieldLabels) as Array<keyof CollectedData>;
  return requiredKeys.every((key) => hasValue(data, key));
}

function missingFields(data: CollectedData): string[] {
  const requiredKeys = Object.keys(requiredFieldLabels) as Array<keyof CollectedData>;

  return requiredKeys
    .filter((key) => !hasValue(data, key))
    .map((key) => requiredFieldLabels[key]);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AiParseRequest;
    const message = normalizeString(body.message);

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const collectedData = sanitizeCollectedData(body.collectedData);
    const conversationHistory = sanitizeConversationHistory(body.conversationHistory);
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt =
      `You are a hotel price checking assistant. Extract booking details from user messages. ` +
      `The required fields are: hotelName, destination, checkIn (YYYY-MM-DD), checkOut (YYYY-MM-DD), adults (number), currentBestPrice (number as string), currency (USD/EUR/GBP/CHF/JPY/AUD/CAD). ` +
      `Today is ${today}. Respond with JSON: { extracted: { partial object of fields you found }, complete: boolean, message: friendly follow-up for the user }. ` +
      `Merge newly extracted fields with the collectedData already provided. Only set complete=true when ALL 7 fields are present. ` +
      `If complete, say you are searching now. If not complete, ask for the missing fields. ` +
      `Use only the allowed fields in extracted. Return valid JSON only and no markdown.`;

    const anthropic = new Anthropic({ apiKey });

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      temperature: 0,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        {
          role: "user",
          content:
            `Collected booking data so far: ${JSON.stringify(collectedData)}\n` +
            `Latest user message: ${message}`,
        },
      ],
    });

    const rawText = completion.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    const parsed = parseModelResponse(rawText);
    const extracted = parsed?.extracted ?? {};
    const mergedData = { ...collectedData, ...extracted };
    const complete = isComplete(mergedData);

    const missing = missingFields(mergedData);

    const messageToUser = complete
      ? "Got it! Searching trivago now..."
      : parsed?.message && parsed.message.trim().length > 0
        ? parsed.message.trim()
        : missing.length > 0
          ? `I still need: ${missing.join(", ")}.`
          : "Please share any missing booking details.";

    return NextResponse.json({
      extracted,
      complete,
      message: messageToUser,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse AI booking details";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
