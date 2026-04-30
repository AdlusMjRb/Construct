# AI Attribution

_ETHGlobal Open Agents requires a written disclosure of how AI was used in building each submission. This is Construct's._

---

**At build time, Claude _assisted_ the product.** It's a development collaborator, not a co-author of the architecture. The design of the system. What the three pillars are, what problem each of them solves, why the agent wallet is separate from the owner wallet, what the Trust Stack does and in what order, why this is a Paxmata product at all. Those decisions were made by me, argued through in conversation, and often in direct disagreement with Claude's initial suggestions.

The rest of this doc is about the build-time use, because that's what the attribution requirement is for. But the runtime use is the more interesting one, and it's worth being loud about it: **this project exists because LLMs are now good enough to make autonomous payment release a real architecture rather than a thought experiment.**

---

## The method: chat, not agents

I work primarily at what would be between autocomplete and agentic tooling: **chat-and-paste.** I discuss a problem in a Claude chat window, read the response carefully, often challenge it or ask for an alternative, and then paste the code I want into my own editor by hand.

This is, by most measures, less efficient than Claude Code. I know. Three reasons why i do this:

1. **Pasting forces reading.** If I'm going to copy twenty lines into my repo, I'm going to look at all twenty lines. Agentic tooling doesn't make me. I dont have a background in code and so, don't didn't understand alot of what wasz going into the editor. Over time with this methord though, I began to understand certain syntax, how function built on routes and what tests were needed.

2. **Architectural arguments need conversation, not commits.** Most of my Claude sessions on this project are not "write me this function", they're "here's the problem I'm trying to solve, what are the three architectures that would work, what are the tradeoffs."

3. **When something breaks, I want to know why.** As a solo builder, it's easy to rely on agents to produce your code. But you should really try to understand what's going on, why systems break and then, when you're asked, why you didn't lead with X you can confidantly explain that Y was the better choice.

It also produces artefacts. Every non-trivial decision in this repo has a trail of conversation behind it, a history of "I considered X, Claude pushed Y, I pushed back with Z, we landed on W." Those conversations are source material for the pitch, for the build logs, and for talking to sponsor teams at the event. Agentic tooling doesn't produce that kind of trail in the same shape.

**This is not a claim that chat-and-paste is superior.** For a codebase with 50,000 lines of existing boilerplate, Claude Code is almost certainly faster. For someone without a coding background, I prefer a slower method. Different tools for different problems.

---

## What Claude did, by layer

Being specific about this. The general pattern is: I designed, Claude implemented, I reviewed and reshaped.

**Solidity contracts** — I wrote the template for the first pass of `MilestoneEscrow.sol` with Claude's help, working through the owner/agent split, the payable constructor funding pattern, and the gas-priming split for the agent fee. Claude suggested the `onlyOwnerOrAgent` modifier pattern after I described the custody requirement; I reviewed and accepted it. Claude caught a reserve-return ordering bug during review that I would have shipped.

**Express backend** — Substantial Claude involvement in route scaffolding, the Claude API integration, the 0G Storage SDK wrapper, and the KeeperHub webhook client. I architected the route structure, the tool-use contracts with Claude, the fallback logic between KeeperHub-routed and server-wallet execution paths, and the on-chain polling pattern used to work around KeeperHub's broken status endpoint.

**React frontend** — I designed the full UI in Pixelmator Pro and Figma. Claude helped implement the three-shutter layout, the RainbowKit wallet integration, the translation system, and the verification results rendering. The design system (colours, typography, component specs) is mine.

**Trust Stack** — The concept (EXIF + C2PA + Reality Defender as three independent signals feeding one verdict) is mine. The choice of `exifr` and `@trustnxt/c2pa-ts` is mine. Claude wrote the integration code and the signal-fusion logic under instruction.

**The product strategy** — entirely mine. Construct exists because Paxmata V1 is a human-verified platform and the natural V2 question is "what if the verifier is autonomous?" That question is not an output of an LLM.

---

## What Claude did _not_ do

- Decide that the custody problem was worth solving. I identified it independently, as a UK-incorporated founder worried about FCA classification, before I had ever heard of KeeperHub. The integration is a response to a problem I already knew I had.
- Make the architectural calls. Several times during development Claude suggested shortcuts that would have undermined the product (remove the agent wallet, absorb fees into the platform, human-approve every release). I rejected them, on record, in build logs. A repeated line in my work with Claude on this project: _"every time you say we don't need to think like this for the hackathon is each time we lose."_

---

## An honest assessment

Could I have built Construct without AI assistance? No, not in this form and not in this timeframe. The runtime product, an agent that actually verifies construction photos against written criteria, is only possible because Claude Vision is good enough to do it.

Could I have built Construct with more aggressive AI tooling, Claude Code, agentic workflows, vibe-coded generation? Probably faster on the raw code-output axis, slower on everything else that matters for a hackathon: debugging my own bugs and defending my own architecture.

What I'd push back on is the framing that "AI-assisted" is a single thing. It isn't. A project that uses Claude at runtime is doing something categorically different from a project that used Claude to write its boilerplate. A founder who pastes code from a chat window after reading it is in a different relationship with the tooling than one who approves Claude Code diffs without opening the file. These distinctions are worth keeping.

---

**Alexander Burge**
Founder & CEO, Paxmata Ltd
