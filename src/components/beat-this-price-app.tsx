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
import { TrivagoLogo } from "@/components/trivago-logo";
import { cn } from "@/lib/utils";
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

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
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

type AiParseResponse = {
  extracted: CollectedData;
  complete: boolean;
  message: string;
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

const requiredAiFields: Array<{ key: keyof CollectedData; label: string }> = [
  { key: "hotelName", label: "Hotel" },
  { key: "destination", label: "Destination" },
  { key: "checkIn", label: "Check-in" },
  { key: "checkOut", label: "Check-out" },
  { key: "adults", label: "Adults" },
  { key: "currentBestPrice", label: "Best price" },
  { key: "currency", label: "Currency" },
];

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDelta(value: number) {
  return Math.abs(value).toFixed(2);
}

function hasCollectedField(data: CollectedData, key: keyof CollectedData): boolean {
  if (key === "hotelName") {
    return Boolean(data.hotelName?.trim());
  }

  if (key === "destination") {
    return Boolean(data.destination?.trim());
  }

  if (key === "checkIn") {
    return Boolean(data.checkIn && isoDatePattern.test(data.checkIn));
  }

  if (key === "checkOut") {
    return Boolean(data.checkOut && isoDatePattern.test(data.checkOut));
  }

  if (key === "adults") {
    return Number.isFinite(data.adults) && Number(data.adults) >= 1;
  }

  if (key === "currentBestPrice") {
    const value = Number.parseFloat(data.currentBestPrice ?? "");
    return Number.isFinite(value) && value > 0;
  }

  if (key === "currency") {
    return Boolean(data.currency && currencies.includes(data.currency));
  }

  return false;
}

function isCollectedDataComplete(data: CollectedData): boolean {
  const allFieldsPresent = requiredAiFields.every(({ key }) => hasCollectedField(data, key));

  if (!allFieldsPresent) {
    return false;
  }

  if (!data.checkIn || !data.checkOut) {
    return false;
  }

  return data.checkOut > data.checkIn;
}

function formatCollectedValue(key: keyof CollectedData, value: CollectedData[keyof CollectedData]) {
  if (value === undefined || value === null || value === "") {
    return "missing";
  }

  if (key === "adults" && typeof value === "number") {
    return String(value);
  }

  return String(value);
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

  const [activeInputMode, setActiveInputMode] = useState<"ai" | "manual">("ai");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! Share your hotel, destination, dates, adults, and current best price. I’ll fill the form for you.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [collectedData, setCollectedData] = useState<CollectedData>({});
  const [isAiParsing, setIsAiParsing] = useState(false);

  const [suggestions, setSuggestions] = useState<HotelSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>("");
  const [selectedNs, setSelectedNs] = useState<number>(100);
  const [result, setResult] = useState<CheckPriceResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const selectedSuggestion = useMemo(
    () =>
      suggestions.find(
        (suggestion) => String(suggestion.id) === selectedSuggestionId
      ),
    [suggestions, selectedSuggestionId]
  );

  const missingAiFields = useMemo(
    () => requiredAiFields.filter(({ key }) => !hasCollectedField(collectedData, key)),
    [collectedData]
  );

  const missingFieldSet = useMemo(
    () => new Set(missingAiFields.map((field) => field.key)),
    [missingAiFields]
  );

  const aiReadyForManualCheck = useMemo(
    () => isCollectedDataComplete(collectedData),
    [collectedData]
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

  const resultTone: "win" | "lose" | "neutral" = comparison
    ? comparison.difference > 0
      ? "win"
      : comparison.difference < 0
        ? "lose"
        : "neutral"
    : "neutral";

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyCollectedDataToForm(data: CollectedData) {
    setForm((prev) => ({
      ...prev,
      hotelName: data.hotelName ?? prev.hotelName,
      destination: data.destination ?? prev.destination,
      checkIn: data.checkIn ?? prev.checkIn,
      checkOut: data.checkOut ?? prev.checkOut,
      adults: data.adults ?? prev.adults,
      currentBestPrice: data.currentBestPrice ?? prev.currentBestPrice,
      currency: data.currency ?? prev.currency,
    }));
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

  async function submitCurrentForm() {
    setError("");
    setResult(null);
    setSuggestions([]);

    if (!form.hotelName.trim() || !form.destination.trim()) {
      setError("Hotel name and destination are required.");
      return;
    }

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentForm();
  }

  async function handleAiSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = chatInput.trim();

    if (!message || isAiParsing) {
      return;
    }

    setError("");

    const historySnapshot = chatMessages;
    const collectedSnapshot = collectedData;

    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsAiParsing(true);

    try {
      const response = await fetch("/api/ai-parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          conversationHistory: historySnapshot,
          collectedData: collectedSnapshot,
        }),
      });

      const payload = (await response.json()) as Partial<AiParseResponse>;

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Unable to parse booking details."
        );
      }

      const extracted =
        payload.extracted && typeof payload.extracted === "object"
          ? (payload.extracted as CollectedData)
          : {};

      const mergedData = { ...collectedSnapshot, ...extracted };
      setCollectedData(mergedData);
      applyCollectedDataToForm(mergedData);

      const assistantMessage =
        typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message.trim()
          : "Thanks. Share any missing details and I’ll keep filling the form.";

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMessage },
      ]);

      if (Boolean(payload.complete)) {
        setActiveInputMode("manual");
      }
    } catch (chatError) {
      const message =
        chatError instanceof Error ? chatError.message : "AI assistant failed.";

      setError(message);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I couldn’t parse that just now. Please try again with hotel, destination, dates, adults, and your current best price.",
        },
      ]);
    } finally {
      setIsAiParsing(false);
    }
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden py-8 sm:py-12">
      <div className="btp-page-bg absolute inset-0 -z-20" />
      <div className="btp-grid-overlay absolute inset-0 -z-10" />
      <div className="btp-float pointer-events-none absolute -top-20 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 sm:px-6">
        <Card className="border-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-2xl shadow-indigo-900/35 ring-0">
          <CardHeader className="space-y-3 py-5 sm:py-6">
            <div className="flex items-start justify-between">
              <Badge className="w-fit border border-white/30 bg-white/15 text-white">
                Smart hotel rate challenger
              </Badge>
              <a
                href="https://www.trivago.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                Powered by <TrivagoLogo className="inline-block" />
              </a>
            </div>
            <CardTitle className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <TrendingDown className="size-9 sm:size-10" />
              heh Trivago!, beat this price!
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-blue-100 sm:text-lg">
              Spot overpriced hotel deals in seconds. We compare your current
              offer against live trivago rates so you can book with confidence.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border border-indigo-100/80 bg-card/92 shadow-[0_18px_48px_-26px_rgba(37,99,235,0.45)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-26px_rgba(37,99,235,0.58)]">
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight sm:text-3xl">
              Check your stay price
            </CardTitle>
            <CardDescription>
              Use the AI Assistant or enter details manually to find a better trivago deal.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="inline-flex w-full rounded-xl border border-indigo-100 bg-indigo-50/80 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveInputMode("ai")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeInputMode === "ai"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-indigo-600 hover:bg-white/60"
                )}
              >
                AI Assistant
              </button>
              <button
                type="button"
                onClick={() => setActiveInputMode("manual")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeInputMode === "manual"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-indigo-600 hover:bg-white/60"
                )}
              >
                Manual Form
              </button>
            </div>

            {activeInputMode === "ai" ? (
              <div className="space-y-4 rounded-xl border border-indigo-100/80 bg-indigo-50/35 p-3">
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-indigo-100/80 bg-white/80 p-3">
                  {chatMessages.map((chatMessage, index) => (
                    <div
                      key={`${chatMessage.role}-${index}`}
                      className={cn(
                        "flex",
                        chatMessage.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                          chatMessage.role === "user"
                            ? "rounded-br-md bg-indigo-600 text-white"
                            : "rounded-bl-md bg-slate-100 text-slate-900"
                        )}
                      >
                        {chatMessage.content}
                      </div>
                    </div>
                  ))}

                  {isAiParsing ? (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-700 shadow-sm">
                        Parsing details...
                      </div>
                    </div>
                  ) : null}
                </div>

                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleAiSubmit}>
                  <Input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="e.g. Hilton Berlin, May 1-3, 2 adults, I found it for 240 EUR"
                    className="bg-white"
                    disabled={isAiParsing}
                  />
                  <Button
                    type="submit"
                    disabled={isAiParsing || chatInput.trim().length === 0}
                    className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    {isAiParsing ? "Parsing..." : "Send"}
                  </Button>
                </form>

                <div className="flex flex-wrap gap-2">
                  {requiredAiFields.map(({ key, label }) => {
                    const fieldValue = collectedData[key];
                    const isMissing = missingFieldSet.has(key);

                    return (
                      <Badge
                        key={key}
                        variant={isMissing ? "outline" : "secondary"}
                        className={cn(
                          isMissing
                            ? "border-indigo-200 bg-white/70 text-indigo-700"
                            : "bg-emerald-100 text-emerald-800"
                        )}
                      >
                        {label}: {formatCollectedValue(key, fieldValue)}
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {aiReadyForManualCheck ? (
                    <>
                      <Badge className="bg-emerald-600 text-white">
                        All required details captured
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-indigo-200 bg-white/70 hover:bg-indigo-50"
                        onClick={() => setActiveInputMode("manual")}
                      >
                        Review manual form
                      </Button>
                    </>
                  ) : (
                    <span>
                      Still needed: {missingAiFields.map((field) => field.label).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {activeInputMode === "manual" ? (
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="current-best-price">
                        <DollarSign className="size-4" />
                        Your current best price
                      </Label>
                      <span className="text-xs text-muted-foreground">Currency</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_7.25rem] gap-2">
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
                      <Select
                        value={form.currency}
                        onValueChange={(value) => {
                          if (value && currencies.includes(value as SupportedCurrency)) {
                            updateForm("currency", value as SupportedCurrency);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Currency" />
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
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-700/30 transition-all duration-300 hover:from-blue-500 hover:via-indigo-500 hover:to-blue-500 hover:shadow-indigo-700/40"
                  disabled={isSearching || isChecking}
                >
                  <Search className="size-4" />
                  {isSearching
                    ? "Searching hotel..."
                    : isChecking
                      ? "Checking price..."
                      : "Check trivago price"}
                </Button>
              </form>
            ) : null}
          </CardContent>

          {error ? (
            <CardFooter className="border-t border-rose-200/70 bg-rose-50/80">
              <Alert variant="destructive" className="border-rose-200/60 bg-rose-50">
                <TrendingUp className="size-4" />
                <AlertTitle>Could not complete request</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardFooter>
          ) : null}
        </Card>

        {suggestions.length > 0 ? (
          <Card
            size="sm"
            className="rounded-2xl border border-indigo-100/70 bg-card/92 shadow-[0_12px_35px_-24px_rgba(37,99,235,0.45)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_46px_-24px_rgba(37,99,235,0.52)]"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Hotel className="size-4 text-indigo-600" />
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
                className="border-indigo-200 bg-white/70 hover:bg-indigo-50"
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
          <Card
            className={`rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${
              resultTone === "win"
                ? "border-emerald-200/90 bg-emerald-50/85 shadow-[0_14px_40px_-24px_rgba(5,150,105,0.45)]"
                : resultTone === "lose"
                  ? "border-rose-200/90 bg-rose-50/85 shadow-[0_14px_40px_-24px_rgba(225,29,72,0.42)]"
                  : "border-indigo-100/80 bg-card/92 shadow-[0_14px_40px_-24px_rgba(37,99,235,0.4)]"
            }`}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                <DollarSign className="size-5" />
                Price comparison
                {resultTone === "win" ? (
                  <Badge className="bg-emerald-600 text-white">Trivago wins</Badge>
                ) : resultTone === "lose" ? (
                  <Badge className="bg-rose-600 text-white">Your deal wins</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                {result.totalResults} trivago offer(s) returned for this stay.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.bestDeal ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-white/80">
                      {result.bestDeal.accommodation_name}
                    </Badge>
                    <Badge variant="outline" className="bg-white/70">
                      {result.bestDeal.currency || "N/A"}
                    </Badge>
                    {comparison ? (
                      comparison.difference > 0 ? (
                        <Badge className="bg-emerald-600 text-white">
                          <TrendingDown className="size-3" />
                          Better by {formatDelta(comparison.difference)}
                        </Badge>
                      ) : comparison.difference < 0 ? (
                        <Badge className="bg-rose-600 text-white">
                          <TrendingUp className="size-3" />
                          Higher by {formatDelta(comparison.difference)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-white/70">
                          Same price as your deal
                        </Badge>
                      )
                    ) : null}
                  </div>

                  <div className="grid gap-3 rounded-xl border border-white/70 bg-white/70 p-3 md:grid-cols-2">
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
                    <Alert className="border-amber-200/70 bg-amber-50/90 text-amber-900">
                      <TrendingUp className="size-4" />
                      <AlertTitle>Currency mismatch</AlertTitle>
                      <AlertDescription className="text-amber-800/90">
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
                      className="border-indigo-200 bg-white/70 hover:bg-indigo-50"
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
                <Alert className="border-amber-200/70 bg-amber-50/90 text-amber-900">
                  <TrendingUp className="size-4" />
                  <AlertTitle>No available deal found</AlertTitle>
                  <AlertDescription className="text-amber-800/90">
                    Try changing your dates or selecting a different hotel suggestion.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : null}

        <footer className="pb-2 text-center text-xs text-muted-foreground">
          Powered by <TrivagoLogo className="inline-block align-middle" />
        </footer>
      </div>
    </div>
  );
}
