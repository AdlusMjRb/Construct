// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HelloZeroG {
    string public message;
    address public owner;
    uint256 public deployedAt;

    event MessageUpdated(string oldMessage, string newMessage);

    constructor(string memory _message) {
        message = _message;
        owner = msg.sender;
        deployedAt = block.timestamp;
    }

    function setMessage(string memory _newMessage) external {
        require(msg.sender == owner, "Not owner");
        string memory old = message;
        message = _newMessage;
        emit MessageUpdated(old, _newMessage);
    }

    function ping() external pure returns (bool) {
        return true;
    }
}