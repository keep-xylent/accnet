/**
 * @file predict.js
 * @description 7-Day AI Rolling Forecast Engine untuk Roblox Limited items.
 * Mengimplementasikan model skor multi-faktor:
 *   S_t = 0.25*M_t + 0.20*D_t + 0.20*L_t + 0.15*V_t + 0.10*T_t + 0.10*R_t
 * dengan setiap variabel dinormalisasi ke rentang [-1, +1],
 * serta model probabilitas logistik multi-horizon:
 *   P_{t,h} = 1 / (1 + e^(-z_{t,h}))
 * di mana:
 *   z_{t,h} = beta_{0,h} + beta_{1,h}*M_t + beta_{2,h}*D_t + beta_{3,h}*L_t + beta_{4,h}*V_t + beta_{5,h}*T_t + beta_{6,h}*R_t
 */

// Horizon-calibrated regression coefficients beta for h = 1..7
export const HORIZON_BETAS = {
    1: { b0: 0.02, bM: 0.85, bD: 0.45, bL: 0.40, bV: 0.20, bT: 0.65, bR: 0.55 },
    2: { b0: 0.03, bM: 0.72, bD: 0.55, bL: 0.48, bV: 0.22, bT: 0.55, bR: 0.50 },
    3: { b0: 0.04, bM: 0.60, bD: 0.65, bL: 0.54, bV: 0.25, bT: 0.45, bR: 0.45 },
    4: { b0: 0.05, bM: 0.48, bD: 0.72, bL: 0.58, bV: 0.28, bT: 0.38, bR: 0.40 },
    5: { b0: 0.05, bM: 0.38, bD: 0.78, bL: 0.62, bV: 0.30, bT: 0.32, bR: 0.35 },
    6: { b0: 0.06, bM: 0.30, bD: 0.82, bL: 0.65, bV: 0.32, bT: 0.28, bR: 0.30 },
    7: { b0: 0.06, bM: 0.24, bD: 0.85, bL: 0.68, bV: 0.34, bT: 0.25, bR: 0.26 }
};

/**
 * Membulatkan angka sesuai konvensi evaluator Rolimon's
 * @param {number} val 
 * @returns {number}
 */
export function rolimonsRound(val) {
    if (!val || val <= 0) return 0;
    if (val < 1000) return Math.round(val / 50) * 50;
    if (val < 10000) return Math.round(val / 500) * 500;
    if (val < 50000) return Math.round(val / 1000) * 1000;
    if (val < 100000) return Math.round(val / 2000) * 2000;
    if (val < 500000) return Math.round(val / 5000) * 5000;
    return Math.round(val / 10000) * 10000;
}

/**
 * Kalkulasi model prediksi rolling 7 hari
 * @param {Object} params
 * @param {Array<number>} params.history - Riwayat harga (minimal 7 hari)
 * @param {number} params.currentPrice - RAP atau harga saat ini
 * @param {string|number} params.demand - Tingkat demand item
 * @param {string|number} params.trend - Tren pasar item
 * @param {number} params.salesPerDay - Kecepatan penjualan harian
 * @param {number} params.value - Nilai Rolimon's (jika ada)
 * @param {boolean} params.isProjected - Status indikator manipulasi RAP
 * @returns {Object} Hasil prediksi multi-horizon lengkap
 */
