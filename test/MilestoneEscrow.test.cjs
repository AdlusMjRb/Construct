const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MilestoneEscrow", function () {
  let owner, agent, payee, funder, attacker;
  const STORAGE_HASH = "0g://test-storage-hash";
  const BUDGET = ethers.parseEther("1.0"); // 1 OG
  const AGENT_FEE_BPS = 500n; // 5%

  // helper: required funding = budget + 5% agent fee
  const requiredFunding = (budget) =>
    budget + (budget * AGENT_FEE_BPS) / 10000n;

  beforeEach(async function () {
    [owner, agent, payee, funder, attacker] = await ethers.getSigners();
  });

  // ─── helper to deploy a standard 2-milestone escrow ───
  async function deployStandard() {
    const Escrow = await ethers.getContractFactory("MilestoneEscrow");
    return Escrow.deploy(
      ["Foundation", "Walls"],
      [50, 50],
      payee.address,
      agent.address,
      STORAGE_HASH,
      BUDGET,
    );
  }

  // ════════════════════════════════════════════════════════
  describe("deployment & constructor validation", function () {
    it("deploys with valid parameters and sets all state", async function () {
      const escrow = await deployStandard();
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.agent()).to.equal(agent.address);
      expect(await escrow.payee()).to.equal(payee.address);
      expect(await escrow.storageHash()).to.equal(STORAGE_HASH);
      expect(await escrow.budget()).to.equal(BUDGET);
      expect(await escrow.funded()).to.equal(false);
      expect(await escrow.getMilestoneCount()).to.equal(2);
    });

    it("reverts when names and percentages length mismatch", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          ["A", "B"],
          [100],
          payee.address,
          agent.address,
          STORAGE_HASH,
          BUDGET,
        ),
      ).to.be.revertedWith("Length mismatch");
    });

    it("reverts when there are no milestones", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          [],
          [],
          payee.address,
          agent.address,
          STORAGE_HASH,
          BUDGET,
        ),
      ).to.be.revertedWith("No milestones");
    });

    it("reverts when payee is the zero address", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          ["A"],
          [100],
          ethers.ZeroAddress,
          agent.address,
          STORAGE_HASH,
          BUDGET,
        ),
      ).to.be.revertedWith("Invalid payee");
    });

    it("reverts when agent is the zero address", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          ["A"],
          [100],
          payee.address,
          ethers.ZeroAddress,
          STORAGE_HASH,
          BUDGET,
        ),
      ).to.be.revertedWith("Invalid agent");
    });

    it("reverts when budget is zero", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          ["A"],
          [100],
          payee.address,
          agent.address,
          STORAGE_HASH,
          0,
        ),
      ).to.be.revertedWith("Budget must be > 0");
    });

    it("reverts when percentages do not sum to 100", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      await expect(
        Escrow.deploy(
          ["A", "B"],
          [40, 50],
          payee.address,
          agent.address,
          STORAGE_HASH,
          BUDGET,
        ),
      ).to.be.revertedWith("Percentages must sum to 100");
    });

    it("getRequiredFunding returns budget + 5% agent fee", async function () {
      const escrow = await deployStandard();
      expect(await escrow.getRequiredFunding()).to.equal(
        requiredFunding(BUDGET),
      );
    });
  });

  // ════════════════════════════════════════════════════════
  describe("funding", function () {
    it("accepts funding via fund() and marks the escrow funded", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);

      await expect(escrow.connect(funder).fund({ value: required })).to.emit(
        escrow,
        "Funded",
      );

      expect(await escrow.funded()).to.equal(true);
      expect(await escrow.totalFunded()).to.equal(BUDGET);
    });

    it("reverts when funding is less than budget + agent fee", async function () {
      const escrow = await deployStandard();
      await expect(
        escrow.connect(funder).fund({ value: BUDGET }), // missing 5% fee
      ).to.be.revertedWith("Insufficient: need budget + agent fee");
    });

    it("reverts when funded twice", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      await escrow.connect(funder).fund({ value: required });
      await expect(
        escrow.connect(funder).fund({ value: required }),
      ).to.be.revertedWith("Already funded");
    });

    it("primes the agent wallet with half the agent fee", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      const agentFee = (BUDGET * AGENT_FEE_BPS) / 10000n;
      const expectedPrime = agentFee / 2n;

      const balanceBefore = await ethers.provider.getBalance(agent.address);
      await escrow.connect(funder).fund({ value: required });
      const balanceAfter = await ethers.provider.getBalance(agent.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedPrime);
      expect(await escrow.agentPrimed()).to.equal(expectedPrime);
    });

    it("holds the other half of the agent fee as gas reserve", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      const agentFee = (BUDGET * AGENT_FEE_BPS) / 10000n;
      const expectedReserve = agentFee - agentFee / 2n;

      await escrow.connect(funder).fund({ value: required });
      expect(await escrow.getAgentGasReserve()).to.equal(expectedReserve);
    });

    it("allocates milestone amounts proportionally", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      await escrow.connect(funder).fund({ value: required });

      const m0 = await escrow.getMilestone(0);
      const m1 = await escrow.getMilestone(1);
      expect(m0.amount).to.equal(BUDGET / 2n);
      expect(m1.amount).to.equal(BUDGET / 2n);
    });

    it("refunds overpayment to the funder", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      const overpayment = ethers.parseEther("0.5");

      const balanceBefore = await ethers.provider.getBalance(funder.address);
      const tx = await escrow
        .connect(funder)
        .fund({ value: required + overpayment });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(funder.address);

      // Funder should be down: required + gas, but NOT the overpayment
      const expectedSpend = required + gasCost;
      expect(balanceBefore - balanceAfter).to.equal(expectedSpend);
    });

    it("emits Funded with correct funder, escrow amount, reserve, and primed values", async function () {
      const escrow = await deployStandard();
      const required = requiredFunding(BUDGET);
      const agentFee = (BUDGET * AGENT_FEE_BPS) / 10000n;
      const primed = agentFee / 2n;
      const reserve = agentFee - primed;

      await expect(escrow.connect(funder).fund({ value: required }))
        .to.emit(escrow, "Funded")
        .withArgs(funder.address, BUDGET, reserve, primed);
    });

    it("supports funding directly in the constructor", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const required = requiredFunding(BUDGET);
      const escrow = await Escrow.deploy(
        ["A", "B"],
        [50, 50],
        payee.address,
        agent.address,
        STORAGE_HASH,
        BUDGET,
        { value: required },
      );
      expect(await escrow.funded()).to.equal(true);
    });
  });

  // ════════════════════════════════════════════════════════
  describe("completeMilestone", function () {
    let escrow;
    const required = requiredFunding(BUDGET);

    beforeEach(async function () {
      escrow = await deployStandard();
      await escrow.connect(funder).fund({ value: required });
    });

    it("releases payment to the payee when called by the owner", async function () {
      const balanceBefore = await ethers.provider.getBalance(payee.address);
      await escrow.connect(owner).completeMilestone(0);
      const balanceAfter = await ethers.provider.getBalance(payee.address);

      expect(balanceAfter - balanceBefore).to.equal(BUDGET / 2n);
    });

    it("releases payment when called by the agent", async function () {
      const balanceBefore = await ethers.provider.getBalance(payee.address);
      await escrow.connect(agent).completeMilestone(0);
      const balanceAfter = await ethers.provider.getBalance(payee.address);

      expect(balanceAfter - balanceBefore).to.equal(BUDGET / 2n);
    });

    it("reverts when called by anyone other than owner or agent", async function () {
      await expect(
        escrow.connect(attacker).completeMilestone(0),
      ).to.be.revertedWith("Not owner or agent");
    });

    it("reverts on invalid milestone id", async function () {
      await expect(
        escrow.connect(owner).completeMilestone(99),
      ).to.be.revertedWith("Invalid milestone");
    });

    it("reverts when completing a milestone twice", async function () {
      await escrow.connect(owner).completeMilestone(0);
      await expect(
        escrow.connect(owner).completeMilestone(0),
      ).to.be.revertedWith("Already completed");
    });

    it("marks the milestone as completed and stores the timestamp", async function () {
      const tx = await escrow.connect(owner).completeMilestone(0);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const m = await escrow.getMilestone(0);
      expect(m.completed).to.equal(true);
      expect(m.completedAt).to.equal(block.timestamp);
    });

    it("updates totalReleased after each completion", async function () {
      await escrow.connect(owner).completeMilestone(0);
      expect(await escrow.totalReleased()).to.equal(BUDGET / 2n);
      await escrow.connect(owner).completeMilestone(1);
      expect(await escrow.totalReleased()).to.equal(BUDGET);
    });

    it("emits MilestoneCompleted with id, amount, and payee", async function () {
      await expect(escrow.connect(owner).completeMilestone(0))
        .to.emit(escrow, "MilestoneCompleted")
        .withArgs(0, BUDGET / 2n, payee.address);
    });

    it("emits EscrowFullyComplete after the last milestone", async function () {
      await escrow.connect(owner).completeMilestone(0);
      await expect(escrow.connect(owner).completeMilestone(1))
        .to.emit(escrow, "EscrowFullyComplete")
        .withArgs(BUDGET, payee.address);
    });

    it("returns the leftover gas reserve to the owner on full completion", async function () {
      await escrow.connect(owner).completeMilestone(0);

      const reserveBefore = await escrow.getAgentGasReserve();
      const ownerBalanceBefore = await ethers.provider.getBalance(
        owner.address,
      );

      const tx = await escrow.connect(agent).completeMilestone(1);
      // ↑ called by agent so owner only receives, doesn't pay gas
      await tx.wait();

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(reserveBefore);
      expect(await escrow.getAgentGasReserve()).to.equal(0);
    });

    it("emits ReserveReturned on full completion", async function () {
      await escrow.connect(owner).completeMilestone(0);
      const reserve = await escrow.getAgentGasReserve();
      await expect(escrow.connect(owner).completeMilestone(1))
        .to.emit(escrow, "ReserveReturned")
        .withArgs(owner.address, reserve);
    });

    it("isFullyComplete reports true after all milestones complete", async function () {
      expect(await escrow.isFullyComplete()).to.equal(false);
      await escrow.connect(owner).completeMilestone(0);
      expect(await escrow.isFullyComplete()).to.equal(false);
      await escrow.connect(owner).completeMilestone(1);
      expect(await escrow.isFullyComplete()).to.equal(true);
    });
  });

  // ════════════════════════════════════════════════════════
  describe("agent gas refund", function () {
    it("refunds the agent for gas used on a non-final milestone", async function () {
      // Use a 3-milestone escrow so milestone 0 is not the final one
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const escrow = await Escrow.deploy(
        ["A", "B", "C"],
        [33, 33, 34],
        payee.address,
        agent.address,
        STORAGE_HASH,
        BUDGET,
      );
      await escrow.connect(funder).fund({ value: requiredFunding(BUDGET) });

      const reserveBefore = await escrow.getAgentGasReserve();
      await expect(escrow.connect(agent).completeMilestone(0)).to.emit(
        escrow,
        "AgentGasRefund",
      );

      const reserveAfter = await escrow.getAgentGasReserve();
      expect(reserveAfter).to.be.lt(reserveBefore);
    });

    it("does NOT refund the agent on the final milestone (reserve already returned to owner)", async function () {
      // Documents a known quirk: if the agent calls the LAST completeMilestone,
      // the reserve has already been zeroed out and returned to the owner before
      // the gas-refund check runs. The agent eats their own gas for the final tx.
      const escrow = await deployStandard();
      await escrow.connect(funder).fund({ value: requiredFunding(BUDGET) });
      await escrow.connect(owner).completeMilestone(0);

      // Final milestone called by agent
      await expect(escrow.connect(agent).completeMilestone(1)).to.not.emit(
        escrow,
        "AgentGasRefund",
      );
    });
  });

  // ════════════════════════════════════════════════════════
  describe("edge cases", function () {
    it("works with a single milestone at 100%", async function () {
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const escrow = await Escrow.deploy(
        ["Only"],
        [100],
        payee.address,
        agent.address,
        STORAGE_HASH,
        BUDGET,
      );
      await escrow.connect(funder).fund({ value: requiredFunding(BUDGET) });

      const balanceBefore = await ethers.provider.getBalance(payee.address);
      await escrow.connect(owner).completeMilestone(0);
      const balanceAfter = await ethers.provider.getBalance(payee.address);

      expect(balanceAfter - balanceBefore).to.equal(BUDGET);
      expect(await escrow.isFullyComplete()).to.equal(true);
    });

    it("handles rounding by giving the remainder to the last milestone", async function () {
      // 33 / 33 / 34 doesn't divide evenly by percentage; last one absorbs the remainder
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const escrow = await Escrow.deploy(
        ["A", "B", "C"],
        [33, 33, 34],
        payee.address,
        agent.address,
        STORAGE_HASH,
        BUDGET,
      );
      await escrow.connect(funder).fund({ value: requiredFunding(BUDGET) });

      const m0 = await escrow.getMilestone(0);
      const m1 = await escrow.getMilestone(1);
      const m2 = await escrow.getMilestone(2);

      const sum = m0.amount + m1.amount + m2.amount;
      expect(sum).to.equal(BUDGET); // every wei accounted for
    });

    it("handles many milestones (10 at 10% each)", async function () {
      const names = Array.from({ length: 10 }, (_, i) => `M${i}`);
      const pcts = Array(10).fill(10);
      const Escrow = await ethers.getContractFactory("MilestoneEscrow");
      const escrow = await Escrow.deploy(
        names,
        pcts,
        payee.address,
        agent.address,
        STORAGE_HASH,
        BUDGET,
      );
      await escrow.connect(funder).fund({ value: requiredFunding(BUDGET) });

      // Complete all 10
      for (let i = 0; i < 10; i++) {
        await escrow.connect(owner).completeMilestone(i);
      }

      expect(await escrow.totalReleased()).to.equal(BUDGET);
      expect(await escrow.isFullyComplete()).to.equal(true);
    });
  });
});
