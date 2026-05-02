# AI Attribution

_Per ETHGlobal Open Agents 2026 rule 3.3: AI tools are permitted with clear attribution._

This document discloses how AI tools were used during the build window (24 April – 3 May 2026) and how they're used at runtime in the deployed product.

---

## At runtime: AI is the product

Construct _is_ an AI agent. AI is the planning and verification surface, that's the submission. Two distinct uses:

### Claude Sonnet — milestone planning

Endpoint: `POST /api/prepare-project`. Takes a natural-language project description and returns a structured `milestones[]` array via the Anthropic tool-use API with a forced tool call. The system prompt enforces:

- Every acceptance criterion has a machine-readable `evidence_type` (e.g. `receipt`, `geolocated_photo`, `document`, `screenshot`)
- A specific `evidence_instruction` in plain prose
- A `verification_confidence` threshold (`high` | `medium` | `low`)
- Scale-aware measurement guidance ("not just 'photo of foundation'; 'photo of foundation with a tape measure visible showing depth ≥ 900mm'")
- Adversarial anticipation ("if the instruction asks for a receipt, specify which vendor, what date range, and what amount")

Free-form text responses are not accepted. The model is constrained by tool schema.

### Claude Vision — evidence verification

Endpoint: `POST /api/verify-evidence`. Receives the milestone acceptance criteria, the Trust Stack output (EXIF, C2PA, Reality Defender, pricing oracle), and the evidence images. Returns a structured verdict via tool use with fields: `verdict` (`APPROVE` | `ESCALATE`), `confidence`, per-`criteria_check[]` assessment, `reasoning`, `provenance_assessment`, `pricing_assessment`.

If Reality Defender flags an image above 70% AI probability, Claude is instructed to escalate regardless of its own visual assessment. Provenance signals inform confidence but don't override hard fraud signals.

### Claude — translation

Endpoints: `POST /api/translate-spec`, `POST /api/translate-verification`. Translates display copies of milestone specs and verification reasoning across six languages (English, Ukrainian, Arabic, Spanish, French, Swahili). Canonical state — what the contract enforces and the agent reads — is never translated. Translations are display-only.

### Models used

| Model               | Use                                        | Endpoint      |
| ------------------- | ------------------------------------------ | ------------- |
| `claude-sonnet-4-5` | Planning, vision verification, translation | Anthropic API |

The model ID is configurable via environment variable. All Claude calls use schema-constrained tool use, no free-form generation in production paths.

---

## During the build

The hackathon allows AI coding tools with clear attribution. Construct used them — extensively and openly.

### Claude (Anthropic, Sonnet 4.5/4.6/4.7)

The primary coding partner. Used via the Claude Projects interface for:

- **Architecture discussions** — every major design decision (custody model, agent role split, repoint vs ownership transfer, fee structure, language layer separation) was reasoned through in conversation before implementation
- **Code generation** — backend routes, smart contract logic, frontend state machines, KeeperHub webhook integration, ENS resolver wiring, the full Trust Stack implementation
- **Debugging** — RPC indexing lag handling, WalletConnect session corruption, 0G Storage SDK quirks, KeeperHub self-host bugs (including a database-level recovery via SQL when the UI broke)
- **Documentation** — this doc, the architecture write-up, the demo talking points, the KeeperHub feedback report

Working style: every architectural choice was challenged, not accepted. The recurring stance throughout the build: _"every time you say we don't need to think like this for the hackathon is each time we lose."_ When Claude suggested a hackathon shortcut that compromised the production architecture, the suggestion was rejected. When Claude offered a workaround (hardcoded values, custody held by the platform, fees absorbed instead of shown transparently), the workaround was rejected. The architecture you see is the result of those iterations.

Claude was _not_ used to:

- Write or generate prompts that bypass other AI systems
- Generate fake test data, fake on-chain results, or fake screenshots
- Produce content claiming to be from real, named individuals
- Bypass review of any production-bound code or smart contract logic

All smart contract code, every KeeperHub workflow, and every cross-chain integration was reviewed line-by-line before deployment.

### Claude Code (Anthropic)

Not used.

### GitHub Copilot

Not used.

### Cursor

Not used.

---

### Reused libraries

Standard open-source libraries were used as permitted by rule 3.3 ("open-source libraries and starter kits are permitted, but be transparent about what's reused"):

| Library                            | Version | Use                                        |
| ---------------------------------- | ------- | ------------------------------------------ |
| `@0gfoundation/0g-ts-sdk`          | 1.2.1   | 0G Storage upload + download               |
| `@anthropic-ai/sdk`                | latest  | Claude API client                          |
| `@trustnxt/c2pa-ts`                | latest  | C2PA content credential verification       |
| `@realitydefender/realitydefender` | latest  | AI-generation detection                    |
| `exifr`                            | latest  | EXIF metadata extraction                   |
| `ethers`                           | 6.13.1  | 0G Chain interaction                       |
| `viem` + `wagmi` v2                | latest  | Sepolia interaction + frontend wallet      |
| `@rainbow-me/rainbowkit`           | latest  | Wallet connect UI                          |
| OpenZeppelin Contracts             | 5.x     | Solidity utilities (ReentrancyGuard, etc.) |

No starter kits or scaffolds were used. The contract, backend, and frontend were all written from scratch within the build window, with Claude as the coding partner and the human (Alexander Burge) as the architect, reviewer, and final decision-maker on every line.

---

_— Alexander Burge, 30 April 2026._
