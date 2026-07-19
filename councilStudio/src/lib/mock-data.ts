import type { Persona, Session, PromptTemplate, ModelOption, CouncilRun, JudgeResult, PersonaResult } from "@/types";

export const SEED_PERSONAS: Persona[] = [
  {
    id: "person-pragmatist",
    name: "Pragmatist",
    provider: "openai",
    model: "gpt-5.5",
    systemPrompt: "You are a pragmatic problem-solver. Focus on what works in practice, not theory. Give concise, actionable advice. Prefer proven approaches over novel ones. Use bullet points.",
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    streaming: true,
    color: "#228CDB",
    order: 0,
    reasoningLevel: "medium",
  },
  {
    id: "person-engineer",
    name: "Engineer",
    provider: "anthropic",
    model: "claude-opus-4",
    systemPrompt: "You are a senior software engineer. Technical depth first. Code examples when helpful. Think step by step. Consider edge cases and error handling.",
    temperature: 0.4,
    maxTokens: 8192,
    enabled: true,
    streaming: true,
    color: "#17B890",
    order: 1,
    reasoningLevel: "high",
  },
  {
    id: "person-researcher",
    name: "Researcher",
    provider: "google",
    model: "gemini-2-pro",
    systemPrompt: "You are a research analyst. Ground responses in evidence. Cite sources. Present multiple perspectives. Distinguish fact from opinion.",
    temperature: 0.5,
    maxTokens: 8192,
    enabled: true,
    streaming: true,
    color: "#F59E0B",
    order: 2,
    reasoningLevel: "medium",
  },
  {
    id: "person-critic",
    name: "Critic",
    provider: "mistral",
    model: "mistral-large",
    systemPrompt: "You are a critical thinker. Challenge assumptions. Find flaws in reasoning. Identify risks and failure modes. Steel-man opposing views.",
    temperature: 0.6,
    maxTokens: 4096,
    enabled: true,
    streaming: true,
    color: "#EF4444",
    order: 3,
    reasoningLevel: "medium",
  },
  {
    id: "person-creative",
    name: "Creative",
    provider: "meta",
    model: "llama-3.3",
    systemPrompt: "You are a creative thinker. Generate unconventional ideas. Think laterally. Make unexpected connections. Use metaphors and analogies.",
    temperature: 0.9,
    maxTokens: 4096,
    enabled: true,
    streaming: true,
    color: "#8B5CF6",
    order: 4,
    reasoningLevel: "low",
  },
  {
    id: "person-devils-advocate",
    name: "Devil's Advocate",
    provider: "openai",
    model: "gpt-5.5",
    systemPrompt: "You argue against the prevailing view. Present the strongest case for the opposing position. Expose weaknesses in popular thinking.",
    temperature: 0.8,
    maxTokens: 4096,
    enabled: true,
    streaming: true,
    color: "#EC4899",
    order: 5,
    reasoningLevel: "medium",
  },
];

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-5.5", name: "GPT-5.5", provider: "openai", contextWindow: 200000, costPer1kIn: 0.01, costPer1kOut: 0.03 },
  { id: "gpt-5.5-mini", name: "GPT-5.5 Mini", provider: "openai", contextWindow: 200000, costPer1kIn: 0.005, costPer1kOut: 0.015 },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", contextWindow: 200000, costPer1kIn: 0.015, costPer1kOut: 0.075 },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic", contextWindow: 200000, costPer1kIn: 0.003, costPer1kOut: 0.015 },
  { id: "gemini-2-pro", name: "Gemini 2 Pro", provider: "google", contextWindow: 2000000, costPer1kIn: 0.005, costPer1kOut: 0.025 },
  { id: "gemini-2-flash", name: "Gemini 2 Flash", provider: "google", contextWindow: 1000000, costPer1kIn: 0.0001, costPer1kOut: 0.0004 },
  { id: "mistral-large", name: "Mistral Large", provider: "mistral", contextWindow: 128000, costPer1kIn: 0.008, costPer1kOut: 0.024 },
  { id: "llama-3.3", name: "Llama 3.3 70B", provider: "meta", contextWindow: 128000, costPer1kIn: 0.0004, costPer1kOut: 0.0004 },
  { id: "llama-3.1-405b", name: "Llama 3.1 405B", provider: "meta", contextWindow: 128000, costPer1kIn: 0.003, costPer1kOut: 0.003 },
];

