"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  DollarSign,
  ExternalLink,
  Hotel,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parsePriceValue,
  type HotelSuggestion,
  type SupportedCurrency,
  type TrivagoAccommodation,
} from "@/lib/trivago";

type FormState = {
  hotelName: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currentBestPrice: string;
  currency: SupportedCurrency;
};

type SearchHotelResponse = {
  suggestions: HotelSuggestion[];
  totalSuggestions: number;
  error?: string;
};

type CheckPriceResponse = {
  bestDeal: TrivagoAccommodation | null;
  dealUrl: string | null;
  alternatives: TrivagoAccommodation[];
  requestedCurrency: SupportedCurrency;
  totalResults: number;
  error?: string;
};

const currencies: SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
];

function dateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDelta(value: number) {
  return Math.abs(value).toFixed(2);
}

export function BeatThisPriceApp() {
  const [form, setForm] = useState<FormState>({
    hotelName: "",
    destination: "",
    checkIn: dateOffset(14),
    checkOut: dateOffset(16),
    adults: 2,
    currentBestPrice: "",
    currency: "USD",
  });

  const [suggestions, setSuggestions] = useState<HotelSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>("");
  const [selectedNs, setSelectedNs] = useState<number>(100);
  const [result, setResult] = useState<CheckPriceResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const selectedSuggestion = useMemo(
    () => suggestions.find((suggestion) => String(suggestion.id) === selectedSuggestionId),
    [suggestions, selectedSuggestionId]
  );

  const comparison = useMemo(() => {
    if (!result?.bestDeal) {
      return null;
    }

    const userPrice = Number.parseFloat(form.currentBestPrice);
    const trivagoPrice = parsePriceValue(
      result.bestDeal.price_per_stay ?? result.bestDeal.price_per_night
    );

    if (!Number.isFinite(userPrice) || trivagoPrice === null) {
      return null;
    }

    const currencyMatches =
      !result.bestDeal.currency || result.bestDeal.currency === form.currency;

    return {
      userPrice,
      trivagoPrice,
      difference: userPrice - trivagoPrice,
      currencyMatches,
    };
  }, [form.currentBestPrice, form.currency, result]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function runPriceCheck(accommodationId?: number, ns?: number) {
    const id = accommodationId ?? Number.parseInt(selectedSuggestionId, 10);

    if (!Number.isFinite(id)) {
      setError("Pick a hotel suggestion first.");
      return;
    }

    setError("");
    setIsChecking(true);

    try {
      const response = await fetch("/api/check-price", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accommodationId: id,
          ns: ns ?? selectedNs,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          adults: Number(form.adults),
          currency: form.currency,
        }),
      });

      const payload = (await response.json()) as CheckPriceResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to check trivago prices.");
      }

      setResult(payload);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Price check failed.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setSuggestions([]);

    if (form.checkOut <= form.checkIn) {
      setError("Check-out must be after check-in.");
      return;
    }

    if (Number(form.adults) < 1) {
      setError("At least 1 adult is required.");
      return;
    }

    const userPrice = Number.parseFloat(form.currentBestPrice);

    if (!Number.isFinite(userPrice) || userPrice <= 0) {
      setError("Enter a valid current best price.");
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch("/api/search-hotel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotelName: form.hotelName,
          destination: form.destination,
        }),
      });

      const payload = (await response.json()) as SearchHotelResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to search for hotel suggestions.");
      }

      if (!payload.suggestions?.length) {
        throw new Error("No matching hotels were found on trivago.");
      }

      setSuggestions(payload.suggestions);
      const firstMatch = payload.suggestions[0];
      setSelectedSuggestionId(String(firstMatch.id));
      setSelectedNs(firstMatch.ns);

      await runPriceCheck(firstMatch.id, firstMatch.ns);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="bg-muted/20 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <TrendingDown className="size-5 text-emerald-600" />
              Beat This Price
            </CardTitle>
            <CardDescription>
              Enter your booking details and we&apos;ll check trivago for a lower rate.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel-name">
                    <Hotel className="size-4" />
                    Hotel name
                  </Label>
                  <Input
                    id="hotel-name"
                    required
                    value={form.hotelName}
                    onChange={(event) => updateForm("hotelName", event.target.value)}
                    placeholder="Hilton Berlin"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="destination">Destination / city</Label>
                  <Input
                    id="destination"
                    required
                    value={form.destination}
                    onChange={(event) => updateForm("destination", event.target.value)}
                    placeholder="Berlin"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="check-in">
                    <Calendar className="size-4" />
                    Check-in
                  </Label>
                  <Input
                    id="check-in"
                    type="date"
                    required
                    value={form.checkIn}
                    onChange={(event) => updateForm("checkIn", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="check-out">
                    <Calendar className="size-4" />
                    Check-out
                  </Label>
                  <Input
                    id="check-out"
                    type="date"
                    required
                    value={form.checkOut}
                    onChange={(event) => updateForm("checkOut", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adults">
                    <Users className="size-4" />
                    Adults
                  </Label>
                  <Input
                    id="adults"
                    type="number"
                    min={1}
                    required
                    value={form.adults}
                    onChange={(event) => updateForm("adults", Number(event.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-best-price">
                    <DollarSign className="size-4" />
                    Your current best price
                  </Label>
                  <Input
                    id="current-best-price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.currentBestPrice}
                    onChange={(event) =>
                      updateForm("currentBestPrice", event.target.value)
                    }
                    placeholder="240"
                  />
                </div>
              </div>

              <div className="max-w-[220px] space-y-2">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(value) => {
                    if (value && currencies.includes(value as SupportedCurrency)) {
                      updateForm("currency", value as SupportedCurrency);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={isSearching || isChecking}>
                <Search className="size-4" />
                {isSearching
                  ? "Searching hotel..."
                  : isChecking
                    ? "Checking price..."
                    : "Check trivago price"}
              </Button>
            </form>
          </CardContent>

          {error ? (
            <CardFooter>
              <Alert variant="destructive">
                <TrendingUp className="size-4" />
                <AlertTitle>Could not complete check</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardFooter>
          ) : null}
        </Card>

        {suggestions.length > 0 ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Hotel className="size-4" />
                Matching hotels
              </CardTitle>
              <CardDescription>
                We matched your query to {suggestions.length} accommodation
                suggestion(s).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={selectedSuggestionId}
                onValueChange={(value) => {
                  if (!value) {
                    setSelectedSuggestionId("");
                    return;
                  }

                  setSelectedSuggestionId(value);
                  const suggestion = suggestions.find(
                    (item) => String(item.id) === value
                  );

                  if (suggestion) {
                    setSelectedNs(suggestion.ns);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a matched hotel" />
                </SelectTrigger>
                <SelectContent>
                  {suggestions.map((suggestion) => (
                    <SelectItem key={suggestion.id} value={String(suggestion.id)}>
                      {suggestion.location} ({suggestion.locationLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void runPriceCheck(selectedSuggestion?.id, selectedSuggestion?.ns)
                }
                disabled={isChecking || !selectedSuggestionId}
              >
                <Search className="size-4" />
                Re-check selected hotel
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {result ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <DollarSign className="size-5" />
                Price comparison
              </CardTitle>
              <CardDescription>
                {result.totalResults} trivago offer(s) returned for this stay.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.bestDeal ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{result.bestDeal.accommodation_name}</Badge>
                    <Badge variant="secondary">{result.bestDeal.currency || "N/A"}</Badge>
                    {comparison ? (
                      comparison.difference > 0 ? (
                        <Badge>
                          <TrendingDown className="size-3" />
                          Better by {formatDelta(comparison.difference)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <TrendingUp className="size-3" />
                          Higher by {formatDelta(comparison.difference)}
                        </Badge>
                      )
                    ) : null}
                  </div>

                  <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Your best price</p>
                      <p className="text-lg font-semibold">
                        {form.currency} {form.currentBestPrice}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Trivago best price</p>
                      <p className="text-lg font-semibold">
                        {result.bestDeal.price_per_stay ||
                          result.bestDeal.price_per_night ||
                          "Not available"}
                      </p>
                    </div>
                  </div>

                  {!comparison?.currencyMatches ? (
                    <Alert>
                      <TrendingUp className="size-4" />
                      <AlertTitle>Currency mismatch</AlertTitle>
                      <AlertDescription>
                        Trivago returned {result.bestDeal.currency}. Compare manually
                        against your {form.currency} price.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>{result.bestDeal.country_city}</p>
                    <p>{result.bestDeal.address}</p>
                    {result.bestDeal.advertisers ? (
                      <p>Advertiser: {result.bestDeal.advertisers}</p>
                    ) : null}
                  </div>

                  {result.dealUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        window.open(result.dealUrl ?? "", "_blank", "noopener,noreferrer")
                      }
                    >
                      <ExternalLink className="size-4" />
                      Open deal on trivago
                    </Button>
                  ) : null}
                </>
              ) : (
                <Alert>
                  <TrendingUp className="size-4" />
                  <AlertTitle>No available deal found</AlertTitle>
                  <AlertDescription>
                    Try changing your dates or selecting a different hotel suggestion.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
