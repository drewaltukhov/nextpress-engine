import type { ForecastDay, WeatherData } from "./types";

interface Props {
  data: WeatherData | null;
  showIcons: boolean;
}

/** "Mon", "Tue", … — derived from the ISO date string the API returns. */
function shortWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00`); // noon avoids TZ edge cases
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function ForecastStrip({ days, showIcons }: { days: ForecastDay[]; showIcons: boolean }) {
  if (days.length === 0) return null;
  return (
    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-4 gap-2">
      {days.map((d) => (
        <div key={d.date} className="flex flex-col items-center text-center min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
            {shortWeekday(d.date)}
          </div>
          {showIcons ? (
            <div className="text-xl leading-none mt-1" title={d.description}>{d.icon}</div>
          ) : (
            <div className="text-[10px] text-slate-500 mt-1 truncate w-full" title={d.description}>
              {d.description}
            </div>
          )}
          <div className="text-xs text-slate-600 mt-1 tabular-nums">
            <span className="font-medium text-slate-900">{d.high}°</span>
            <span className="text-slate-400"> / {d.low}°</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeatherWidget({ data, showIcons }: Props) {
  if (!data) {
    return (
      <div className="text-sm text-slate-400 italic py-4 text-center">
        Weather data unavailable
      </div>
    );
  }

  const unit = data.units === "celsius" ? "°C" : "°F";
  const forecast = data.forecast ?? [];

  return (
    <div>
      {showIcons ? (
        <div className="flex items-center gap-4">
          <span className="text-4xl leading-none">{data.icon}</span>
          <div>
            <div className="text-3xl font-bold text-brand-navy tracking-tight">
              {data.temperature}{unit}
            </div>
            <div className="text-sm text-slate-600 mt-0.5">{data.description}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              H {data.high}{unit} · L {data.low}{unit}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-3xl font-bold text-brand-navy tracking-tight">
            {data.temperature}{unit}
            <span className="text-sm font-normal text-slate-500 ml-2">
              {data.description}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            High {data.high}{unit} · Low {data.low}{unit} · Humidity {data.humidity}% · Wind {data.windSpeed} {data.units === "fahrenheit" ? "mph" : "km/h"}
          </div>
        </>
      )}
      <ForecastStrip days={forecast} showIcons={showIcons} />
    </div>
  );
}
