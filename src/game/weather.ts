export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog';

export interface WeatherEffect {
  label: string;
  grip: number; // 路面グリップの倍率
  brake: number; // 制動の倍率
  wet: boolean; // 濡れた路面 (雨用タイヤの効果が出る)
  wind: number; // 横風の強さ
  sky: number;
  fogNear: number;
  fogFar: number;
  rain: number; // 雨粒の密度 0〜1
}

export const WEATHER: Record<Weather, WeatherEffect> = {
  sunny: { label: '晴れ', grip: 1, brake: 1, wet: false, wind: 0, sky: 0x87ceeb, fogNear: 250, fogFar: 1000, rain: 0 },
  cloudy: { label: '曇り', grip: 0.98, brake: 1, wet: false, wind: 0, sky: 0x9aa5ae, fogNear: 200, fogFar: 800, rain: 0 },
  rain: { label: '雨', grip: 0.8, brake: 0.85, wet: true, wind: 0, sky: 0x5f6b75, fogNear: 120, fogFar: 520, rain: 0.5 },
  storm: { label: '嵐', grip: 0.65, brake: 0.75, wet: true, wind: 5, sky: 0x3d464f, fogNear: 100, fogFar: 400, rain: 1 },
  fog: { label: '霧', grip: 1, brake: 1, wet: false, wind: 0, sky: 0xcfd6dc, fogNear: 12, fogFar: 140, rain: 0 },
};

export function pickWeather(weights: Partial<Record<Weather, number>>, rand = Math.random): Weather {
  const entries = Object.entries(weights) as [Weather, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [weather, w] of entries) {
    r -= w;
    if (r < 0) return weather;
  }
  return entries[0][0];
}
