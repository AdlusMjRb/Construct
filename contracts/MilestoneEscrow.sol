// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INameWrapper {
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external;
}

contract MilestoneEscrow {
    struct Milestone {
        string name;
        uint256 percentage;
        bool completed;
        uint256 amount;
        uint256 completedAt;
    }

    address public owner;
    address public agent;
    address payable public payee;
    string public storageHash;
address public immutable nameWrapper;
uint256 public immutable subnameTokenId;

    Milestone[] public milestones;

    uint256 public deployedAt;
    uint256 public budget;
    uint256 public totalFunded;
    uint256 public totalReleased;
    bool public funded;

    uint256 public agentGasReserve;
    uint256 public agentPrimed;
    uint256 public constant AGENT_FEE_BPS = 500;

    event Funded(address indexed funder, uint256 escrowAmount, uint256 agentReserve, uint256 agentPrimed);
    event MilestoneCompleted(uint256 indexed milestoneId, uint256 amountReleased, address payee);
    event EscrowFullyComplete(uint256 totalReleased, address payee);
    event AgentGasRefund(address indexed agent, uint256 amount);
    event ReserveReturned(address indexed owner, uint256 amount);
event ProjectOwnershipTransferred(address indexed oldOwner, address indexed newOwner, uint256 tokenId);

    modifier onlyOwnerOrAgent() {
        require(msg.sender == owner || msg.sender == agent, "Not owner or agent");
        _;
    }

    constructor(
        string[] memory _names,
        uint256[] memory _percentages,
        address payable _payee,
        address _agent,
    string memory _storageHash,
    uint256 _budget,
    address _nameWrapper,
    uint256 _subnameTokenId
    ) payable {
        require(_names.length == _percentages.length, "Length mismatch");
        require(_names.length > 0, "No milestones");
        require(_payee != address(0), "Invalid payee");
        require(_agent != address(0), "Invalid agent");
        require(_budget > 0, "Budget must be > 0");

        uint256 total;
        for (uint256 i = 0; i < _names.length; i++) {
            milestones.push(Milestone({
                name: _names[i],
                percentage: _percentages[i],
                completed: false,
                amount: 0,
                completedAt: 0
            }));
            total += _percentages[i];
        }
        require(total == 100, "Percentages must sum to 100");

        owner = msg.sender;
        agent = _agent;
        payee = _payee;
        storageHash = _storageHash;
        budget = _budget;
        deployedAt = block.timestamp;
    nameWrapper = _nameWrapper;
    subnameTokenId = _subnameTokenId;

        if (msg.value > 0) {
            _processFunding();
        }
    }

    function _processFunding() internal {
        require(!funded, "Already funded");

        uint256 agentFee = (budget * AGENT_FEE_BPS) / 10000;
        uint256 required = budget + agentFee;
        require(msg.value >= required, "Insufficient: need budget + agent fee");

        funded = true;
        totalFunded = budget;

        uint256 primeAmount = agentFee / 2;
        uint256 reserveAmount = agentFee - primeAmount;

        agentGasReserve += reserveAmount;
        agentPrimed += primeAmount;

        if (primeAmount > 0) {
            (bool primed, ) = payable(agent).call{value: primeAmount}("");
            require(primed, "Agent priming failed");
        }

        uint256 allocated;
        for (uint256 i = 0; i < milestones.length; i++) {
            uint256 share;
            if (i == milestones.length - 1) {
                share = budget - allocated;
            } else {
                share = (budget * milestones[i].percentage) / 100;
            }
            milestones[i].amount += share;
            allocated += share;
        }

uint256 overpayment = msg.value - required;
if (overpayment > 0) {
    (bool refunded, ) = payable(msg.sender).call{value: overpayment}("");
    require(refunded, "Overpayment refund failed");
}

        emit Funded(msg.sender, budget, reserveAmount, primeAmount);
    }

    function fund() external payable {
        _processFunding();
    }

    function completeMilestone(uint256 _id) external onlyOwnerOrAgent {
        uint256 gasStart = gasleft();

        require(_id < milestones.length, "Invalid milestone");
        require(!milestones[_id].completed, "Already completed");

        Milestone storage m = milestones[_id];
        m.completed = true;
        m.completedAt = block.timestamp;

        uint256 releaseAmount = m.amount;
        if (releaseAmount > 0) {
            totalReleased += releaseAmount;
            (bool sent, ) = payee.call{value: releaseAmount}("");
            require(sent, "Payment failed");
        }

        emit MilestoneCompleted(_id, releaseAmount, payee);

        bool allDone = true;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (!milestones[i].completed) {
                allDone = false;
                break;
            }
        }

        if (allDone) {
            emit EscrowFullyComplete(totalReleased, payee);
            if (agentGasReserve > 0) {
                uint256 leftover = agentGasReserve;
                agentGasReserve = 0;
                (bool returned, ) = payable(owner).call{value: leftover}("");
                if (returned) {
                    emit ReserveReturned(owner, leftover);
                }
            }
        }

        if (msg.sender == agent && agentGasReserve > 0) {
            uint256 gasUsed = (gasStart - gasleft() + 30000) * tx.gasprice;
            uint256 refund = gasUsed > agentGasReserve ? agentGasReserve : gasUsed;
            if (refund > 0) {
                agentGasReserve -= refund;
                (bool refunded, ) = payable(agent).call{value: refund}("");
                if (refunded) {
                    emit AgentGasRefund(agent, refund);
                }
            }
        }
    }

    function transferProjectOwnership(address newOwner) external {
    require(msg.sender == owner, "Only owner");
    require(newOwner != address(0), "Invalid new owner");
    require(nameWrapper != address(0), "ENS handover not supported on this chain");

    address oldOwner = owner;
    owner = newOwner;

    INameWrapper(nameWrapper).safeTransferFrom(oldOwner, newOwner, subnameTokenId, 1, "");

    emit ProjectOwnershipTransferred(oldOwner, newOwner, subnameTokenId);
}

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 _id) external view returns (
        string memory name, uint256 percentage, bool completed, uint256 amount, uint256 completedAt
    ) {
        Milestone storage m = milestones[_id];
        return (m.name, m.percentage, m.completed, m.amount, m.completedAt);
    }

    function getEscrowBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getAgentGasReserve() external view returns (uint256) {
        return agentGasReserve;
    }

    function getRequiredFunding() external view returns (uint256) {
        return budget + (budget * AGENT_FEE_BPS) / 10000;
    }

    function isFullyComplete() external view returns (bool) {
        for (uint256 i = 0; i < milestones.length; i++) {
            if (!milestones[i].completed) return false;
        }
        return true;
    }
}