export const SAMPLE_PROMPTS: PromptTemplate[] = [
  {
    id: "prompt-1",
    name: "Startup Idea Validation",
    description: "Analyze a startup idea from multiple angles",
    prompt: "Evaluate this startup idea: An AI-powered platform that connects freelance developers with small businesses for micro-projects. The AI matches skills, scopes work automatically, and handles payment escrow. What's the market potential, competition, and biggest risks?",
    category: "Business",
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: "prompt-2",
    name: "Architecture Decision",
    description: "Compare technical approaches to a problem",
    prompt: "We're building a real-time collaboration app (like Figma) and need to choose between WebSockets, Server-Sent Events, and WebRTC for the sync layer. Compare these approaches considering: latency, scalability, implementation complexity, and reliability for 100k concurrent users.",
    category: "Engineering",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    id: "prompt-3",
    name: "Product Strategy",
    description: "Multi-perspective product decision analysis",
    prompt: "Should we build a mobile-first or desktop-first experience for our B2B SaaS analytics tool? Our customers are data analysts who primarily work at their desks but also need to check reports on mobile during meetings.",
    category: "Product",
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: "prompt-4",
    name: "Code Review",
    description: "Comprehensive code review from different angles",
    prompt: "Review this implementation of a distributed rate limiter using Redis. Consider: correctness, edge cases, performance, security implications, and production readiness.",
    category: "Engineering",
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: "prompt-5",
    name: "Market Analysis",
    description: "Multi-perspective market opportunity assessment",
    prompt: "The EU just passed AI regulation requiring transparency reports for any AI system used in decision-making. What opportunities does this create for startups? How will this affect the AI industry in the next 3 years?",
    category: "Business",
    createdAt: Date.now() - 12 * 60 * 60 * 1000,
  },
];

