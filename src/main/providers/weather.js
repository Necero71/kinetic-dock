'use strict';
const CODES = [[0, 'Clear'], [3, 'Cloudy'], [48, 'Fog'], [57, 'Drizzle'], [67, 'Rain'], [77, 'Snow'], [82, 'Showers'], [86, 'Snow showers'], [99, 'Storm']];
const describe = (code) => CODES.find(([max]) => code <= max)?.[1] ?? 'Unknown';

const places = new Map();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
  return res.json();
}

async function weather({ city }) {
  if (!city) throw new Error('Set a city in Settings');
  if (!places.has(city)) {
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`);
    if (!geo.results?.length) throw new Error(`City not found: ${city}`);
    places.set(city, geo.results[0]);
  }
  const p = places.get(city);
  const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto&forecast_days=5&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`);
  return {
    place: `${p.name}, ${p.country_code}`,
    temp: Math.round(f.current.temperature_2m),
    text: describe(f.current.weather_code),
    wind: Math.round(f.current.wind_speed_10m),
    humidity: f.current.relative_humidity_2m,
    days: f.daily.time.map((date, i) => ({
      date,
      text: describe(f.daily.weather_code[i]),
      max: Math.round(f.daily.temperature_2m_max[i]),
      min: Math.round(f.daily.temperature_2m_min[i]),
      rain: f.daily.precipitation_probability_max[i]
    }))
  };
}

module.exports = { weather, describe };