export function computePredictionModel({
    history = [],
    currentPrice = 1000,
    demand = 'Normal',
    trend = 'Stable',
    salesPerDay = 0,
    value = null,
    isProjected = false
} = {}) {
    const p = (Array.isArray(history) && history.length >= 7)
        ? history.slice(0, 7)
        : [currentPrice, currentPrice, currentPrice, currentPrice, currentPrice, currentPrice, currentPrice];
    const todayPrice = Number(p[6]) || Number(currentPrice) || 1000;

    // 1. M_t: Momentum (7-day rate of change vs 7-day Simple Moving Average)
    const sma7 = p.reduce((a, b) => a + Number(b), 0) / p.length;
    const momRaw = sma7 > 0 ? (todayPrice - sma7) / sma7 : 0;
    const Mt = Math.max(-1, Math.min(1, momRaw / 0.12));

    // 2. D_t: Demand Normalized into [-1, +1]
    const demandMap = {
        'AMAZING': 1.0,
        'HIGH': 0.5,
        'NORMAL': 0.0,
        'LOW': -0.5,
        'NONE': -1.0,
        'UNKNOWN': -1.0,
        'TERRIBLE': -1.0
    };
    const numDemandMap = { 0: -1.0, 1: -0.5, 2: 0.0, 3: 0.5, 4: 1.0, '-1': -1.0 };
    let Dt = 0.0;
    if (typeof demand === 'number' && numDemandMap[demand] !== undefined) {
        Dt = numDemandMap[demand];
    } else {
        Dt = demandMap[String(demand || '').trim().toUpperCase()] ?? 0.0;
    }

    // 3. L_t: Liquidity & Velocity (Sales / Day)
    const spd = typeof salesPerDay === 'number' ? salesPerDay : Number(salesPerDay) || 0;
    let Lt = -1.0;
    if (spd >= 10) Lt = 1.0;
    else if (spd >= 4) Lt = 0.6;
    else if (spd >= 1.5) Lt = 0.2;
    else if (spd >= 0.5) Lt = -0.3;
    else if (spd > 0) Lt = -0.7;
    else Lt = -1.0;

    // 4. V_t: Volatility (Coefficient of Variation)
    const variance = p.reduce((acc, val) => acc + Math.pow(Number(val) - sma7, 2), 0) / p.length;
    const stdDev = Math.sqrt(variance);
    const cv = sma7 > 0 ? stdDev / sma7 : 0;
    let Vt;
    if (cv < 0.01) Vt = -0.4;
    else if (cv <= 0.08) Vt = 0.7;
    else if (cv <= 0.18) Vt = 0.2;
    else Vt = -0.8;

    // 5. T_t: Market Trend Score
    const trendMap = {
        'RAISING': 1.0,
        'STABLE': 0.0,
        'LOWERING': -1.0,
        'FLUCTUATING': 0.25,
        'UNSTABLE': -0.4,
        'NONE': 0.0,
        'RECOVERING': 0.5
    };
    const numTrendMap = { 0: -1.0, 1: -0.4, 2: 0.0, 3: 1.0, 4: 0.25, '-1': 0.0 };
    let Tt = 0.0;
    if (typeof trend === 'number' && numTrendMap[trend] !== undefined) {
        Tt = numTrendMap[trend];
    } else {
        Tt = trendMap[String(trend || '').trim().toUpperCase()] ?? 0.0;
    }

    // 6. R_t: Ratio of Actual Selling Price/Value vs Current RAP
    const compValue = (value && Number(value) > 0) ? Number(value) : todayPrice;
    const ratioRaw = todayPrice > 0 ? (compValue - todayPrice) / todayPrice : 0;
    const Rt = Math.max(-1, Math.min(1, ratioRaw / 0.20));

    // Penalty for projected items (manipulated RAP risk)
    const projPenalty = isProjected ? -0.45 : 0;

    // Composite Daily Score S_t
    const St = Math.max(-1, Math.min(1,
        (0.25 * Mt) + (0.20 * Dt) + (0.20 * Lt) + (0.15 * Vt) + (0.10 * Tt) + (0.10 * Rt) + projPenalty
    ));

    const horizons = [];
    const forecastPrices = [];
    const lowerBounds = [];
    const upperBounds = [];

    let currentForecastPrice = todayPrice;
    const baseDailyVol = Math.max(0.015, Math.min(0.06, cv));

    for (let h = 1; h <= 7; h++) {
        const beta = HORIZON_BETAS[h];
        const z = beta.b0 +
            (beta.bM * Mt) +
            (beta.bD * Dt) +
            (beta.bL * Lt) +
            (beta.bV * Vt) +
            (beta.bT * Tt) +
            (beta.bR * Rt) +
            (projPenalty * 1.5);

        const Pup = 1 / (1 + Math.exp(-z));
        const Pdown = 1 - Pup;

        const directionalDrift = (Pup - 0.5) * 2;
        const dailyRate = directionalDrift * (0.018 * Math.pow(0.92, h - 1));
        currentForecastPrice = Math.max(1, Math.round(currentForecastPrice * (1 + dailyRate)));

        const spread = baseDailyVol * Math.sqrt(h) * 1.35;
        const low = Math.max(1, Math.round(currentForecastPrice * (1 - spread)));
        const high = Math.max(low, Math.round(currentForecastPrice * (1 + spread)));

        horizons.push({
            h,
            z: Number(z.toFixed(3)),
            Pup: Number((Pup * 100).toFixed(1)),
            Pdown: Number((Pdown * 100).toFixed(1)),
            price: currentForecastPrice,
            low,
            high
        });
        forecastPrices.push(currentForecastPrice);
        lowerBounds.push(low);
        upperBounds.push(high);
    }

    const day7 = horizons[6];
    let overallDirection = 'SIDEWAYS';
    if (St >= 0.12) overallDirection = 'BULLISH';
    else if (St <= -0.12) overallDirection = 'BEARISH';

    const primaryProb = St >= 0 ? day7.Pup : day7.Pdown;

    return {
        factors: {
            St: Number(St.toFixed(2)),
            Mt: Number(Mt.toFixed(2)),
            Dt: Number(Dt.toFixed(2)),
            Lt: Number(Lt.toFixed(2)),
            Vt: Number(Vt.toFixed(2)),
            Tt: Number(Tt.toFixed(2)),
            Rt: Number(Rt.toFixed(2)),
            projPenalty: Number(projPenalty.toFixed(2)),
            cv: Number(cv.toFixed(4)),
            sma7: Math.round(sma7)
        },
        horizons,
        forecastPrices,
        lowerBounds,
        upperBounds,
        overallDirection,
        primaryProb,
        expectedDay7Price: day7.price,
        rangeDay7: { min: day7.low, max: day7.high }
    };
}