export const SAMPLE_RESPONSES: Record<string, string> = {
  "person-pragmatist": `Here's my practical analysis:

## Key Takeaways

- **Market is real but crowded** — The freelance platform space has established players (Upwork, Fiverr). Differentiation through AI matching is plausible but not unique.
- **Unit economics are tricky** — Escrow + auto-scoping adds operational overhead. Margins will be thin on micro-projects.
- **Go niche first** — Don't try to serve "all small businesses." Pick one vertical (e.g., WordPress fixes, Shopify customizations) and own it.

## Action Items

1. Validate with 50 small business owners before building
2. Start with manual matching — prove the value, then automate
3. Target projects in the $500-2000 range (micro is too thin, macro is too competitive)
4. Build the escrow last — it's a commodity feature

## Biggest Risk

Trust. Small businesses won't trust AI-matched freelancers with their money. You need a strong guarantee/replacement policy from day one.`,

  "person-engineer": `## Technical Architecture Analysis

### AI Matching Engine
The matching algorithm is the core IP. I'd recommend:

\`\`\`typescript
// Approach: embedding-based similarity + constraint solving
interface MatchRequest {
  skills: SkillVector;        // Embedding in skill-space
  constraints: {
    budget: Range;
    timeline: DateRange;
    availability: TimeWindow;
  };
}

// 1. Vector search for skill-fit candidates (FAISS/pgvector)
// 2. Constraint filtering (hard filters)
// 3. Ranking model (learned from successful matches)
\`\`\`

### Auto-scoping Challenges
This is genuinely hard. Natural language requirements → fixed-scope work packages requires:
- A structured output schema (task breakdown with hours/materials)
- Confidence scoring (low confidence = flag for human review)
- Revision loop (freelancer can contest scope)

### Escrow Architecture
\`\`\`
┌──────────┐     ┌─────────┐     ┌────────────┐
│  Client   │────▶│ Escrow  │────▶│ Freelancer │
│  Funds    │     │ Service │     │ Milestone  │
└──────────┘     └─────────┘     └────────────┘
                      │
                 ┌────▼────┐
                 │ Dispute  │
                 │Resolver  │
                 └─────────┘
\`\`\`

### Tech Stack Recommendation
- **Matching**: Python (scikit-learn, pgvector) or Rust for performance
- **Escrow**: Stripe Connect with custom split payments
- **Real-time**: WebSockets for project communication
- **Search**: Meilisearch for freelancer discovery`,

  "person-researcher": `## Market Research: AI Freelance Platforms

### Market Size
- Global freelancing market: **$1.5T** (2024, Statista)
- AI-powered tools segment: **$28B** growing at 34% CAGR
- Small business digital services: **$340B** addressable

### Existing Competitors

| Platform | Focus | AI Features | Limitation |
|----------|-------|-------------|------------|
| Upwork | General freelance | Basic matching | No auto-scoping |
| Fiverr | Micro-services | Category-based | Low quality control |
| Toptal | Top 3% talent | Manual vetting | Enterprise pricing |
| Catalant | Strategy consulting | AI matching | Not dev-focused |

### Key Findings

1. **No incumbent combines AI matching + auto-scoping + escrow** — this gap is real
2. **Micro-project market is underserved** — $500-2000 projects lack dedicated platforms
3. **Trust deficit is the #1 barrier** (McKinsey 2024 survey: 67% of SMBs hesitate with AI-mediated services)

### Sources
- Statista Digital Market Outlook, 2024
- McKinsey "State of AI in Small Business" (2024)
- CB Insights Freelance Platform Report Q2 2024`,

  "person-critic": `## Critical Assessment: 7 Concerns

### 1. Competitive Moat is Weak
Your "AI matching" is not defensible. Upwork has 10x the data for training a matching algorithm. Fiverr can add auto-scoping in a quarter. What prevents incumbents from copying your features within 6 months?

### 2. Auto-scoping is a Research Problem, Not a Product Problem
Current LLMs cannot reliably decompose ambiguous requirements into fixed-scope work. You'll spend 18+ months on this alone, and it'll still fail 30% of the time. Each failure = customer support ticket + refund.

### 3. Two-Sided Marketplace Death Spiral
You need freelancers AND businesses simultaneously. Without volume on either side, matching quality drops, churn increases. This is the classic marketplace cold-start problem. Most fail here.

### 4. Regulatory Risk
Escrow + payment processing = money transmitter licenses in every US state (and EU). Legal costs alone could be $500K+ before you process first payment.

### 5. Unit Economics Don't Work at "Micro" Scale
If average project is $500, your take is $50-100. After payment processing (3%), escrow costs, AI inference costs, and support — your margin is nearly zero. You need $5K+ average project size to sustain the business.

### 6. Trust Requires Skin in the Game
"Strong guarantee" sounds good in a pitch deck. In practice, you're absorbing fraud risk from both sides. One bad actor can cost you more than 10 good projects generate.

### 7. Timing Problem
The freelance economy is shifting TOWARD full-time employment (LinkedIn 2024 data shows +23% YoY). Are you building against the trend?

**Bottom line:** Interesting idea with significant execution risk. The individual features exist elsewhere; the combination doesn't solve the fundamental marketplace and unit economics problems.`,

  "person-creative": `The freelance marketplace is dead. Long live the **Creative Syndicate**.

What if you flipped the entire model? Instead of matching freelancers to projects, you create *self-assembling creative teams* that form around problems — like a jazz ensemble improvising together.

### Radical Reframe

Don't build a platform. Build a **creative operating system**.

Imagine:
- Businesses don't post projects — they describe *challenges*
- AI doesn't match — it **composes** teams the way a producer assembles a band
- Freelancers don't bid — they **audition** with AI-generated prototypes
- Payment isn't per-project — it's **continuous creative retainer**

### Unexpected Connection

Think of how open-source works. Developers don't get hired per-task; they contribute to shared codebases and get recognized through contribution graphs. What if freelance work operated like GitHub?

### Blue Ocean Idea

The real opportunity isn't matching — it's **collective intelligence**. What if your platform:
- Groups 5 freelancers into a pod
- They share a single client relationship
- AI orchestrates handoffs
- The pod builds institutional knowledge over time

### Metaphor

Your platform should be less like Uber (match driver to rider) and more like a **session band** — musicians who've played together before, who know each other's styles, who can pick up a gig and just *know* how to make it work.

The micro-project market is too fragmented for matching. But a *pod-based creative model* for ongoing relationships? That's the real whitespace.`,

  "person-devils-advocate": `## The Case AGAINST This Startup

Let me argue the strongest case for why this should NOT be built.

### Thesis: AI-Mediated Freelance Will Erode Quality

When you insert AI between clients and freelancers, you optimize for the *transaction* at the expense of the *relationship*. The best freelance work comes from deep understanding, trust built over months, and contextual knowledge. AI matching optimizes for surface-level skill alignment, not creative chemistry.

### Historical Precedent

Every time we've automated creative matchmaking, quality has declined:
- Algorithmic music recommendations → echo chambers, no discovery
- AI dating apps → more swipes, fewer relationships
- Automated hiring tools → homogenized teams, less diversity of thought

### The Real Problem Isn't Matching

Small businesses don't struggle to *find* freelancers. They struggle to:
1. Know what they actually need (the scoping problem)
2. Communicate requirements clearly (the communication problem)
3. Evaluate quality of deliverables (the quality problem)

AI matching addresses none of these. It's solving a problem nobody has.

### What I'd Advocate Instead

Don't build a marketplace. Build a **freelancer co-pilot**:
- Help freelancers write better proposals
- Auto-generate scope documents from conversations
- Provide quality assessment tools

This serves the existing 70M freelancers rather than trying to create a new marketplace from scratch.

### Steel-Man Counter-Argument

The strongest argument FOR this idea is that current platforms (Upwork, Fiverr) are extracting excessive rent (20% fees) while providing diminishing value. If AI can deliver matching + scoping at 5% of the cost, it could win on price alone, regardless of quality. But this is a race to the bottom, not a differentiated product.`,
};

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

