import { NextResponse } from "next/server";

import { callMcpTool } from "@/lib/mcp";
import { extractSuggestions, type TrivagoToolResult } from "@/lib/trivago";

type SearchHotelRequest = {
  hotelName?: string;
  destination?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchHotelRequest;

    const hotelName = body.hotelName?.trim() ?? "";
    const destination = body.destination?.trim() ?? "";

    if (!hotelName || !destination) {
      return NextResponse.json(
        { error: "hotelName and destination are required" },
        { status: 400 }
      );
    }

    const query = `${hotelName} ${destination}`.trim();

    const toolResult = await callMcpTool<TrivagoToolResult>(
      "trivago-search-suggestions",
      {
        query,
      }
    );

    const suggestions = extractSuggestions(toolResult);

    return NextResponse.json({
      query,
      suggestions,
      totalSuggestions: suggestions.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to search hotels";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
