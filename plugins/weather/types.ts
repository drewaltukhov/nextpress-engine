export interface ForecastDay {
  /** ISO date "YYYY-MM-DD" — used to derive the weekday label client/server-side. */
  date: string;
  weatherCode: number;
  icon: string;
  description: string;
  high: number;
  low: number;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  high: number;
  low: number;
  units: "fahrenheit" | "celsius";
  description: string;
  icon: string;
  city: string;
  /** Next 3 days, excluding today. Empty/undefined when the API omits daily fields. */
  forecast?: ForecastDay[];
}

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string; // state/province
}

/** WMO Weather interpretation codes → emoji + description */
export const WEATHER_CODES: Record<number, { icon: string; description: string }> = {
  0:  { icon: "☀️", description: "Clear sky" },
  1:  { icon: "🌤", description: "Mainly clear" },
  2:  { icon: "⛅", description: "Partly cloudy" },
  3:  { icon: "☁️", description: "Overcast" },
  45: { icon: "🌫", description: "Fog" },
  48: { icon: "🌫", description: "Depositing rime fog" },
  51: { icon: "🌦", description: "Light drizzle" },
  53: { icon: "🌦", description: "Moderate drizzle" },
  55: { icon: "🌧", description: "Dense drizzle" },
  56: { icon: "🌧", description: "Freezing drizzle" },
  57: { icon: "🌧", description: "Dense freezing drizzle" },
  61: { icon: "🌧", description: "Slight rain" },
  63: { icon: "🌧", description: "Moderate rain" },
  65: { icon: "🌧", description: "Heavy rain" },
  66: { icon: "🌧", description: "Freezing rain" },
  67: { icon: "🌧", description: "Heavy freezing rain" },
  71: { icon: "❄️", description: "Slight snowfall" },
  73: { icon: "❄️", description: "Moderate snowfall" },
  75: { icon: "❄️", description: "Heavy snowfall" },
  77: { icon: "❄️", description: "Snow grains" },
  80: { icon: "🌦", description: "Slight rain showers" },
  81: { icon: "🌧", description: "Moderate rain showers" },
  82: { icon: "🌧", description: "Violent rain showers" },
  85: { icon: "🌨", description: "Slight snow showers" },
  86: { icon: "🌨", description: "Heavy snow showers" },
  95: { icon: "⛈", description: "Thunderstorm" },
  96: { icon: "⛈", description: "Thunderstorm with slight hail" },
  99: { icon: "⛈", description: "Thunderstorm with heavy hail" },
};

export function decodeWeather(code: number): { icon: string; description: string } {
  return WEATHER_CODES[code] ?? { icon: "🌡", description: "Unknown" };
}
