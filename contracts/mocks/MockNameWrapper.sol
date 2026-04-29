// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockNameWrapper {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata
    ) external {
        require(ownerOf[id] == from, "Not owner");
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "Not approved");
        require(amount == 1, "Bad amount");
        ownerOf[id] = to;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return ownerOf[id] == account ? 1 : 0;
    }
}