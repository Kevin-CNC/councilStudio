import type { ModelOption, JudgeResult } from "@/types";

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-5.5", name: "GPT-5.5", provider: "openai", contextWindow: 200000, costPer1kIn: 0.01, costPer1kOut: 0.03 },
  { id: "gpt-5.5-mini", name: "GPT-5.5 Mini", provider: "openai", contextWindow: 200000, costPer1kIn: 0.005, costPer1kOut: 0.015 },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", contextWindow: 200000, costPer1kIn: 0.015, costPer1kOut: 0.075 },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic", contextWindow: 200000, costPer1kIn: 0.003, costPer1kOut: 0.015 },
  { id: "or-perplexity-sonar-pro", name: "Perplexity Sonar Pro", provider: "openrouter", contextWindow: 128000, costPer1kIn: 0.003, costPer1kOut: 0.015 },
  { id: "or-llama-3.3-70b", name: "Llama 3.3 70B", provider: "openrouter", contextWindow: 128000, costPer1kIn: 0.0004, costPer1kOut: 0.0004 },
  { id: "or-deepseek-r1", name: "DeepSeek R1", provider: "openrouter", contextWindow: 64000, costPer1kIn: 0.0005, costPer1kOut: 0.0022 },
  { id: "ollama-llama3.1-70b", name: "Llama 3.1 70B", provider: "ollama", contextWindow: 128000, costPer1kIn: 0, costPer1kOut: 0 },
  { id: "ollama-qwen2.5-72b", name: "Qwen 2.5 72B", provider: "ollama", contextWindow: 32000, costPer1kIn: 0, costPer1kOut: 0 },
  { id: "ollama-mistral-7b", name: "Mistral 7B", provider: "ollama", contextWindow: 32000, costPer1kIn: 0, costPer1kOut: 0 },
];

// Kept for future phases (Phase 4+ orchestration)
export const SAMPLE_JUDGE_RESULT: JudgeResult = {
  summary: "The council identified a real market gap but significant execution risks that could make or break the venture. The auto-scoping and trust problems are the critical unsolved challenges.",
  consensus: [
    "The micro-project freelance market is underserved and represents a genuine opportunity",
    "Auto-scoping is the hardest technical problem and the biggest execution risk",
    "Trust deficit from small businesses toward AI-mediated services is the #1 barrier to adoption",
    "Unit economics at the micro level ($500-2000 projects) are extremely tight and may not sustain operations",
    "Differentiation from Upwork/Fiverr must be clear and defensible before launch",
  ],
  disagreements: [
    "Whether the platform should focus on micro-projects or push toward higher-value engagements ($5K+)",
    "Whether AI-matching is defensible IP or a feature incumbents will replicate within months",
    "Escrow vs. no-escrow launch strategy — regulatory cost vs. trust-building necessity",
    "Marketplace timing — freelancing market may be shifting toward full-time employment",
  ],
  minorityViews: [
    "The entire marketplace model may be wrong — a 'pod-based' or co-op model could unlock more value",
    "AI matching isn't the core problem — building a freelancer co-pilot serving existing relationships might be more valuable",
    "The regulatory burden of payment processing (escrow) could exceed $500K before first transaction",
  ],
  recommendations: [
    "Start with manual matching in one vertical to prove value before automating",
    "Validate demand with 50+ small business interviews before building",
    "Target $2000+ average project size for sustainable unit economics",
    "Build trust features (guarantee, replacement) as day-one priorities",
    "Consider launching without escrow using existing payment rails (Stripe Connect)",
    "Invest heavily in the scoping tool as a standalone product — it's the most defensible IP",
  ],
  confidenceScore: 62,
  synthesis: `## Synthesis: AI Freelance Platform Analysis

The council reached moderate consensus that while the market opportunity is real, the execution complexity is severe. Here's the structured breakdown:

### Where the Council Agrees

**Market validation:** The gap in micro-project freelancing is genuine. No incumbent combines AI matching + auto-scoping + escrow. This could be a real advantage — if you can execute on all three.

**Critical challenges:** Auto-scoping and trust are the two hardest problems. The auto-scoping challenge is essentially an unsolved research problem (decomposing ambiguous requirements into fixed scope with current LLMs). Trust is a chicken-and-egg marketplace problem amplified by AI-mediated interactions.

**Economic reality:** At $500-2000 project sizes, the margins leave almost no room for error after payment processing, AI costs, and operational overhead.

### Where the Council Disagreed

The most productive disagreement was about **go-to-market strategy**. The Pragmatist and Creative advocated for niche-first approach (one vertical, manual matching). The Engineer and Researcher pushed for building the tech stack first (auto-scoping is the moat). The Critic argued go-to-market doesn't matter because the fundamental unit economics don't work.

### Minority Views Worth Noting

Two contrarian positions deserve attention:
1. **Pod-based model** (Creative): Instead of matching freelancers to projects, form persistent creative teams that develop collective knowledge. This sidesteps the cold-start marketplace problem entirely.
2. **Freelancer co-pivot** (Devil's Advocate): Rather than building a marketplace, build tools for existing freelancers — helping with proposals, scoping, and quality assessment. This serves 70M existing freelancers instead of creating new matching from scratch.

### Recommended Path Forward

1. **Week 1-2:** Conduct 50 customer discovery interviews with small business owners
2. **Week 3-4:** Run a manual matching experiment (no tech) in ONE vertical
3. **Month 2-3:** Build the scoping tool as standalone product
4. **Month 4-6:** If manual matching shows PMF, build the platform with escrow-light approach

The key insight: **the scoping tool is your most defensible IP**. Everything else can be replicated. Invest heavily there.`,
  tokensIn: 12450,
  tokensOut: 3280,
  latencyMs: 4200,
};