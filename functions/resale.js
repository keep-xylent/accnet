// In-memory cache for resale data (15 minutes)
const resaleCache = new Map();

export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");

    if (!assetId || !/^\d+$/.test(assetId)) {
        return new Response(JSON.stringify({ error: "Valid assetId required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    const now = Date.now();
    const cached = resaleCache.get(assetId);
    if (cached && (now - cached.timestamp < 900000)) {
        return new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=600"
            }
        });
    }

    try {
        const robloxRes = await fetch(`https://economy.roblox.com/v1/assets/${assetId}/resale-data`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });

        if (!robloxRes.ok) {
            // Items with no active resale or non-resellable return 400/404 from Roblox
            if (robloxRes.status === 400 || robloxRes.status === 404) {
                const zeroResult = {
                    assetId: Number(assetId),
                    salesPerDay: 0.0,
                    isUnderOne: true,
                    totalSales30d: 0,
                    recentAveragePrice: null,
                    available: false
                };
                resaleCache.set(assetId, { timestamp: now, data: zeroResult });
                return new Response(JSON.stringify(zeroResult), {
                    status: 200,
                    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }
                });
            }
            return new Response(JSON.stringify({ error: `Roblox API error: ${robloxRes.status}` }), {
                status: robloxRes.status,
                headers: { "Content-Type": "application/json" }
            });
        }

        const data = await robloxRes.json();
        const volumePoints = Array.isArray(data.volumeDataPoints) ? data.volumeDataPoints : [];
        
        let salesPerDay = 0.0;
        let totalSales30d = 0;

        if (volumePoints.length > 0) {
            const firstPtDate = new Date(volumePoints[0].date).getTime();
            const marketLatest = new Date("2025-01-31T00:00:00Z").getTime();
            const daysSinceLastSale = (marketLatest - firstPtDate) / (86400000);

            // If the item has not had a sale in over 60 days, sales velocity is 0
            if (daysSinceLastSale > 60) {
                salesPerDay = 0.0;
                totalSales30d = 0;
            } else {
                // Rolling 30-day window ending at the item's latest recorded transaction date
                const cutoff = firstPtDate - (30 * 86400000);
                const recentPoints = volumePoints.filter(p => {
                    const t = new Date(p.date).getTime();
                    return t >= cutoff && t <= firstPtDate;
                });
                totalSales30d = recentPoints.reduce((acc, pt) => acc + (Number(pt.value) || 0), 0);
                salesPerDay = Number((totalSales30d / 30).toFixed(2));
            }
        }

        const isUnderOne = salesPerDay < 1.0;

        const result = {
            assetId: Number(assetId),
            salesPerDay: salesPerDay,
            isUnderOne: isUnderOne,
            totalSales30d: totalSales30d,
            recentAveragePrice: data.recentAveragePrice || null,
            totalHistoricalSales: data.sales || null
        };

        // Cache result (15 min)
        resaleCache.set(assetId, { timestamp: now, data: result });

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=600"
            }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
