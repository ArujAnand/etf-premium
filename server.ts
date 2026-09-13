import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Advisor API endpoint
app.post("/api/advisor", async (req, res) => {
  try {
    const {
      symbol,
      name,
      currentPrice,
      currentNav,
      currentPremium,
      minPremium,
      maxPremium,
      medianPremium,
      percentileRank,
      avg1Y,
      avg3Y,
      recentMAs,
      userPosition,
    } = req.body;

    const holdingStatus = userPosition?.status || "holding";
    const avgCost = userPosition?.averageCost ? Number(userPosition.averageCost) : null;
    const horizon = userPosition?.horizon || "medium";

    // Underlying constituents context
    const constituentsContext =
      symbol === "MAFANG"
        ? "Tracks NYSE FANG+ Index: 10 equal-weighted mega-cap US growth & tech leaders: Meta (META), Apple (AAPL), Amazon (AMZN), Netflix (NFLX), Alphabet (GOOGL), Microsoft (MSFT), NVIDIA (NVDA), Tesla (TSLA), Broadcom (AVGO), and Snowflake (SNOW)."
        : "Tracks S&P 500 Top 50 Index: Top 50 mega-cap US blue chips including Apple, Microsoft, NVIDIA, Amazon, Alphabet, Meta, Berkshire Hathaway, Eli Lilly, Broadcom, and JPMorgan Chase.";

    const ai = getGemini();

    if (ai) {
      const prompt = `
You are an institutional ETF strategist and quant analyst specializing in Indian international ETFs (such as ${symbol} - ${name}) traded on the National Stock Exchange of India (NSE).

CONTEXT ON INDIAN INTERNATIONAL ETFS:
- Due to RBI / SEBI industry-wide overseas investment caps for mutual funds, AMCs frequently cannot create fresh ETF units. When Indian domestic demand surges for US tech stocks, liquidity dries up and market prices on NSE trade at exorbitant premiums (+10% to +35%+) over the actual End-of-Day Net Asset Value (NAV).
- An investor buying at a +25% premium is paying ₹125 for ₹100 of underlying US shares. If RBI relaxes limits or investor euphoria cools, the premium can collapse from +25% to +2% in days, causing a severe capital loss even if the underlying US tech stocks appreciate!

CURRENT LIVE DATA FOR ${symbol} (${name}):
- Underlying Assets: ${constituentsContext}
- Current Market Price (NSE): ₹${currentPrice?.toFixed(2)}
- Current Official EOD NAV: ₹${currentNav?.toFixed(4)}
- Current Premium to NAV: ${currentPremium > 0 ? "+" : ""}${currentPremium?.toFixed(2)}%
- Historical Premium Range: Min ${minPremium?.toFixed(2)}% to Max ${maxPremium?.toFixed(2)}%
- Historical Median Premium: ${medianPremium?.toFixed(2)}%
- 1-Year Average Premium: ${avg1Y !== null && avg1Y !== undefined ? `${avg1Y.toFixed(2)}%` : "N/A"}
- 3-Year Average Premium: ${avg3Y !== null && avg3Y !== undefined ? `${avg3Y.toFixed(2)}%` : "N/A"}
- Current Percentile Rank (Since Inception): ${percentileRank !== null && percentileRank !== undefined ? `${percentileRank.toFixed(0)}th percentile` : "N/A"}
- Recent Moving Averages: 30D MA = ${recentMAs?.["30"]?.toFixed(2)}%, 90D MA = ${recentMAs?.["90"]?.toFixed(2)}%

USER'S SPECIFIC SITUATION:
- Position Status: ${holdingStatus.toUpperCase()}
- User Cost Basis: ${avgCost ? `₹${avgCost.toFixed(2)}` : "Not specified"}
- Time Horizon: ${horizon.toUpperCase()}
- User's Intent/Query: The user wants to know what action to take (Buy, Sell/Trim, Hold, Wait to Buy Low) by coupling historical premium range extremes with current global market cues, US macro/micro trends for the constituent stocks, and risk-reward dynamics.

Please provide a sophisticated, objective, and actionable strategic analysis.
Return your answer in strictly valid JSON with the following structure:
{
  "action": "TRIM_PROFIT" | "SELL_ALL" | "HOLD" | "ACCUMULATE" | "WAIT_FOR_DIP" | "AVOID",
  "actionTitle": "Short punchy headline recommendation (e.g. 'Tactical Profit Booking: Premium in 92nd Historical Percentile')",
  "riskRewardScore": "FAVORABLE_FOR_SELL" | "NEUTRAL" | "FAVORABLE_FOR_BUY",
  "historicalPremiumInsight": "Detailed explanation of where this premium sits historically, mean-reversion probability, and previous cycle behavior.",
  "macroAndConstituentCues": "Analysis of current US tech mega-cap sentiment, earnings cycle, Fed rate expectations, AI infrastructure capex trends, and USD/INR currency tailwinds.",
  "positionAdvice": "Specific tactical action tailored to the user (e.g., if holding at profit: percentage to trim; if looking to enter: recommended re-entry premium zone).",
  "targetBands": {
    "recommendedExitZone": "e.g., Premium > 20%",
    "fairValueAccumulateZone": "e.g., Premium 2% - 7%",
    "bargainDiscountZone": "e.g., Premium < 1% or Discount"
  },
  "scenarioImpact": "Clear mathematical scenario explaining what happens to net returns if underlying US stocks move vs if premium expands/compresses.",
  "keyRisks": ["Risk 1", "Risk 2", "Risk 3"]
}
`;

      // Resilient model fallback in case of temporary 503 capacity spikes
      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            return res.json({
              source: "gemini",
              model: modelName,
              ...parsed,
            });
          }
        } catch (modelErr: any) {
          console.warn(`Model ${modelName} call issue, trying next:`, modelErr?.message || modelErr);
        }
      }
    }

    // Rule-based institutional quant engine fallback (when API key is unset or rate limited)
    const isPremiumHigh = (percentileRank ?? 50) >= 80 || currentPremium > 15;
    const isPremiumModerate = (percentileRank ?? 50) >= 40 && (percentileRank ?? 50) < 80;
    const isPremiumLowOrDiscount = (percentileRank ?? 50) < 40 || currentPremium < 3;

    let action = "HOLD";
    let actionTitle = "Hold Position — Premium Near Historical Equilibrium";
    let riskRewardScore = "NEUTRAL";
    let positionAdvice = "";

    if (holdingStatus === "holding" || holdingStatus === "considering_exit") {
      if (isPremiumHigh) {
        action = "TRIM_PROFIT";
        actionTitle = `Tactical Profit Taking — Current Premium (${currentPremium.toFixed(1)}%) in ${percentileRank?.toFixed(0) || "Top"}th Percentile`;
        riskRewardScore = "FAVORABLE_FOR_SELL";
        positionAdvice = `Given that ${symbol}'s premium is near the top of its historical band (Max: ${maxPremium.toFixed(1)}%, Median: ${medianPremium.toFixed(1)}%), you are capturing an artificial markup created by domestic liquidity constraints. Consider locking in gains on 30%–50% of your holdings. When domestic demand cools or the AMC window opens, the premium historically mean-reverts toward ${medianPremium.toFixed(1)}%, providing an opportunity to buy back more units at a cheaper valuation.`;
      } else if (isPremiumLowOrDiscount) {
        action = "HOLD";
        actionTitle = `Hold Core Position — Premium (${currentPremium.toFixed(1)}%) Offers Low Arbitrage Drag`;
        riskRewardScore = "FAVORABLE_FOR_BUY";
        positionAdvice = `The premium is trading below its historical median (${medianPremium.toFixed(1)}%). You are not bearing significant overvaluation risk on the ETF wrapper. Hold your position to participate directly in the underlying constituent earnings growth.`;
      } else {
        action = "HOLD";
        actionTitle = `Hold — Premium (${currentPremium.toFixed(1)}%) Within Normal Operating Corridor`;
        positionAdvice = `The current premium of ${currentPremium.toFixed(1)}% is aligned with the 1Y average (${avg1Y?.toFixed(1) || medianPremium.toFixed(1)}%). Maintain your existing position with trailing profit targets.`;
      }
    } else {
      // Looking to buy / enter
      if (isPremiumHigh) {
        action = "WAIT_FOR_DIP";
        actionTitle = `Wait for Premium Compression — Avoid Buying at Inflated ${currentPremium.toFixed(1)}% Markup`;
        riskRewardScore = "FAVORABLE_FOR_SELL";
        positionAdvice = `Entering now means paying ₹${currentPrice.toFixed(2)} for underlying assets worth only ₹${currentNav.toFixed(4)}. Even if the underlying US tech constituents rally +5%, if the ETF premium compresses by -10% back toward its median, your net position will experience negative returns. Stagger any purchases or wait until the premium compresses below 8%.`;
      } else if (isPremiumLowOrDiscount) {
        action = "ACCUMULATE";
        actionTitle = `Favorable Entry Window — Premium (${currentPremium.toFixed(1)}%) Near Historical Lows`;
        riskRewardScore = "FAVORABLE_FOR_BUY";
        positionAdvice = `The premium is significantly compressed compared to historical peaks. This presents a favorable risk-reward entry window with minimal valuation drag relative to official NAV.`;
      } else {
        action = "WAIT_FOR_DIP";
        actionTitle = `Staggered Entry Only — Premium (${currentPremium.toFixed(1)}%) Near Mid-Band`;
        positionAdvice = `Accumulate via Systematic Investment (SIP) or staggered tranches rather than lump-sum deployment.`;
      }
    }

    return res.json({
      source: "quant_engine",
      action,
      actionTitle,
      riskRewardScore,
      historicalPremiumInsight: `${symbol} has historically traded between ${minPremium.toFixed(1)}% and ${maxPremium.toFixed(1)}% premium with a median of ${medianPremium.toFixed(1)}%. At ${currentPremium.toFixed(2)}% (${percentileRank?.toFixed(0) || "N/A"}th percentile), the market price has diverged significantly from NAV, demonstrating strong historical mean-reversion tendencies over 90-day cycles.`,
      macroAndConstituentCues: `The underlying constituents (${constituentsContext}) continue to generate robust free-cash-flow and AI infrastructure demand. However, Indian ETF unit supply freezes (due to RBI limits) create localized price spikes on NSE detached from underlying US equity values.`,
      positionAdvice,
      targetBands: {
        recommendedExitZone: `Premium > ${(medianPremium + 12).toFixed(1)}%`,
        fairValueAccumulateZone: `Premium 2.0% - ${(medianPremium + 3).toFixed(1)}%`,
        bargainDiscountZone: `Premium < 1.0% or Discount`,
      },
      scenarioImpact: `If underlying US stocks rally +5% but the NSE premium compresses from ${currentPremium.toFixed(1)}% down to ${medianPremium.toFixed(1)}%, your net return would be approx ${((1 + 0.05) * ((100 + medianPremium) / (100 + currentPremium)) - 1) * 100 > 0 ? "+" : ""}${(((1 + 0.05) * ((100 + medianPremium) / (100 + currentPremium)) - 1) * 100).toFixed(2)}%. Preserving capital requires managing the premium component.`,
      keyRisks: [
        "Sudden expansion or removal of RBI overseas investment limits by SEBI.",
        "Unhedged USD/INR currency fluctuation impacting NAV.",
        "After-hours US market volatility occurring while NSE is closed.",
      ],
    });
  } catch (err: any) {
    console.error("Advisor endpoint failure:", err);
    res.status(500).json({ error: err.message || "Failed to generate recommendation" });
  }
});

// Vite middleware in dev; static file serving in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Express v5 syntax
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
