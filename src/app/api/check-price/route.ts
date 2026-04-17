import { NextResponse } from "next/server";

import { callMcpTool } from "@/lib/mcp";
import {
  extractAccommodations,
  parsePriceValue,
  type SupportedCurrency,
  type TrivagoAccommodation,
  type TrivagoToolResult,
} from "@/lib/trivago";

type CheckPriceRequest = {
  accommodationId?: number | string;
  ns?: number;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  currency?: SupportedCurrency | string;
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

function sortByBestPrice(accommodations: TrivagoAccommodation[]): TrivagoAccommodation[] {
  return accommodations.toSorted((left, right) => {
    const leftValue = parsePriceValue(left.price_per_stay ?? left.price_per_night);
    const rightValue = parsePriceValue(right.price_per_stay ?? right.price_per_night);

    const normalizedLeft = leftValue ?? Number.POSITIVE_INFINITY;
    const normalizedRight = rightValue ?? Number.POSITIVE_INFINITY;

    return normalizedLeft - normalizedRight;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckPriceRequest;

    const accommodationId = body.accommodationId;
    const ns = body.ns ?? 100;
    const checkIn = body.checkIn?.trim() ?? "";
    const checkOut = body.checkOut?.trim() ?? "";
    const adults = Number(body.adults ?? 2);
    const currency = supportedCurrencies.includes(body.currency as SupportedCurrency)
      ? (body.currency as SupportedCurrency)
      : "USD";

    const id = Number(accommodationId);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
      !Number.isFinite(id) ||
      !datePattern.test(checkIn) ||
      !datePattern.test(checkOut) ||
      !Number.isFinite(adults) ||
      adults < 1
    ) {
      return NextResponse.json(
        {
          error:
            "accommodationId, checkIn, checkOut, and adults are required",
        },
        { status: 400 }
      );
    }

    if (checkOut <= checkIn) {
      return NextResponse.json(
        { error: "checkOut must be after checkIn" },
        { status: 400 }
      );
    }

    const toolResult = await callMcpTool<TrivagoToolResult>(
      "trivago-accommodation-search",
      {
        ns,
        id,
        arrival: checkIn,
        departure: checkOut,
        adults,
      }
    );

    const accommodations = sortByBestPrice(extractAccommodations(toolResult));
    const bestDeal = accommodations[0] ?? null;

    return NextResponse.json({
      bestDeal,
      dealUrl: bestDeal?.accommodation_url ?? null,
      hotelDetails: bestDeal
        ? {
            name: bestDeal.accommodation_name,
            address: bestDeal.address,
            city: bestDeal.country_city,
            rating: bestDeal.hotel_rating,
            reviewRating: bestDeal.review_rating,
            amenities: bestDeal.top_amenities,
          }
        : null,
      alternatives: accommodations.slice(1, 6),
      totalResults: accommodations.length,
      requestedCurrency: currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check price";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