export function createSampleRun(prompt: string): CouncilRun {
  const now = Date.now();
  const results: PersonaResult[] = SEED_PERSONAS.filter(p => p.enabled).map((p, i) => ({
    personaId: p.id,
    personaName: p.name,
    provider: p.provider,
    model: p.model,
    status: "completed" as const,
    content: SAMPLE_RESPONSES[p.id] || "No response available.",
    tokensIn: 800 + Math.floor(Math.random() * 400),
    tokensOut: 600 + Math.floor(Math.random() * 1200),
    latencyMs: 2000 + Math.floor(Math.random() * 3000),
    cost: 0.01 + Math.random() * 0.05,
    startedAt: now + i * 200,
    completedAt: now + i * 200 + 2000 + Math.floor(Math.random() * 3000),
    citations: i === 2 ? [
      { id: "c1", source: "Statista Digital Market Outlook 2024", excerpt: "Global freelancing market: $1.5T", personaId: p.id },
      { id: "c2", source: "McKinsey State of AI in Small Business 2024", excerpt: "67% of SMBs hesitate with AI-mediated services", personaId: p.id },
      { id: "c3", source: "CB Insights Freelance Platform Report Q2 2024", excerpt: "Micro-project market underserved", personaId: p.id },
    ] : [],
  }));

  return {
    id: `run-${Date.now()}`,
    configId: "default",
    prompt,
    status: "completed",
    personaResults: results,
    judgeResult: SAMPLE_JUDGE_RESULT,
    startedAt: now,
    completedAt: now + 6000,
  };
}

export function createSampleSessions(): Session[] {
  const prompts = SAMPLE_PROMPTS;
  return prompts.map((p, i) => {
    const run = createSampleRun(p.prompt);
    const status: Session["status"] = i === 3 ? "partial" : i === 4 ? "completed" : "completed";
    return {
      id: `session-${i}`,
      title: p.prompt.slice(0, 60) + (p.prompt.length > 60 ? "..." : ""),
      prompt: p.prompt,
      configId: "default",
      configName: "Balanced Council",
      status,
      personaCount: 6,
      tokensUsed: run.personaResults.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
      totalCost: run.personaResults.reduce((s, r) => s + r.cost, 0),
      durationMs: 6000 + Math.floor(Math.random() * 2000),
      createdAt: p.createdAt,
      updatedAt: p.createdAt + 6000,
      pinned: i < 2,
      tags: [p.category.toLowerCase()],
      run,
    };
  });
}