/**
 * Engine Predictor Berorientasi Objek untuk Kemudahan Pemrosesan Koleksi/Batch
 */
export class PredictorEngine {
    constructor(customBetas = null) {
        this.betas = customBetas || HORIZON_BETAS;
    }

    calculate(item, options = {}) {
        const history = options.history || item.history || [];
        const currentPrice = Number(item.price ?? item.rap ?? item.currentPrice ?? 1000);
        const demand = item.demand ?? options.demand ?? 'Normal';
        const trend = item.trend ?? options.trend ?? 'Stable';
        const salesPerDay = options.salesPerDay ?? item.salesPerDay ?? item.avgSales ?? 0;
        const value = item.value ?? options.value ?? currentPrice;
        const isProjected = Boolean(item.projected ?? item.isProjected ?? item.isFlaggedProjected);

        return computePredictionModel({
            history,
            currentPrice,
            demand,
            trend,
            salesPerDay,
            value,
            isProjected
        });
    }

    forecastCurve(item, options = {}) {
        return this.calculate(item, options);
    }

    calculateBatch(itemsArray, options = {}) {
        if (!Array.isArray(itemsArray)) return { items: [], summary: null };

        let currentTotal = 0;
        let expectedTotalDay7 = 0;
        let minTotalDay7 = 0;
        let maxTotalDay7 = 0;

        const results = itemsArray.map(item => {
            const pred = this.calculate(item, options);
            const cur = Number(item.price ?? item.rap ?? 0);
            currentTotal += cur;
            expectedTotalDay7 += pred.expectedDay7Price;
            minTotalDay7 += pred.rangeDay7.min;
            maxTotalDay7 += pred.rangeDay7.max;
            return {
                id: item.assetId || item.id,
                name: item.name,
                currentPrice: cur,
                prediction: pred
            };
        });

        const netDelta = expectedTotalDay7 - currentTotal;
        const netDeltaPct = currentTotal > 0 ? Number(((netDelta / currentTotal) * 100).toFixed(2)) : 0;

        return {
            summary: {
                itemCount: results.length,
                currentTotal,
                expectedTotalDay7,
                rangeDay7: { min: minTotalDay7, max: maxTotalDay7 },
                netDelta,
                netDeltaPercent: netDeltaPct
            },
            items: results
        };
    }
}

// Cloudflare Pages Functions HTTP Handlers (/predict)
export async function onRequestPost(context) {
    try {
        const body = await context.request.json();
        const result = computePredictionModel(body);
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Failed to calculate prediction" }), {
            status: 400,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
}

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const price = Number(url.searchParams.get("price")) || 1000;
    const demand = url.searchParams.get("demand") || "Normal";
    const trend = url.searchParams.get("trend") || "Stable";
    const spd = Number(url.searchParams.get("spd") || url.searchParams.get("salesPerDay")) || 0;
    const value = Number(url.searchParams.get("value")) || price;
    const isProjected = url.searchParams.get("projected") === "true";

    const result = computePredictionModel({
        history: [price, price, price, price, price, price, price],
        currentPrice: price,
        demand,
        trend,
        salesPerDay: spd,
        value,
        isProjected
    });

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

// Default export singleton engine
const defaultEngine = new PredictorEngine();
export default {
    computePredictionModel,
    PredictorEngine,
    HORIZON_BETAS,
    rolimonsRound,
    calculate: (item, options) => defaultEngine.calculate(item, options),
    calculateBatch: (items, options) => defaultEngine.calculateBatch(items, options)
};
