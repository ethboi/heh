export type SupportedCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "JPY"
  | "AUD"
  | "CAD";

export type TrivagoToolResult = {
  structuredContent?: Record<string, unknown>;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type HotelSuggestion = {
  id: number;
  ns: number;
  location: string;
  locationLabel: string;
  locationType?: string;
  suggestionType?: string;
};

export type TrivagoAccommodation = {
  accommodation_id: string;
  accommodation_name: string;
  accommodation_url?: string;
  address?: string;
  country_city?: string;
  currency?: string;
  price_per_night?: string;
  price_per_stay?: string;
  advertisers?: string;
  review_rating?: string;
  review_count?: number;
  hotel_rating?: number;
  top_amenities?: string;
  distance?: string;
  main_image?: string;
  description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSuggestion(raw: unknown): HotelSuggestion | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = asNumber(raw.id ?? raw.ID);
  const ns = asNumber(raw.ns ?? raw.NS) ?? 100;

  const location =
    asString(raw.location) ||
    asString(raw.location_name) ||
    asString(raw.name) ||
    (isRecord(raw.Location) ? asString(raw.Location.Value) : "");

  const locationLabel =
    asString(raw.location_label) ||
    asString(raw["Location Label"]) ||
    asString(raw.locationLabel);

  if (!id || !location) {
    return null;
  }

  return {
    id,
    ns,
    location,
    locationLabel,
    locationType: asString(raw.location_type) || asString(raw["Location Type"]),
    suggestionType:
      asString(raw.suggestion_type) || asString(raw.SuggestionType) || undefined,
  };
}

function normalizeAccommodation(raw: unknown): TrivagoAccommodation | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = asString(raw.accommodation_id) || asString(raw["Accommodation ID"]);
  const name =
    asString(raw.accommodation_name) || asString(raw["Accommodation Name"]);

  if (!id || !name) {
    return null;
  }

  return {
    accommodation_id: id,
    accommodation_name: name,
    accommodation_url:
      asString(raw.accommodation_url) || asString(raw["Accommodation URL"]),
    address: asString(raw.address) || asString(raw.Address),
    country_city: asString(raw.country_city) || asString(raw["Country City"]),
    currency: asString(raw.currency) || asString(raw.Currency),
    price_per_night:
      asString(raw.price_per_night) || asString(raw["Price per Night"]),
    price_per_stay:
      asString(raw.price_per_stay) || asString(raw["Price per Stay"]),
    advertisers: asString(raw.advertisers) || asString(raw.Advertisers),
    review_rating: asString(raw.review_rating) || asString(raw["Review Rating"]),
    review_count: asNumber(raw.review_count) ?? asNumber(raw["Review Count"]) ?? undefined,
    hotel_rating: asNumber(raw.hotel_rating) ?? asNumber(raw["Hotel Rating"]) ?? undefined,
    top_amenities: asString(raw.top_amenities) || asString(raw["Top Amenities"]),
    distance: asString(raw.distance) || asString(raw.Distance),
    main_image: asString(raw.main_image) || asString(raw["Main Image"]),
    description: asString(raw.description) || asString(raw.Description),
  };
}

export function extractSuggestions(toolResult: unknown): HotelSuggestion[] {
  if (!isRecord(toolResult) || !isRecord(toolResult.structuredContent)) {
    return [];
  }

  const suggestions = toolResult.structuredContent.suggestions;

  if (!Array.isArray(suggestions)) {
    return [];
  }

  return suggestions
    .map(normalizeSuggestion)
    .filter((suggestion): suggestion is HotelSuggestion => suggestion !== null);
}

export function extractAccommodations(toolResult: unknown): TrivagoAccommodation[] {
  if (!isRecord(toolResult) || !isRecord(toolResult.structuredContent)) {
    return [];
  }

  const accommodations =
    toolResult.structuredContent.accommodations ??
    toolResult.structuredContent.output;

  if (!Array.isArray(accommodations)) {
    return [];
  }

  return accommodations
    .map(normalizeAccommodation)
    .filter((accommodation): accommodation is TrivagoAccommodation => accommodation !== null);
}

export function parsePriceValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
